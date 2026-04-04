import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MagnifyingGlassIcon,
  CheckCircledIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  Cross2Icon,
} from '@radix-ui/react-icons'
import { supabase, suppliersQuery } from '../lib/supabase'
import type { Supplier } from '../types/supplier'
import { PendingApprovalsModal } from '../components/PendingApprovalsModal'

/* ─── Types ──────────────────────────────────────────────── */

interface TopSupplierRow {
  id: string
  nombre: string
  nit: string
  gasto: number
  entities: Array<{ entity: string; amount_cop: number }>
}

interface CppInvoice {
  importe_cop: string | number
  aprobado: string | null
  fecha_vencimiento: string | null
  proveedor: string | null
  empresa: string | null
  empresa_split: Array<{ code: string; pct: number; importe_cop_allocated?: number }> | null
  concepto: string | null
  centro_costo: string | null
}

type TxRow = {
  nit: string | null
  importe_cop: string | number
  empresa: string | null
  empresa_split: Array<{ code: string; pct: number; importe_cop_allocated: number }> | null
}

interface CardData {
  count: number
  total: number
  rows: CppInvoice[]
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

function matchesCompany(r: CppInvoice | TxRow, company: string | null): boolean {
  if (!company) return true
  if (r.empresa?.toUpperCase() === company) return true
  if (r.empresa_split?.some(s => s.code.toUpperCase() === company)) return true
  return false
}

function allocatedAmount(r: CppInvoice | TxRow, company: string | null): number {
  const full = Number(r.importe_cop ?? 0)
  if (!company || !r.empresa_split) return full
  const split = r.empresa_split.find(s => s.code.toUpperCase() === company)
  if (!split) return full
  return Number(split.importe_cop_allocated) || full * split.pct
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

  // Company filter
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)

  // Raw fetched data
  const [allCpp, setAllCpp] = useState<CppInvoice[]>([])
  const [allTx, setAllTx]   = useState<TxRow[]>([])

  // Loading/error
  const [cardLoading, setCardLoading] = useState(true)
  const [cardError, setCardError]     = useState(false)
  const [loadingTop, setLoadingTop]   = useState(true)
  const [topError, setTopError]       = useState(false)

  // Modal
  const [modalData, setModalData] = useState<{ title: string; rows: CppInvoice[] } | null>(null)
  const [showPendingModal, setShowPendingModal] = useState(false)

  // Top 20 results (async)
  const [topSuppliers, setTopSuppliers] = useState<TopSupplierRow[]>([])
  const [assessments, setAssessments]   = useState<Map<string, boolean | null>>(new Map())

  // Available companies (derived from CPP data)
  const availableCompanies = useMemo(() => {
    const codes = new Set<string>()
    for (const r of allCpp) {
      if (r.empresa) codes.add(r.empresa.toUpperCase())
      if (r.empresa_split) r.empresa_split.forEach(s => codes.add(s.code.toUpperCase()))
    }
    const order = Object.keys(ENTITY_COLORS)
    return Array.from(codes).sort((a, b) => {
      const ia = order.indexOf(a)
      const ib = order.indexOf(b)
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
    })
  }, [allCpp])

  // Card data derived from allCpp + selectedCompany
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const aprobadas = useMemo<CardData>(() => {
    const rows = allCpp.filter(r => r.aprobado?.toUpperCase() === 'SI' && matchesCompany(r, selectedCompany))
    return { count: rows.length, total: rows.reduce((s, r) => s + allocatedAmount(r, selectedCompany), 0), rows }
  }, [allCpp, selectedCompany])

  const pendientes = useMemo<CardData>(() => {
    const now = new Date()
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    const rows = allCpp.filter(r => {
      if (r.aprobado?.toUpperCase() === 'SI') return false
      if (!matchesCompany(r, selectedCompany)) return false
      if (!r.fecha_vencimiento) return false
      return new Date(r.fecha_vencimiento) <= endOfMonth
    })
    return { count: rows.length, total: rows.reduce((s, r) => s + allocatedAmount(r, selectedCompany), 0), rows }
  }, [allCpp, selectedCompany])

  const vencidas = useMemo<CardData>(() => {
    const rows = allCpp.filter(r => r.fecha_vencimiento && r.fecha_vencimiento < today && matchesCompany(r, selectedCompany))
    return { count: rows.length, total: rows.reduce((s, r) => s + allocatedAmount(r, selectedCompany), 0), rows }
  }, [allCpp, selectedCompany, today])

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
        `name.ilike.%${term}%`,
        `razon_social.ilike.%${term}%`,
        ...(cleanNit.length > 0 ? [`nit.ilike.%${cleanNit}%`] : []),
      ]
      const { data } = await suppliersQuery('id, name, razon_social, nit')
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

  /* ── Fetch CPP rows — stored raw; cards derived via useMemo ── */
  const fetchCards = useCallback(async () => {
    setCardLoading(true)
    setCardError(false)
    const PAGE = 1000
    const all: CppInvoice[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('cuentas_por_pagar_cache')
        .select('importe_cop, aprobado, fecha_vencimiento, proveedor, empresa, empresa_split, concepto, centro_costo')
        .range(from, from + PAGE - 1)
      if (error) { setCardError(true); setCardLoading(false); return }
      if (!data || data.length === 0) break
      all.push(...(data as unknown as CppInvoice[]))
      if (data.length < PAGE) break
    }
    setAllCpp(all)
    setCardLoading(false)
  }, [])

  useEffect(() => { void fetchCards() }, [fetchCards])

  /* ── Fetch TX rows — stored raw; Top 20 recomputed on filter change ── */
  const fetchAllTx = useCallback(async () => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 60)
    const cutoffStr = cutoff.toISOString().slice(0, 10)
    const PAGE = 1000
    const all: TxRow[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('transactions_cache')
        .select('nit, importe_cop, empresa, empresa_split')
        .gte('fecha_factura', cutoffStr)
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

  const computeTop20 = useCallback(async (txRows: TxRow[], company: string | null) => {
    setLoadingTop(true)
    setTopError(false)

    // Group by NIT with optional company filter
    const grouped = new Map<string, { total: number; entityTotals: Map<string, number> }>()
    for (const r of txRows) {
      if (!r.nit || !matchesCompany(r, company)) continue
      const amount = allocatedAmount(r, company)
      if (!amount) continue

      const g = grouped.get(r.nit) ?? { total: 0, entityTotals: new Map() }
      g.total += amount

      // Entity totals for pills always show full allocation
      if (r.empresa) {
        g.entityTotals.set(r.empresa, (g.entityTotals.get(r.empresa) ?? 0) + Number(r.importe_cop ?? 0))
      } else if (r.empresa_split) {
        for (const s of r.empresa_split) {
          const alloc = Number(s.importe_cop_allocated) || Number(r.importe_cop ?? 0) * s.pct
          g.entityTotals.set(s.code, (g.entityTotals.get(s.code) ?? 0) + alloc)
        }
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
      .select('id, name, razon_social, nit')
      .in('nit', top20nits)

    const nitToSupplier = new Map(
      ((suppData ?? []) as { id: string; name: string; razon_social: string | null; nit: string }[])
        .map(s => [s.nit, s])
    )

    const rows: TopSupplierRow[] = top20nits.map(nit => {
      const g = grouped.get(nit)!
      const supplier = nitToSupplier.get(nit)
      return {
        id: supplier?.id ?? '',
        nombre: supplier ? (supplier.razon_social || supplier.name) : nit,
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
    void computeTop20(allTx, selectedCompany)
  }, [allTx, selectedCompany, computeTop20])

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
                      {s.razon_social ?? s.name}
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

        {/* Company filter */}
        {!cardLoading && availableCompanies.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <CompanyToggle label="Todas" active={selectedCompany === null} color={null}
              onClick={() => setSelectedCompany(null)} />
            {availableCompanies.map(code => (
              <CompanyToggle key={code} label={code} active={selectedCompany === code}
                color={ENTITY_COLORS[code] ?? null}
                onClick={() => setSelectedCompany(selectedCompany === code ? null : code)} />
            ))}
          </div>
        )}
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

      {/* ── Section 2: Action cards ──────────────────────── */}
      <section>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <ActionCard
            icon={<CheckCircledIcon width={20} height={20} />}
            title="Facturas Aprobadas"
            accent="var(--hh-teal)"
            amountColor="var(--hh-teal)"
            loading={cardLoading}
            error={cardError}
            data={aprobadas}
            onAmountClick={() => aprobadas && setModalData({ title: 'Facturas Aprobadas', rows: aprobadas.rows })}
          />
          <ActionCard
            icon={<ClockIcon width={20} height={20} />}
            title="Facturas Pendiente Aprobación"
            accent="var(--hh-lemon)"
            amountColor="var(--hh-teal)"
            loading={cardLoading}
            error={cardError}
            data={pendientes}
            onAmountClick={() => setShowPendingModal(true)}
          />
          <ActionCard
            icon={<ExclamationTriangleIcon width={20} height={20} />}
            title="Cartera Vencida — Facturas por Pagar Urgente"
            accent="var(--hh-mango)"
            amountColor="var(--hh-mango)"
            loading={cardLoading}
            error={cardError}
            data={vencidas}
            onAmountClick={() => vencidas && setModalData({ title: 'Cartera Vencida', rows: vencidas.rows })}
          />
        </div>
      </section>

      {/* ── Invoice modal ────────────────────────────────── */}
      {modalData && (
        <InvoiceModal
          title={modalData.title}
          rows={modalData.rows}
          onClose={() => setModalData(null)}
        />
      )}

      {/* ── Pending approvals modal ──────────────────────── */}
      {showPendingModal && (
        <PendingApprovalsModal
          onClose={() => setShowPendingModal(false)}
          onApproved={() => void fetchCards()}
        />
      )}

      {/* ── Section 3: Top 20 ───────────────────────────── */}
      <section>
        <h2 style={sectionHeadingStyle}>Top 20 · Últimos 60 días</h2>

        <div style={tableCardStyle}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(122,145,165,0.2)' }}>
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
                topSuppliers.map((row, idx) => {
                  const assessment = assessments.has(row.id) ? assessments.get(row.id) : undefined
                  return (
                    <tr
                      key={row.nit}
                      style={{ background: idx % 2 === 1 ? 'var(--hh-ice)' : 'var(--hh-white)' }}
                    >
                      <td style={tdStyle}>
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
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {row.entities.map(e => (
                            <EntityPill key={e.entity} entity={e.entity} amount={e.amount_cop} />
                          ))}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <AssessmentBadge pass={assessment} />
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {formatCOP(row.gasto)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--hh-haze)' }}>—</td>
                      <td style={tdStyle}>
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

const shimmerStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'linear-gradient(90deg, rgba(122,145,165,0.1) 25%, rgba(122,145,165,0.2) 50%, rgba(122,145,165,0.1) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.4s infinite',
  borderRadius: 4,
}

function ActionCard({
  icon,
  title,
  accent,
  amountColor,
  loading,
  error,
  data,
  onAmountClick,
}: {
  icon: React.ReactNode
  title: string
  accent: string
  amountColor: string
  loading: boolean
  error: boolean
  data: CardData | null
  onAmountClick?: () => void
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

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ ...shimmerStyle, height: 13, width: 80 }} />
          <span style={{ ...shimmerStyle, height: 18, width: 130 }} />
        </div>
      ) : error || !data ? (
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '0.8125rem', color: 'var(--hh-haze)', margin: 0 }}>
          Error al cargar
        </p>
      ) : (
        <div>
          <p style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '0.8125rem', color: 'var(--hh-haze)', margin: '0 0 2px' }}>
            {data.count} {data.count === 1 ? 'factura' : 'facturas'}
          </p>
          <button
            onClick={onAmountClick}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              margin: 0,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: '1rem',
              color: amountColor,
              fontVariantNumeric: 'tabular-nums',
              cursor: onAmountClick ? 'pointer' : 'default',
              textDecoration: onAmountClick ? 'underline' : 'none',
              textUnderlineOffset: 3,
              textDecorationColor: `${amountColor}55`,
            }}
          >
            {formatCOP(data.total)}
          </button>
        </div>
      )}
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
        <td key={i} style={tdStyle}>
          <span style={{ ...shimmer, width: widths[i] ?? 80 }} />
        </td>
      ))}
    </tr>
  )
}

/* ─── Company Toggle ─────────────────────────────────────── */

function CompanyToggle({ label, active, color, onClick }: {
  label: string
  active: boolean
  color: { bg: string; text: string } | null
  onClick: () => void
}) {
  const activeBg   = color?.bg   ?? 'var(--hh-teal)'
  const activeText = color?.text ?? '#fff'
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-body)',
        fontWeight: active ? 500 : 400,
        fontSize: '0.75rem',
        letterSpacing: '0.05em',
        padding: '5px 13px',
        borderRadius: 99,
        border: `1px solid ${active ? activeBg : 'rgba(122,145,165,0.3)'}`,
        background: active ? activeBg : 'transparent',
        color: active ? activeText : 'var(--hh-haze)',
        cursor: 'pointer',
        transition: 'all 0.12s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

/* ─── Invoice Modal ──────────────────────────────────────── */

function InvoiceModal({ title, rows, onClose }: { title: string; rows: CppInvoice[]; onClose: () => void }) {
  // Close on backdrop click
  const backdropRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const sorted = [...rows].sort((a, b) => {
    const da = a.fecha_vencimiento ?? ''
    const db = b.fecha_vencimiento ?? ''
    return da < db ? -1 : da > db ? 1 : 0
  })

  function companyBadges(row: CppInvoice) {
    if (row.empresa_split && Array.isArray(row.empresa_split) && row.empresa_split.length > 0) {
      return row.empresa_split.map(s => s.code)
    }
    return row.empresa ? [row.empresa] : []
  }

  return (
    <div
      ref={backdropRef}
      onClick={e => { if (e.target === backdropRef.current) onClose() }}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,25,40,0.55)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '48px 24px',
        overflowY: 'auto',
      }}
    >
      <div style={{
        background: 'var(--hh-white)',
        borderRadius: 10,
        width: '100%',
        maxWidth: 860,
        boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 96px)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(122,145,165,0.15)',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: '1.0625rem', color: 'var(--hh-dark)', margin: 0 }}>
              {title}
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '0.8125rem', color: 'var(--hh-haze)', margin: '3px 0 0' }}>
              {rows.length} {rows.length === 1 ? 'factura' : 'facturas'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--hh-haze)', padding: 4, borderRadius: 4,
              display: 'flex', alignItems: 'center',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--hh-dark)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--hh-haze)' }}
          >
            <Cross2Icon width={18} height={18} />
          </button>
        </div>

        {/* Table */}
        <div style={{ overflowY: 'auto', flexGrow: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--hh-white)', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid rgba(122,145,165,0.2)' }}>
                <Th align="left">Proveedor</Th>
                <Th align="left">Empresa</Th>
                <Th align="left">Concepto</Th>
                <Th align="left">Centro de costo</Th>
                <Th align="right">Vencimiento</Th>
                <Th align="right">Importe</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, idx) => {
                const badges = companyBadges(row)
                return (
                  <tr key={idx} style={{ background: idx % 2 === 1 ? 'var(--hh-ice)' : 'var(--hh-white)' }}>
                    <td style={tdStyle}>{row.proveedor ?? '—'}</td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {badges.length > 0
                          ? badges.map(code => <CompactPill key={code} code={code} />)
                          : <span style={{ color: 'var(--hh-haze)', fontSize: '0.8125rem' }}>—</span>
                        }
                      </div>
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.concepto ?? '—'}
                    </td>
                    <td style={tdStyle}>{row.centro_costo ?? '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {row.fecha_vencimiento ?? '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {formatCOP(Number(row.importe_cop ?? 0))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function CompactPill({ code }: { code: string }) {
  const upper = code.toUpperCase()
  const color = ENTITY_COLORS[upper] ?? { bg: 'var(--hh-haze)', text: '#fff' }
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 7px',
      borderRadius: 99,
      background: color.bg,
      color: color.text,
      fontSize: '0.6875rem',
      fontWeight: 500,
      letterSpacing: '0.05em',
    }}>
      {upper}
    </span>
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
