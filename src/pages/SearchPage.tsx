import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { supabase } from '../lib/supabase'
import type { Supplier } from '../types/supplier'

/* ─── Types ──────────────────────────────────────────────── */

interface TopSupplierRow {
  id: string
  nombre: string
  gasto_2024: number
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
      const { data } = await supabase
        .from('accounts_suppliers')
        .select('id, name, razon_social, nit')
        .or(`name.ilike.%${debouncedQuery}%,razon_social.ilike.%${debouncedQuery}%,nit.ilike.%${debouncedQuery}%`)
        .limit(8)
      setSuggestions((data as Supplier[]) ?? [])
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

  /* ── Top 20 by spend (2024) ───────────────────────────── */
  const fetchTop20 = useCallback(async () => {
    setLoadingTop(true)
    setTopError(false)
    const { data, error } = await supabase
      .from('suppliers_spend')
      .select('supplier_id, amount_cop, accounts_suppliers!inner(id, name, razon_social)')
      .eq('year', 2024)
      .order('amount_cop', { ascending: false })
      .limit(20)

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
    const rows: TopSupplierRow[] = (data as unknown as SpendRow[]).map(r => {
      const s = Array.isArray(r.accounts_suppliers) ? r.accounts_suppliers[0] : r.accounts_suppliers
      return {
        id: s.id,
        nombre: s.razon_social || s.name,
        gasto_2024: r.amount_cop,
      }
    })
    setTopSuppliers(rows)

    // Fetch assessments for these suppliers
    if (rows.length > 0) {
      const ids = rows.map(r => r.id)
      const { data: aData } = await supabase
        .from('suppliers_assessment')
        .select('supplier_id, pass')
        .in('supplier_id', ids)
      const map = new Map<string, boolean | null>()
      ;(aData as Assessment[] ?? []).forEach(a => map.set(a.supplier_id, a.pass))
      setAssessments(map)
    }
    setLoadingTop(false)
  }, [])

  useEffect(() => { void fetchTop20() }, [fetchTop20])

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── Section 1: Header bar ───────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <h1 style={pageTitleStyle}>Proveedores</h1>

        {/* Typeahead search */}
        <div ref={searchRef} style={{ position: 'relative', width: 300, marginLeft: 'auto' }}>
          <MagnifyingGlassIcon
            width={15}
            height={15}
            style={{
              position: 'absolute',
              left: 12,
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
            onChange={e => { setQuery(e.target.value); setShowDropdown(false) }}
            onFocus={() => { if (suggestions.length) setShowDropdown(true) }}
            placeholder="Buscar proveedor o NIT…"
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              fontFamily: 'var(--font-body)',
              fontWeight: 300,
              fontSize: '0.8125rem',
              color: 'var(--hh-dark)',
              background: 'var(--hh-white)',
              border: '1px solid rgba(122,145,165,0.4)',
              borderRadius: 6,
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocusCapture={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
            onBlurCapture={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
          />

          {/* Dropdown */}
          {showDropdown && suggestions.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                background: 'var(--hh-white)',
                border: '1px solid rgba(122,145,165,0.25)',
                borderRadius: 6,
                boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
                zIndex: 50,
                overflow: 'hidden',
              }}
            >
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
                    padding: '9px 14px',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid rgba(122,145,165,0.1)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-body)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--hh-ice)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                >
                  <span style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 400, color: 'var(--hh-dark)' }}>
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
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
                background: 'var(--hh-white)',
                border: '1px solid rgba(122,145,165,0.25)',
                borderRadius: 6,
                padding: '12px 14px',
                zIndex: 50,
              }}
            >
              <span style={{ fontSize: '0.8125rem', color: 'var(--hh-haze)', fontFamily: 'var(--font-body)' }}>
                Sin resultados
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate('/new')}
          style={{
            background: 'var(--hh-teal)',
            color: '#fff',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '0.8125rem',
            border: 'none',
            borderRadius: 6,
            padding: '8px 16px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          + Nuevo Proveedor
        </button>
      </div>

      {/* ── Section 2: Top 20 ───────────────────────────── */}
      <section>
        <h2 style={sectionHeadingStyle}>Top 20 · Gasto 2024</h2>

        <div style={tableCardStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(122,145,165,0.2)' }}>
                <Th align="left">Nombre</Th>
                <Th align="left">Evaluación</Th>
                <Th align="right">Gasto 2024</Th>
                <Th align="right">Pendiente</Th>
                <Th align="left">Zona de proveedor</Th>
              </tr>
            </thead>
            <tbody>
              {loadingTop ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonRow key={i} cols={5} even={i % 2 === 1} />
                ))
              ) : topError ? (
                <tr>
                  <td colSpan={5} style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic', fontSize: '1rem', color: 'var(--hh-haze)' }}>
                      No se pudieron cargar los datos de gasto.
                    </span>
                    <br />
                    <span style={{ fontSize: '0.75rem', color: 'var(--hh-haze)', fontFamily: 'var(--font-body)' }}>
                      Asegúrate de que la función <code>get_top_suppliers_60d</code> esté creada en Supabase.
                    </span>
                  </td>
                </tr>
              ) : topSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic', fontSize: '1rem', color: 'var(--hh-haze)' }}>
                      Sin transacciones en los últimos 60 días.
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
                      {/* Nombre */}
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

                      {/* Evaluación */}
                      <td style={tdStyle}>
                        <AssessmentBadge pass={assessment} />
                      </td>

                      {/* Gasto 60d */}
                      <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCOP(row.gasto_2024)}
                      </td>

                      {/* Pendiente */}
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--hh-haze)' }}>—</td>

                      {/* Zona proveedor */}
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

      {/* ── Section 3: Facturas Vencidas ────────────────── */}
      <section>
        <div
          style={{
            background: 'var(--hh-white)',
            border: '1px solid rgba(122,145,165,0.2)',
            borderRadius: 8,
            padding: '28px 32px',
          }}
        >
          <h2 style={sectionHeadingStyle}>Facturas Vencidas</h2>
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: '0.875rem',
            color: 'var(--hh-haze)',
            margin: 0,
            lineHeight: 1.65,
          }}>
            Próximamente — integración con módulo de facturación.
          </p>
        </div>
      </section>

    </div>
  )
}

/* ─── Sub-components ─────────────────────────────────────── */

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
  margin: 0,
  flexShrink: 0,
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
