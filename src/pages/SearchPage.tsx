import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { supabase, suppliersQuery } from '../lib/supabase'
import type { Supplier } from '../types/supplier'
import { ENTITY_COLORS } from '../lib/entityColors'

/* ─── Types ──────────────────────────────────────────────── */

interface TopRow {
  id: string
  nombre: string
  nit: string
  total: number
  entities: { entity: string; amount: number }[]
}

type AggEntry = { total: number; entityTotals: Map<string, number> }
type AggMap   = Map<string, AggEntry>

type BancosRow = { nit: string | null; importe_cop: string | number; empresa: string | null; fecha_operacion: string }
type TrmRow    = { date: string; usd_cop: number; gbp_cop: number; eur_cop: number }
type TxnRow    = { amount: number; currency: string; transaction_date: string; company_id: string | null; supplier_id: string | null; type: string }
type WiseRow   = { amount_value: number; amount_currency: string; date: string; empresa: string | null; nit: string | null; type: string }
type MercRow   = { amount: number; currency: string; posted_at: string | null; empresa: string | null; nit: string | null }

interface Assessment { supplier_id: string; pass: boolean | null }

// Company pill colours mirror public.companies.brand_colour — see ../lib/entityColors.

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

function addToAgg(agg: AggMap, nit: string, amount_cop: number, empresa: string | null) {
  if (!nit || amount_cop <= 0) return
  const e = agg.get(nit) ?? { total: 0, entityTotals: new Map() }
  e.total += amount_cop
  if (empresa) e.entityTotals.set(empresa, (e.entityTotals.get(empresa) ?? 0) + amount_cop)
  agg.set(nit, e)
}

/* ─── SearchPage ─────────────────────────────────────────── */

export function SearchPage() {
  const navigate = useNavigate()

  // Typeahead state
  const [query, setQuery]           = useState('')
  const [suggestions, setSuggestions] = useState<Supplier[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [searching, setSearching]   = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const debouncedQuery = useDebounce(query, 250)

  // Top 20 — suppliers (money out)
  const [suppLoading, setSuppLoading]   = useState(true)
  const [suppError, setSuppError]       = useState(false)
  const [topSuppliers, setTopSuppliers] = useState<TopRow[]>([])
  const [assessments, setAssessments]   = useState<Map<string, boolean | null>>(new Map())

  // Top 20 — clients (money in)
  const [clientLoading, setClientLoading] = useState(true)
  const [clientError, setClientError]     = useState(false)
  const [topClients, setTopClients]       = useState<TopRow[]>([])

  /* ── Typeahead ───────────────────────────────────────────── */
  useEffect(() => {
    if (!debouncedQuery.trim()) { setSuggestions([]); setShowDropdown(false); return }
    setSearching(true)
    void (async () => {
      const term = debouncedQuery.trim()
      const cleanNit = term.replace(/\D/g, '')
      const filters = [
        `razon_social.ilike.%${term}%`,
        `nombre_operativo.ilike.%${term}%`,
        ...(cleanNit.length > 0 ? [`nit.ilike.%${cleanNit}%`] : []),
      ]
      const { data } = await suppliersQuery('id, razon_social, nombre_operativo, nit').or(filters.join(',')).limit(8)
      setSuggestions((data as unknown as Supplier[]) ?? [])
      setShowDropdown(true)
      setSearching(false)
    })()
  }, [debouncedQuery])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  /* ── Main data fetch ─────────────────────────────────────── */
  const fetchTopLists = useCallback(async () => {
    setSuppLoading(true)
    setClientLoading(true)
    setSuppError(false)
    setClientError(false)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 60)
    const cutoffStr = cutoff.toISOString().slice(0, 10)

    const suppAgg: AggMap = new Map()
    const clientAgg: AggMap = new Map()

    // TRM rates + companies (needed for accounts_transactions conversion and company_id → code)
    const [{ data: trmData }, { data: compData }] = await Promise.all([
      supabase.from('trm_daily')
        .select('date, usd_cop, gbp_cop, eur_cop')
        .gte('date', cutoffStr)
        .order('date', { ascending: false }),
      supabase.from('companies').select('id, name'),
    ])

    const trmRows = (trmData ?? []) as TrmRow[]
    const compMap = new Map<string, string>(
      ((compData ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name])
    )

    // Convert any currency to COP using nearest TRM on or before the transaction date.
    // trmRows is sorted descending so the first match is the most recent rate on/before date.
    const toCOP = (amount: number, currency: string, date: string): number => {
      if (!currency || currency === 'COP') return amount
      const row = trmRows.find(r => r.date <= date)
      if (!row) return amount
      if (currency === 'USD') return amount * row.usd_cop
      if (currency === 'GBP') return amount * row.gbp_cop
      if (currency === 'EUR') return amount * row.eur_cop
      return amount
    }

    // --- 1. accounts_bancos (paginated) ---
    // importe_cop is already COP. Negative = expense (supplier). Positive = income (client).
    try {
      const PAGE = 1000
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('accounts_bancos')
          .select('nit, importe_cop, empresa, fecha_operacion')
          .gte('fecha_operacion', cutoffStr)
          .not('nit', 'is', null)
          .range(from, from + PAGE - 1)
        if (error) { setSuppError(true); setClientError(true); break }
        if (!data?.length) break
        for (const r of data as BancosRow[]) {
          if (!r.nit) continue
          const amt = Number(r.importe_cop ?? 0)
          if (amt < 0) addToAgg(suppAgg, r.nit, Math.abs(amt), r.empresa)
          else if (amt > 0) addToAgg(clientAgg, r.nit, amt, r.empresa)
        }
        if (data.length < PAGE) break
      }
    } catch { setSuppError(true); setClientError(true) }

    // --- 2. accounts_transactions (expense + sales_allocation; ignore transfers) ---
    // amount is always positive. expense = money out (supplier). sales_allocation has no client NIT → skip for clients.
    try {
      const { data: txData } = await supabase
        .from('accounts_transactions')
        .select('amount, currency, transaction_date, company_id, supplier_id, type')
        .in('type', ['expense', 'sales_allocation'])
        .gte('transaction_date', cutoffStr)

      const txRows = (txData ?? []) as TxnRow[]

      // Resolve supplier_id → NIT for expense rows
      const suppIds = [...new Set(txRows.filter(r => r.type === 'expense' && r.supplier_id).map(r => r.supplier_id!))]
      let sidToNit = new Map<string, string>()
      if (suppIds.length > 0) {
        const { data: sd } = await supabase
          .from('accounts_suppliers')
          .select('id, nit')
          .in('id', suppIds)
        sidToNit = new Map(
          ((sd ?? []) as { id: string; nit: string | null }[])
            .filter(s => s.nit)
            .map(s => [s.id, s.nit!])
        )
      }

      for (const r of txRows) {
        if (r.type === 'expense' && r.supplier_id) {
          const nit = sidToNit.get(r.supplier_id)
          if (!nit) continue
          const empresa = compMap.get(r.company_id ?? '') ?? null
          addToAgg(suppAgg, nit, toCOP(r.amount, r.currency, r.transaction_date), empresa)
        }
        // sales_allocation: no client NIT in the table — skip for clients list
      }
    } catch { /* partial failure — other sources still contribute */ }

    // --- 3. wise_transactions ---
    // type='DEBIT' + amount_value positive = expense. type='CREDIT' = income.
    // Only include rows that have been reconciled (nit + empresa not null).
    try {
      const { data: wiseData } = await supabase
        .from('wise_transactions')
        .select('amount_value, amount_currency, date, empresa, nit, type')
        .gte('date', cutoffStr)
        .not('nit', 'is', null)
        .not('empresa', 'is', null)

      for (const r of (wiseData ?? []) as WiseRow[]) {
        if (!r.nit || !r.empresa) continue
        const cop = toCOP(Math.abs(r.amount_value), r.amount_currency, r.date)
        if (r.type === 'DEBIT')  addToAgg(suppAgg,   r.nit, cop, r.empresa)
        else if (r.type === 'CREDIT') addToAgg(clientAgg, r.nit, cop, r.empresa)
      }
    } catch { /* partial ok */ }

    // --- 4. mercury_transactions ---
    // amount < 0 = expense (money out). amount > 0 = income (money in).
    // Only include reconciled rows (nit + empresa not null).
    try {
      const { data: mercData } = await supabase
        .from('mercury_transactions')
        .select('amount, currency, posted_at, empresa, nit')
        .gte('posted_at', cutoffStr)
        .not('nit', 'is', null)
        .not('empresa', 'is', null)

      for (const r of (mercData ?? []) as MercRow[]) {
        if (!r.nit || !r.empresa) continue
        const date = (r.posted_at ?? '').slice(0, 10)
        const cop = toCOP(Math.abs(r.amount), r.currency, date)
        if (r.amount < 0)      addToAgg(suppAgg,   r.nit, cop, r.empresa)
        else if (r.amount > 0) addToAgg(clientAgg, r.nit, cop, r.empresa)
      }
    } catch { /* partial ok */ }

    // --- Resolve top 20 for each aggregation ---
    const resolveTop20 = async (agg: AggMap): Promise<TopRow[]> => {
      const sorted = Array.from(agg.entries()).sort((a, b) => b[1].total - a[1].total).slice(0, 20)
      if (!sorted.length) return []
      const nits = sorted.map(([nit]) => nit)
      const { data: sd } = await supabase
        .from('accounts_suppliers')
        .select('id, razon_social, nombre_operativo, nit')
        .in('nit', nits)
      const nitToSupp = new Map(
        ((sd ?? []) as { id: string; razon_social: string | null; nombre_operativo: string | null; nit: string }[])
          .map(s => [s.nit, s])
      )
      return sorted.map(([nit, g]) => {
        const s = nitToSupp.get(nit)
        return {
          id: s?.id ?? '',
          nombre: s ? supplierDisplayName(s.razon_social, s.nombre_operativo) : nit,
          nit,
          total: g.total,
          entities: Array.from(g.entityTotals.entries())
            .map(([entity, amount]) => ({ entity, amount }))
            .sort((a, b) => b.amount - a.amount),
        }
      })
    }

    const [suppRows, clientRows] = await Promise.all([
      resolveTop20(suppAgg).catch(() => []),
      resolveTop20(clientAgg).catch(() => []),
    ])

    setTopSuppliers(suppRows)
    setSuppLoading(false)
    setTopClients(clientRows)
    setClientLoading(false)

    // Assessments only for suppliers
    const ids = suppRows.map(r => r.id).filter(Boolean)
    if (ids.length > 0) {
      const { data: aData } = await supabase
        .from('suppliers_assessment')
        .select('supplier_id, pass')
        .in('supplier_id', ids)
      const map = new Map<string, boolean | null>()
      ;(aData as Assessment[] ?? []).forEach(a => map.set(a.supplier_id, a.pass))
      setAssessments(map)
    }
  }, [])

  useEffect(() => { void fetchTopLists() }, [fetchTopLists])

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>

      {/* ── Section 1: Hero search ──────────────────────── */}
      <section>
        <h1 style={pageTitleStyle}>Proveedores</h1>

        <div ref={searchRef} style={{ position: 'relative', maxWidth: 640 }}>
          <MagnifyingGlassIcon
            width={18} height={18}
            style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              color: searching ? 'var(--hh-teal)' : 'var(--hh-haze)',
              pointerEvents: 'none', transition: 'color 0.15s',
            }}
          />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => { if (suggestions.length) setShowDropdown(true) }}
            placeholder="Buscar proveedor por nombre o NIT…"
            style={{
              width: '100%', padding: '14px 16px 14px 46px',
              fontFamily: 'var(--font-body)', fontWeight: 300,
              fontSize: '1rem', color: 'var(--hh-dark)',
              background: 'var(--hh-white)',
              border: '1px solid rgba(122,145,165,0.4)',
              borderRadius: 8, outline: 'none',
              boxSizing: 'border-box', boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            }}
            onFocusCapture={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
            onBlurCapture={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
          />

          {showDropdown && suggestions.length > 0 && (
            <div style={dropdownStyle}>
              {suggestions.map(s => (
                <button
                  key={s.id}
                  onMouseDown={() => { setShowDropdown(false); setQuery(''); navigate(`/suppliers/${s.id}`) }}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '10px 16px', background: 'transparent', border: 'none',
                    borderBottom: '1px solid rgba(122,145,165,0.1)', cursor: 'pointer',
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
              <span style={{ fontSize: '0.875rem', color: 'var(--hh-haze)', fontFamily: 'var(--font-body)' }}>Sin resultados</span>
            </div>
          )}
        </div>

        <p style={{ margin: '10px 0 0', fontSize: '0.8125rem', color: 'var(--hh-haze)', fontWeight: 300 }}>
          ¿No encuentras el proveedor?{' '}
          <button
            onClick={() => navigate('/new')}
            style={{
              background: 'none', border: 'none', padding: 0,
              fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
              fontWeight: 400, color: 'var(--hh-teal)', cursor: 'pointer',
              textDecoration: 'underline', textUnderlineOffset: 2,
            }}
          >
            Agregar nuevo proveedor →
          </button>
        </p>
      </section>

      {/* ── Section 2: Top 20 Proveedores (money out) ──── */}
      <section>
        <h2 style={sectionHeadingStyle}>
          Top 20 Proveedores · Últimos 60 días
          <span style={{ marginLeft: 10, fontSize: '0.75rem', fontWeight: 400, color: 'var(--hh-haze)', fontFamily: 'var(--font-body)', fontStyle: 'normal' }}>
            gasto total — bancos, CashApp, Wise, Mercury
          </span>
        </h2>

        <TopTable
          rows={topSuppliers}
          loading={suppLoading}
          error={suppError}
          amountLabel="Gasto 60d"
          emptyMessage="Sin gasto registrado en los últimos 60 días."
          assessments={assessments}
          showAssessment
          onNavigate={id => navigate(`/suppliers/${id}`)}
        />
      </section>

      {/* ── Section 3: Top 20 Clientes (money in) ───────── */}
      <section>
        <h2 style={sectionHeadingStyle}>
          Top 20 Clientes · Últimos 60 días
          <span style={{ marginLeft: 10, fontSize: '0.75rem', fontWeight: 400, color: 'var(--hh-haze)', fontFamily: 'var(--font-body)', fontStyle: 'normal' }}>
            ingresos totales — bancos, Wise, Mercury
          </span>
        </h2>

        <TopTable
          rows={topClients}
          loading={clientLoading}
          error={clientError}
          amountLabel="Ingresos 60d"
          emptyMessage="Sin ingresos registrados en los últimos 60 días."
          showAssessment={false}
          onNavigate={id => navigate(`/suppliers/${id}`)}
        />
      </section>

    </div>
  )
}

/* ─── TopTable ───────────────────────────────────────────── */

function TopTable({
  rows, loading, error, amountLabel, emptyMessage, showAssessment, assessments, onNavigate,
}: {
  rows: TopRow[]
  loading: boolean
  error: boolean
  amountLabel: string
  emptyMessage: string
  showAssessment: boolean
  assessments?: Map<string, boolean | null>
  onNavigate: (id: string) => void
}) {
  const colCount = showAssessment ? 4 : 3

  return (
    <div style={tableCardStyle}>
      <table className="hh-table">
        <thead>
          <tr>
            <Th align="left">Nombre</Th>
            <Th align="left">Entidades</Th>
            {showAssessment && <Th align="left">Evaluación</Th>}
            <Th align="right">{amountLabel}</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={colCount} even={i % 2 === 1} />)
          ) : error ? (
            <tr>
              <td colSpan={colCount} style={{ padding: '48px 16px', textAlign: 'center' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic', fontSize: '1rem', color: 'var(--hh-haze)' }}>
                  No se pudieron cargar los datos.
                </span>
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={colCount} style={{ padding: '48px 16px', textAlign: 'center' }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic', fontSize: '1rem', color: 'var(--hh-haze)' }}>
                  {emptyMessage}
                </span>
              </td>
            </tr>
          ) : (
            rows.map(row => (
              <tr key={row.nit}>
                <td>
                  {row.id ? (
                    <button
                      onClick={() => onNavigate(row.id)}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        fontFamily: 'var(--font-body)', fontWeight: 400,
                        fontSize: '0.875rem', color: 'var(--hh-dark)',
                        cursor: 'pointer', textAlign: 'left',
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
                    {row.entities.map(e => <EntityPill key={e.entity} entity={e.entity} amount={e.amount} />)}
                  </div>
                </td>
                {showAssessment && (
                  <td><AssessmentBadge pass={assessments?.has(row.id) ? assessments.get(row.id) : undefined} /></td>
                )}
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatCOP(row.total)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
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
          display: 'inline-block', padding: '2px 7px', borderRadius: 99,
          background: color.bg, color: color.text,
          fontSize: '0.6875rem', fontWeight: 500,
          letterSpacing: '0.05em', cursor: 'default', userSelect: 'none',
        }}
      >
        {entity.toUpperCase()}
      </span>
      {show && (
        <span style={{
          position: 'absolute', bottom: 'calc(100% + 5px)', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--hh-dark)', color: 'var(--hh-ice)',
          fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 400,
          padding: '4px 8px', borderRadius: 4, whiteSpace: 'nowrap',
          pointerEvents: 'none', zIndex: 100,
        }}>
          {formatCOP(amount)}
        </span>
      )}
    </span>
  )
}

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return <th style={{ textAlign: align }}>{children}</th>
}

function AssessmentBadge({ pass }: { pass: boolean | null | undefined }) {
  if (pass === true) return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, background: 'rgba(101,141,94,0.12)', color: '#4a8044', fontSize: '0.75rem', fontWeight: 500 }}>
      Aprobado
    </span>
  )
  if (pass === false) return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, background: 'rgba(252,0,131,0.08)', color: 'var(--hh-mango)', fontSize: '0.75rem', fontWeight: 500 }}>
      No aprobado
    </span>
  )
  return (
    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 99, background: 'rgba(122,145,165,0.12)', color: 'var(--hh-haze)', fontSize: '0.75rem', fontWeight: 400 }}>
      Pendiente
    </span>
  )
}

function SkeletonRow({ cols, even }: { cols: number; even: boolean }) {
  const shimmer: React.CSSProperties = {
    background: 'linear-gradient(90deg, rgba(122,145,165,0.1) 25%, rgba(122,145,165,0.2) 50%, rgba(122,145,165,0.1) 75%)',
    backgroundSize: '200% 100%', borderRadius: 4,
    animation: 'shimmer 1.4s infinite', height: 13, display: 'inline-block',
  }
  const widths = [160, 72, 90, 60]
  return (
    <tr style={{ background: even ? 'var(--hh-ice)' : 'var(--hh-white)' }}>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}><span style={{ ...shimmer, width: widths[i] ?? 80 }} /></td>
      ))}
    </tr>
  )
}

/* ─── Style constants ────────────────────────────────────── */

const pageTitleStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)', fontWeight: 500,
  fontSize: '0.875rem', textTransform: 'uppercase',
  letterSpacing: '0.12em', color: 'var(--hh-dark)', margin: '0 0 16px',
}

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)', fontWeight: 300,
  fontSize: '1.0625rem', color: 'var(--hh-dark)', margin: '0 0 14px',
}

const tableCardStyle: React.CSSProperties = {
  background: 'var(--hh-white)', borderRadius: 8,
  border: '1px solid rgba(122,145,165,0.2)', overflow: 'hidden',
}

const dropdownStyle: React.CSSProperties = {
  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
  background: 'var(--hh-white)', border: '1px solid rgba(122,145,165,0.25)',
  borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.10)', zIndex: 50, overflow: 'hidden',
}
