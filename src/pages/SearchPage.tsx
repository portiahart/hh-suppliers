import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { supabase, suppliersQuery } from '../lib/supabase'
import type { Supplier } from '../types/supplier'

/* ─── Types ──────────────────────────────────────────────── */

interface TopSupplierRow {
  id: string
  nombre: string
  nit: string
  gasto: number
  entities: Array<{ entity: string; amount_cop: number }>
}

type TxRow = {
  nit: string | null
  importe_cop: string | number
  empresa: string | null
}

const ENTITY_COLORS: Record<string, { bg: string; text: string }> = {
  BA: { bg: '#566778', text: '#fff' },
  TH: { bg: '#B9484E', text: '#fff' },
  PM: { bg: '#FC0083', text: '#fff' },
  GA: { bg: '#98B250', text: '#658D5E' },
  NC: { bg: '#EAB955', text: '#B9484E' },
  MO: { bg: '#000000', text: '#fff' },
  HH: { bg: '#0f172a', text: '#F2F5F8' },
  MA: { bg: '#0f172a', text: '#F2F5F8' },
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

function supplierDisplayName(razonSocial: string | null | undefined, nombreOperativo: string | null | undefined): string {
  const legal = razonSocial || ''
  return nombreOperativo && nombreOperativo !== legal ? `${legal} (${nombreOperativo})` : legal
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

  // Raw fetched data
  const [allTx, setAllTx]   = useState<TxRow[]>([])

  // Loading/error
  const [loadingTop, setLoadingTop]   = useState(true)
  const [topError, setTopError]       = useState(false)

  // Top 20 results (async)
  const [topSuppliers, setTopSuppliers] = useState<TopSupplierRow[]>([])
  const [assessments, setAssessments]   = useState<Map<string, boolean | null>>(new Map())

  /* ── Typeahead search ─────────────────────────────────── */
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    setSearching(true)
    void (async () => {
      const term = debouncedQuery.trim()
      const cleanNit = term.replace(/\D/g, '')
      const filters = [
        `razon_social.ilike.%${term}%`,
        `nombre_operativo.ilike.%${term}%`,
        ...(cleanNit.length > 0 ? [`nit.ilike.%${cleanNit}%`] : []),
      ]
      const { data } = await suppliersQuery('id, razon_social, nombre_operativo, nit')
        .or(filters.join(','))
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

  /* ── Fetch TX rows from accounts_bancos (Banco Colombia payments) ── */
  const fetchAllTx = useCallback(async () => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 60)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const PAGE = 1000
    const all: TxRow[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('accounts_bancos')
        .select('nit, importe_cop, empresa')
        .gte('fecha_operacion', cutoffStr)
        .not('nit', 'is', null)
        .range(from, from + PAGE - 1)
      if (error) { setTopError(true); setLoadingTop(false); return }
      if (!data || data.length === 0) break
      all.push(...(data as unknown as TxRow[]))
      if (data.length < PAGE) break
    }
    setAllTx(all)
  }, [])

  useEffect(() => { void fetchAllTx() }, [fetchAllTx])

  const computeTop20 = useCallback(async (txRows: TxRow[]) => {
    setLoadingTop(true)
    setTopError(false)

    const grouped = new Map<string, { total: number; entityTotals: Map<string, number> }>()
    for (const r of txRows) {
      if (!r.nit) continue
      const amount = Number(r.importe_cop ?? 0)
      if (!amount) continue

      const g = grouped.get(r.nit) ?? { total: 0, entityTotals: new Map() }
      g.total += amount

      if (r.empresa) {
        g.entityTotals.set(r.empresa, (g.entityTotals.get(r.empresa) ?? 0) + amount)
      }

      grouped.set(r.nit, g)
    }

    const top20nits = Array.from(grouped.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 20)
      .map(([nit]) => nit)

    if (top20nits.length === 0) { setTopSuppliers([]); setLoadingTop(false); return }

    const { data: suppData } = await supabase
      .from('accounts_suppliers')
      .select('id, razon_social, nombre_operativo, nit')
      .in('nit', top20nits)

    const nitToSupplier = new Map(
      ((suppData ?? []) as { id: string; razon_social: string | null; nombre_operativo: string | null; nit: string }[])
        .map(s => [s.nit, s])
    )

    const rows: TopSupplierRow[] = top20nits.map(nit => {
      const g = grouped.get(nit)!
      const supplier = nitToSupplier.get(nit)
      return {
        id: supplier?.id ?? '',
        nombre: supplier ? supplierDisplayName(supplier.razon_social, supplier.nombre_operativo) : nit,
        nit,
        gasto: g.total,
        entities: Array.from(g.entityTotals.entries())
          .map(([entity, amount_cop]) => ({ entity, amount_cop }))
          .sort((a, b) => b.amount_cop - a.amount_cop),
      }
    })

    setTopSuppliers(rows)

    const ids = rows.map(r => r.id).filter(Boolean)
    if (ids.length > 0) {
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

  useEffect(() => {
    if (allTx.length === 0) return
    void computeTop20(allTx)
  }, [allTx, computeTop20])

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>

      {/* ── Section 1: Hero search ──────────────────────── */}
      <section>
        <h1 style={pageTitleStyle}>Proveedores</h1>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div ref={searchRef} style={{ position: 'relative', flex: '1 1 0', minWidth: 0, maxWidth: 640 }}>

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
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 400, color: 'var(--hh-dark)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {supplierDisplayName(s.razon_social, s.nombre_operativo)}
                    </span>
                    {s.nit && (
                      <span style={{ fontSize: '0.75rem', fontWeight: 300, color: 'var(--hh-haze)', flexShrink: 0 }}>
                        {s.nit}
                      </span>
                    )}
                  </span>
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

        </div>{/* end flex row */}

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

      {/* ── Section 2: Top 20 ───────────────────────────── */}
      <section>
        <h2 style={sectionHeadingStyle}>
          Top 20 · Últimos 60 días
          <span style={{ marginLeft: 10, fontSize: '0.75rem', fontWeight: 400, color: 'var(--hh-haze)', fontFamily: 'var(--font-body)', fontStyle: 'normal' }}>
            pagos via Banco Colombia
          </span>
        </h2>

        <div style={tableCardStyle}>
          <table className="hh-table">
            <thead>
              <tr>
                <Th align="left">Nombre</Th>
                <Th align="left">Entidades</Th>
                <Th align="left">Evaluación</Th>
                <Th align="right">Gasto 60d</Th>
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
                      Sin datos de gasto en los últimos 60 días.
                    </span>
                  </td>
                </tr>
              ) : (
                topSuppliers.map((row) => {
                  const assessment = assessments.has(row.id) ? assessments.get(row.id) : undefined
                  return (
                    <tr
                      key={row.nit}
                                         >
                      <td>
                        {row.id ? (
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
                        ) : (
                          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-dark)' }}>
                            {row.nombre}
                          </span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {row.entities.map(e => (
                            <EntityPill key={e.entity} entity={e.entity} amount={e.amount_cop} />
                          ))}
                        </div>
                      </td>
                      <td>
                        <AssessmentBadge pass={assessment} />
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCOP(row.gasto)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--hh-haze)' }}>—</td>
                      <td>
                        {row.id ? (
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
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--hh-haze)' }}>Sin perfil</span>
                        )}
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

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th style={{ textAlign: align }}>
      {children}
    </th>
  )
}

function AssessmentBadge({ pass }: { pass: boolean | null | undefined }) {
  if (pass === true) {
    return (
      <span style={{
        display: 'inline-block', padding: '2px 10px', borderRadius: 99,
        background: 'rgba(101,141,94,0.12)', color: '#4a8044', fontSize: '0.75rem', fontWeight: 500,
      }}>
        Aprobado
      </span>
    )
  }
  if (pass === false) {
    return (
      <span style={{
        display: 'inline-block', padding: '2px 10px', borderRadius: 99,
        background: 'rgba(252,0,131,0.08)', color: 'var(--hh-mango)', fontSize: '0.75rem', fontWeight: 500,
      }}>
        No aprobado
      </span>
    )
  }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 99,
      background: 'rgba(122,145,165,0.12)', color: 'var(--hh-haze)', fontSize: '0.75rem', fontWeight: 400,
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
        <td key={i}>
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
