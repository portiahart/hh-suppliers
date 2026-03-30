import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MagnifyingGlassIcon,
  CheckCircledIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@radix-ui/react-icons'
import { supabase, suppliersQuery } from '../lib/supabase'
import type { Supplier } from '../types/supplier'

/* ─── Types ──────────────────────────────────────────────── */

interface TopSupplierRow {
  id: string
  nombre: string
  gasto_2025: number
  entities: Array<{ entity: string; amount_cop: number }>
}

const ENTITY_COLORS: Record<string, { bg: string; text: string }> = {
  BA: { bg: '#566778', text: '#fff' },
  TH: { bg: '#B9484E', text: '#fff' },
  PM: { bg: '#FC0083', text: '#fff' },
  GA: { bg: '#98B250', text: '#658D5E' },
  NC: { bg: '#EAB955', text: '#B9484E' },
  MO: { bg: '#000000', text: '#fff' },
  HH: { bg: '#1F2D3D', text: '#F2F5F8' },
  MA: { bg: '#1F2D3D', text: '#F2F5F8' },
}

interface Assessment {
  supplier_id: string
  pass: boolean | null
}

/* ─── Helpers ────────────────────────────────────────────── */

function useDebounce<T>(value: T, delay: number): T {
  const [dv, setDv] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return dv
}

function formatCOP(amount: number): string {
  return '$' + Math.round(amount).toLocaleString('es-CO')
}

/* ─── SearchPage ─────────────────────────────────────────── */

export function SearchPage() {
  const navigate = useNavigate()

  // Typeahead state
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Supplier[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searching, setSearching] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebounce(query, 250)

  // Top 20 state
  const [topSuppliers, setTopSuppliers] = useState<TopSupplierRow[]>([])
  const [assessments, setAssessments] = useState<Map<string, boolean | null>>(new Map())
  const [loadingTop, setLoadingTop] = useState(true)
  const [topError, setTopError] = useState(false)

  /* ── Typeahead search ─────────────────────────────────── */
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    setSearching(true)
    void (async () => {
      const { data } = await suppliersQuery('id, name, razon_social, nit')
        .or(`name.ilike.%${debouncedQuery}%,razon_social.ilike.%${debouncedQuery}%,nit.ilike.%${debouncedQuery}%`)
        .limit(8)
      setSuggestions((data as unknown as Supplier[]) ?? [])
      setShowDropdown(true)
      setSearching(false)
    })()
  }, [debouncedQuery])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ── Top 20 by spend (2025) ───────────────────────────── */
  const fetchTop20 = useCallback(async () => {
    setLoadingTop(true)
    setTopError(false)

    // Query 1 — totals: all 2025 monthly rows, group in JS by supplier_id
    const { data, error } = await supabase
      .from('suppliers_spend_monthly')
      .select('supplier_id, amount_cop, accounts_suppliers!inner(id, name, razon_social)')
      .eq('year', 2025)
      .not('accounts_suppliers.name', 'ilike', 'X -%')

    if (error || !data) {
      setTopError(true)
      setLoadingTop(false)
      return
    }

    type SpendRow = {
      supplier_id: string
      amount_cop: number
      accounts_suppliers: { id: string; name: string; razon_social: string | null } | { id: string; name: string; razon_social: string | null }[]
    }

    const grouped = new Map<string, TopSupplierRow>()
    for (const r of data as unknown as SpendRow[]) {
      const s = Array.isArray(r.accounts_suppliers) ? r.accounts_suppliers[0] : r.accounts_suppliers
      const existing = grouped.get(r.supplier_id)
      if (existing) {
        existing.gasto_2025 += r.amount_cop
      } else {
        grouped.set(r.supplier_id, { id: s.id, nombre: s.razon_social || s.name, gasto_2025: r.amount_cop, entities: [] })
      }
    }
    const rows = Array.from(grouped.values())
      .sort((a, b) => b.gasto_2025 - a.gasto_2025)
      .slice(0, 20)

    // Query 2 — entity breakdown for the top 20 supplier IDs
    const top20ids = rows.map(r => r.id)
    if (top20ids.length > 0) {
      type EntityRow = { supplier_id: string; entity: string; amount_cop: number }
      const { data: eData } = await supabase
        .from('suppliers_spend_monthly')
        .select('supplier_id, entity, amount_cop')
        .eq('year', 2025)
        .in('supplier_id', top20ids)

      if (eData) {
        // Group by supplier_id → entity, summing monthly amounts
        const entityMap = new Map<string, Map<string, number>>()
        for (const e of eData as EntityRow[]) {
          const byEntity = entityMap.get(e.supplier_id) ?? new Map<string, number>()
          byEntity.set(e.entity, (byEntity.get(e.entity) ?? 0) + e.amount_cop)
          entityMap.set(e.supplier_id, byEntity)
        }
        for (const row of rows) {
          const byEntity = entityMap.get(row.id)
          row.entities = byEntity
            ? Array.from(byEntity.entries()).map(([entity, amount_cop]) => ({ entity, amount_cop }))
            : []
        }
      }
    }

    setTopSuppliers(rows)

    // Assessments for top 20
    if (top20ids.length > 0) {
      const { data: aData } = await supabase
        .from('suppliers_assessment')
        .select('supplier_id, pass')
        .in('supplier_id', top20ids)
      const map = new Map<string, boolean | null>()
      ;(aData as Assessment[] ?? []).forEach(a => map.set(a.supplier_id, a.pass))
      setAssessments(map)
    }
    setLoadingTop(false)
  }, [])

  useEffect(() => { void fetchTop20() }, [fetchTop20])

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>

      {/* ── Section 1: Hero search ──────────────────────── */}
      <section>
        <h1 style={pageTitleStyle}>Proveedores</h1>

        <div ref={searchRef} style={{ position: 'relative', maxWidth: 640 }}>
          <MagnifyingGlassIcon
            width={18}
            height={18}
            style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              color: searching ? 'var(--hh-teal)' : 'var(--hh-haze)',
              pointerEvents: 'none',
              transition: 'color 0.15s',
            }}
          />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => { if (suggestions.length) setShowDropdown(true) }}
            placeholder="Buscar proveedor por nombre o NIT…"
            style={{
              width: '100%',
              padding: '14px 16px 14px 46px',
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: '1rem',
              color: 'var(--hh-dark)',
              background: 'var(--hh-white)',
              border: '1px solid rgba(122,145,165,0.4)',
              borderRadius: 8,
              outline: 'none',
              boxSizing: 'border-box',
              boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
            onFocusCapture={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
            onBlurCapture={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
          />

          {/* Dropdown */}
          {showDropdown && suggestions.length > 0 && (
            <div style={dropdownStyle}>
              {suggestions.map(s => (
                <button
                  key={s.id}
                  onMouseDown={() => {
                    setShowDropdown(false)
                    setQuery('')
                    navigate(`/suppliers/${s.id}`)
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 16px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(122,145,165,0.1)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--hh-ice)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ display: 'block', fontSize: '0.875rem', fontWeight: 400, color: 'var(--hh-dark)' }}>
                    {s.razon_social || s.name}
                  </span>
                  {s.nit && (
                    <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 300, color: 'var(--hh-haze)', marginTop: 1 }}>
                      NIT {s.nit}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {showDropdown && query.trim() && suggestions.length === 0 && !searching && (
            <div style={{ ...dropdownStyle, padding: '12px 16px' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--hh-haze)', fontFamily: 'var(--font-body)' }}>
                Sin resultados
              </span>
            </div>
          )}
        </div>

        {/* Sub-hint */}
        <p style={{ margin: '10px 0 0', fontSize: '0.8125rem', color: 'var(--hh-haze)', fontWeight: 300 }}>
          ¿No encuentras el proveedor?{' '}
          <button
            onClick={() => navigate('/new')}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              fontFamily: 'var(--font-body)',
              fontSize: '0.8125rem',
              fontWeight: 400,
              color: 'var(--hh-teal)',
              cursor: 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
            }}
          >
            Agregar nuevo proveedor →
          </button>
        </p>
      </section>

      {/* ── Section 2: Action cards ──────────────────────── */}
      <section>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
        }}>
          <ActionCard
            icon={<CheckCircledIcon width={20} height={20} />}
            title="Facturas Aprobadas"
            accent="var(--hh-teal)"
          />
          <ActionCard
            icon={<ClockIcon width={20} height={20} />}
            title="Facturas Pendiente Aprobación"
            accent="var(--hh-lemon)"
          />
          <ActionCard
            icon={<ExclamationTriangleIcon width={20} height={20} />}
            title="Cartera Vencida — Facturas por Pagar Urgente"
            accent="var(--hh-mango)"
          />
        </div>
      </section>

      {/* ── Section 3: Top 20 ───────────────────────────── */}
      <section>
        <h2 style={sectionHeadingStyle}>Top 20 · Gasto 2025</h2>

        <div style={tableCardStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(122,145,165,0.2)' }}>
                <Th align="left">Nombre</Th>
                <Th align="left">Entidades</Th>
                <Th align="left">Evaluación</Th>
                <Th align="right">Gasto 2025</Th>
                <Th align="right">Pendiente</Th>
                <Th align="left">Zona de proveedor</Th>
              </tr>
            </thead>
            <tbody>
              {loadingTop ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} cols={6} even={i % 2 === 1} />
                ))
              ) : topError ? (
                <tr>
                  <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic', fontSize: '1rem', color: 'var(--hh-haze)' }}>
                      No se pudieron cargar los datos de gasto.
                    </span>
                  </td>
                </tr>
              ) : topSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic', fontSize: '1rem', color: 'var(--hh-haze)' }}>
                      Sin datos de gasto para 2024.
                    </span>
                  </td>
                </tr>
              ) : (
                topSuppliers.map((row, idx) => {
                  const assessment = assessments.has(row.id) ? assessments.get(row.id) : undefined
                  return (
                    <tr
                      key={row.id}
                      style={{ background: idx % 2 === 1 ? 'var(--hh-ice)' : 'var(--hh-white)' }}
                    >
                      <td style={tdStyle}>
                        <button
                          onClick={() => navigate(`/suppliers/${row.id}`)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            fontFamily: 'var(--font-body)',
                            fontWeight: 400,
                            fontSize: '0.875rem',
                            color: 'var(--hh-dark)',
                            cursor: 'pointer',
                            textAlign: 'left',
                            textDecoration: 'underline',
                            textDecorationColor: 'rgba(122,145,165,0.4)',
                            textUnderlineOffset: 3,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--hh-teal)' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--hh-dark)' }}
                        >
                          {row.nombre}
                        </button>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {row.entities
                            .filter(e => e.amount_cop > 0)
                            .sort((a, b) => b.amount_cop - a.amount_cop)
                            .map(e => (
                              <EntityPill key={e.entity} entity={e.entity} amount={e.amount_cop} />
                            ))}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <AssessmentBadge pass={assessment} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCOP(row.gasto_2025)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--hh-haze)' }}>—</td>
                      <td style={tdStyle}>
                        <button
                          onClick={() => navigate(`/suppliers/${row.id}`)}
                          style={{
                            background: 'rgba(74,155,142,0.1)',
                            border: '1px solid rgba(74,155,142,0.3)',
                            color: 'var(--hh-teal)',
                            fontFamily: 'var(--font-body)',
                            fontWeight: 500,
                            fontSize: '0.75rem',
                            padding: '4px 10px',
                            borderRadius: 4,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Acceder →
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────── */

function EntityPill({ entity, amount }: { entity: string; amount: number }) {
  const [show, setShow] = useState(false)
  const color = ENTITY_COLORS[entity.toUpperCase()] ?? { bg: 'var(--hh-haze)', text: '#fff' }
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{
          display: 'inline-block',
          padding: '2px 7px',
          borderRadius: 99,
          background: color.bg,
          color: color.text,
          fontSize: '0.6875rem',
          fontWeight: 500,
          letterSpacing: '0.05em',
          cursor: 'default',
          userSelect: 'none',
        }}
      >
        {entity.toUpperCase()}
      </span>
      {show && (
        <span style={{
          position: 'absolute',
          bottom: 'calc(100% + 5px)',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--hh-dark)',
          color: 'var(--hh-ice)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.6875rem',
          fontWeight: 400,
          padding: '4px 8px',
          borderRadius: 4,
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          zIndex: 100,
        }}>
          {formatCOP(amount)}
        </span>
      )}
    </span>
  )
}

function ActionCard({
  icon,
  title,
  accent,
}: {
  icon: React.ReactNode
  title: string
  accent: string
}) {
  return (
    <div
      style={{
        background: 'var(--hh-white)',
        border: '1px solid rgba(122,145,165,0.2)',
        borderLeft: `4px solid ${accent}`,
        borderRadius: 8,
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ color: accent, flexShrink: 0 }}>{icon}</span>
        <span style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 500,
          fontSize: '0.8125rem',
          color: 'var(--hh-dark)',
          lineHeight: 1.3,
        }}>
          {title}
        </span>
      </div>
      <p style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 300,
        fontSize: '0.8125rem',
        color: 'var(--hh-haze)',
        margin: 0,
      }}>
        Próximamente
      </p>
    </div>
  )
}

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th style={{
      fontFamily: 'var(--font-body)',
      fontWeight: 500,
      fontSize: '0.6875rem',
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      color: 'var(--hh-haze)',
      textAlign: align,
      padding: '11px 16px',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </th>
  )
}

function AssessmentBadge({ pass }: { pass: boolean | null | undefined }) {
  if (pass === true) {
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 99,
        background: 'rgba(101,141,94,0.12)',
        color: '#4a8044',
        fontSize: '0.75rem',
        fontWeight: 500,
      }}>
        Aprobado
      </span>
    )
  }
  if (pass === false) {
    return (
      <span style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 99,
        background: 'rgba(252,0,131,0.08)',
        color: 'var(--hh-mango)',
        fontSize: '0.75rem',
        fontWeight: 500,
      }}>
        No aprobado
      </span>
    )
  }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 99,
      background: 'rgba(122,145,165,0.12)',
      color: 'var(--hh-haze)',
      fontSize: '0.75rem',
      fontWeight: 400,
    }}>
      Pendiente
    </span>
  )
}

function SkeletonRow({ cols, even }: { cols: number; even: boolean }) {
  const shimmer: React.CSSProperties = {
    background: 'linear-gradient(90deg, rgba(122,145,165,0.1) 25%, rgba(122,145,165,0.2) 50%, rgba(122,145,165,0.1) 75%)',
    backgroundSize: '200% 100%',
    borderRadius: 4,
    animation: 'shimmer 1.4s infinite',
    height: 13,
    display: 'inline-block',
  }
  const widths = [160, 72, 90, 60, 64]
  return (
    <tr style={{ background: even ? 'var(--hh-ice)' : 'var(--hh-white)' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={tdStyle}>
          <span style={{ ...shimmer, width: widths[i] ?? 80 }} />
        </td>
      ))}
    </tr>
  )
}

/* ─── Style constants ────────────────────────────────────── */

const pageTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  fontSize: '0.875rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--hh-dark)',
  margin: '0 0 16px',
}

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 300,
  fontSize: '1.0625rem',
  color: 'var(--hh-dark)',
  margin: '0 0 14px',
}

const tableCardStyle: React.CSSProperties = {
  background: 'var(--hh-white)',
  borderRadius: 8,
  border: '1px solid rgba(122,145,165,0.2)',
  overflow: 'hidden',
}

const tdStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 400,
  fontSize: '0.875rem',
  color: 'var(--hh-dark)',
  padding: '11px 16px',
  borderBottom: '1px solid rgba(122,145,165,0.08)',
}

const dropdownStyle: React.CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 4px)',
  left: 0,
  right: 0,
  background: 'var(--hh-white)',
  border: '1px solid rgba(122,145,165,0.25)',
  borderRadius: 8,
  boxShadow: '0 4px 20px rgba(0,0,0,0.10)',
  zIndex: 50,
  overflow: 'hidden',
}
