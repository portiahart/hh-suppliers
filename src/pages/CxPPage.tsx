import { useState, useEffect, useMemo, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface CxPRow {
  id: string
  proveedor: string | null
  nit: string | null
  no_factura: string | null
  concepto: string | null
  tipo_documento: string | null
  fecha_factura: string | null
  fecha_vencimiento: string | null
  valor_total: number | null
  empresa: string | null
  aprobado: string | null
  orden_prioridad: string | null
  doc_url: string | null
  comprobante_url: string | null
}

type ViewMode = 'ALL' | 'VENCIDO' | 'BY_PROVEEDOR' | 'BY_EMPRESA' | 'APROBADO' | 'PENDIENTE'

/* ─── Helpers ────────────────────────────────────────────────────────────── */

const fmt = (n: number) => '$ ' + Math.round(n).toLocaleString('es-CO')
const sum = (rows: CxPRow[]) => rows.reduce((s, r) => s + (r.valor_total ?? 0), 0)

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function isVencida(row: CxPRow, today: string) {
  return !!(row.fecha_vencimiento && row.fecha_vencimiento < today)
}

const EMPRESA_ORDER = ['BA', 'TH', 'PM', 'GA', 'MA', 'AB', 'HH', 'CR', 'AW']
const EMPRESA_COLORS: Record<string, string> = {
  BA: 'var(--brand-ba)', TH: 'var(--brand-th)', GA: 'var(--brand-ga)',
  PM: '#2D6A9F', MA: '#2D6A9F', HH: '#2D6A9F', AB: '#2D6A9F',
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function SummaryCard({
  title, count, total, accent, loading, onClick,
}: { title: string; count: number; total: number; accent: string; loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--hh-white)', borderRadius: 12,
        border: `1px solid rgba(122,145,165,0.15)`, padding: '18px 20px',
        textAlign: 'left', cursor: 'pointer', flex: 1, minWidth: 0,
        borderTop: `3px solid ${accent}`, transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.08)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      <p style={{ margin: '0 0 10px', fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 500, color: 'var(--hh-haze)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {title}
      </p>
      {loading ? (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--hh-haze)' }}>Cargando…</div>
      ) : (
        <>
          <p style={{ margin: '0 0 4px', fontFamily: 'var(--font-numeric)', fontSize: '1.6rem', fontWeight: 500, color: accent, lineHeight: 1 }}>
            {fmt(total)}
          </p>
          <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--hh-haze)' }}>
            {count} {count === 1 ? 'factura' : 'facturas'}
          </p>
        </>
      )}
    </button>
  )
}

function ApproveBtn({ rowId, onApproved }: { rowId: string; onApproved: () => void }) {
  const [loading, setLoading] = useState(false)
  async function approve() {
    setLoading(true)
    await supabase.functions.invoke('approve-cxp', { body: { id: rowId } })
    setLoading(false)
    onApproved()
  }
  return (
    <button onClick={approve} disabled={loading} style={{
      fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 500,
      color: 'var(--hh-teal)', background: 'transparent',
      border: '1px solid var(--hh-teal)', borderRadius: 4,
      padding: '2px 8px', cursor: loading ? 'default' : 'pointer',
      opacity: loading ? 0.5 : 1, whiteSpace: 'nowrap',
    }}>
      {loading ? '…' : 'Aprobar'}
    </button>
  )
}

function RowTable({ rows, today, showApprove, onApproved }: {
  rows: CxPRow[]; today: string; showApprove: boolean; onApproved: () => void
}) {
  return (
    <table className="hh-table" style={{ marginTop: 0 }}>
      <thead>
        <tr>
          <th>Vencimiento</th>
          <th>Proveedor</th>
          <th>Empresa</th>
          <th>Concepto / Factura</th>
          <th style={{ textAlign: 'right' }}>Total</th>
          <th>Aprobado</th>
          {showApprove && <th></th>}
        </tr>
      </thead>
      <tbody>
        {rows.map(r => {
          const vencida = isVencida(r, today)
          const aprobado = r.aprobado?.toUpperCase() === 'SI'
          return (
            <tr key={r.id}>
              <td style={{ whiteSpace: 'nowrap', color: vencida ? '#B9484E' : undefined, fontWeight: vencida ? 500 : undefined }}>
                {fmtDate(r.fecha_vencimiento)}
                {vencida && <span style={{ marginLeft: 6, fontSize: '0.65rem', background: '#B9484E', color: '#fff', borderRadius: 3, padding: '1px 4px' }}>VENCIDA</span>}
              </td>
              <td>
                <div style={{ fontSize: '0.8125rem' }}>{r.proveedor ?? '—'}</div>
                {r.nit && <div style={{ fontSize: '0.7rem', color: 'var(--hh-haze)' }}>{r.nit}</div>}
              </td>
              <td>
                {r.empresa && (
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                    background: EMPRESA_COLORS[r.empresa] ?? 'var(--hh-haze)', color: '#fff',
                  }}>{r.empresa}</span>
                )}
              </td>
              <td>
                <div style={{ fontSize: '0.8125rem' }}>{r.concepto ?? r.no_factura ?? '—'}</div>
                {r.concepto && r.no_factura && r.no_factura !== r.concepto && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--hh-haze)' }}>{r.no_factura}</div>
                )}
                {r.doc_url && (
                  <a href={r.doc_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: '0.7rem', color: 'var(--hh-teal)', textDecoration: 'underline' }}>
                    ver doc
                  </a>
                )}
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap', fontFamily: 'var(--font-numeric)' }}>
                {r.valor_total != null ? fmt(r.valor_total) : '—'}
              </td>
              <td>
                <span style={{
                  fontSize: '0.65rem', fontWeight: 600, padding: '1px 6px', borderRadius: 3,
                  background: aprobado ? 'rgba(74,155,142,0.15)' : 'rgba(122,145,165,0.12)',
                  color: aprobado ? 'var(--hh-teal)' : 'var(--hh-haze)',
                }}>
                  {aprobado ? 'SI' : 'NO'}
                </span>
              </td>
              {showApprove && (
                <td>{!aprobado && <ApproveBtn rowId={r.id} onApproved={onApproved} />}</td>
              )}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function GroupSection({ label, rows, today, showApprove, onApproved }: {
  label: string; rows: CxPRow[]; today: string; showApprove: boolean; onApproved: () => void
}) {
  const [open, setOpen] = useState(false)
  const total = sum(rows)
  return (
    <div style={{ borderBottom: '1px solid rgba(122,145,165,0.1)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', width: '100%',
          padding: '12px 20px', background: 'none', border: 'none',
          cursor: 'pointer', gap: 10, textAlign: 'left',
        }}
      >
        <span style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-dark)', fontWeight: 400 }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-numeric)', fontSize: '0.8125rem', color: 'var(--hh-haze)' }}>{rows.length} fact.</span>
        <span style={{ fontFamily: 'var(--font-numeric)', fontSize: '0.8125rem', color: 'var(--hh-dark)', minWidth: 110, textAlign: 'right' }}>{fmt(total)}</span>
        <span style={{ color: 'var(--hh-haze)', fontSize: '0.7rem', marginLeft: 4 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 20px 16px' }}>
          <RowTable rows={rows} today={today} showApprove={showApprove} onApproved={onApproved} />
        </div>
      )}
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

const VIEW_TABS: { key: ViewMode; label: string }[] = [
  { key: 'ALL',          label: 'Todas' },
  { key: 'VENCIDO',      label: 'Vencidas' },
  { key: 'BY_PROVEEDOR', label: 'Por Proveedor' },
  { key: 'BY_EMPRESA',   label: 'Por Empresa' },
  { key: 'APROBADO',     label: 'Aprobadas' },
  { key: 'PENDIENTE',    label: 'Pendiente Aprobación' },
]

export function CxPPage() {
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<CxPRow[]>([])
  const [selectedEmpresa, setSelectedEmpresa] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('ALL')
  const today = new Date().toISOString().split('T')[0]
  const endOfMonth = (() => {
    const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString().split('T')[0]
  })()

  const load = useCallback(async () => {
    setLoading(true)
    const PAGE = 1000
    let from = 0
    const all: CxPRow[] = []
    while (true) {
      const { data } = await supabase
        .from('cxp_facturas')
        .select('id, proveedor, nit, no_factura, concepto, tipo_documento, fecha_factura, fecha_vencimiento, valor_total, empresa, aprobado, orden_prioridad, doc_url, comprobante_url')
        .eq('pagado', 'POR PAGAR')
        .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
        .range(from, from + PAGE - 1)
      if (!data || data.length === 0) break
      all.push(...(data as CxPRow[]))
      if (data.length < PAGE) break
      from += PAGE
    }
    setRows(all)
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const empresas = useMemo(() => {
    const codes = new Set(rows.map(r => r.empresa).filter(Boolean) as string[])
    return EMPRESA_ORDER.filter(c => codes.has(c))
  }, [rows])

  const filtered = useMemo(() =>
    selectedEmpresa ? rows.filter(r => r.empresa === selectedEmpresa) : rows
  , [rows, selectedEmpresa])

  // Cards
  const aprobadas  = useMemo(() => filtered.filter(r => r.aprobado?.toUpperCase() === 'SI'), [filtered])
  const pendientes = useMemo(() => filtered.filter(r => {
    if (r.aprobado?.toUpperCase() === 'SI') return false
    return !!(r.fecha_vencimiento && r.fecha_vencimiento <= endOfMonth)
  }), [filtered, endOfMonth])
  const vencidas   = useMemo(() => filtered.filter(r => isVencida(r, today)), [filtered, today])

  // View rows
  const viewRows = useMemo(() => {
    switch (view) {
      case 'VENCIDO':   return filtered.filter(r => isVencida(r, today))
      case 'APROBADO':  return filtered.filter(r => r.aprobado?.toUpperCase() === 'SI')
      case 'PENDIENTE': return filtered.filter(r => r.aprobado?.toUpperCase() !== 'SI')
      default:          return filtered
    }
  }, [filtered, view, today])

  // Groups for BY_PROVEEDOR / BY_EMPRESA
  const groups = useMemo(() => {
    if (view !== 'BY_PROVEEDOR' && view !== 'BY_EMPRESA') return []
    const key = view === 'BY_PROVEEDOR' ? 'proveedor' : 'empresa'
    const map = new Map<string, CxPRow[]>()
    for (const r of filtered) {
      const k = (r[key] ?? 'Sin dato').trim()
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(r)
    }
    return [...map.entries()]
      .sort((a, b) => {
        if (view === 'BY_EMPRESA') {
          const ia = EMPRESA_ORDER.indexOf(a[0]); const ib = EMPRESA_ORDER.indexOf(b[0])
          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
        }
        return a[0].localeCompare(b[0], 'es')
      })
  }, [filtered, view])

  const totalFiltered = sum(filtered)

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: '1.75rem', color: 'var(--hh-dark)', margin: '0 0 4px' }}>
          Cuentas por Pagar
        </h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--hh-haze)', margin: 0, fontWeight: 300 }}>
          Facturas con estado POR PAGAR
          {!loading && (
            <> · {filtered.length} facturas · <strong style={{ color: 'var(--hh-dark)' }}>{fmt(totalFiltered)}</strong></>
          )}
        </p>
      </div>

      {/* Empresa filter */}
      {!loading && empresas.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
          <EmpresaBtn label="Todas" active={selectedEmpresa === null} color={null}
            onClick={() => setSelectedEmpresa(null)} />
          {empresas.map(code => (
            <EmpresaBtn key={code} label={code} active={selectedEmpresa === code}
              color={EMPRESA_COLORS[code] ?? null}
              onClick={() => setSelectedEmpresa(selectedEmpresa === code ? null : code)} />
          ))}
        </div>
      )}

      {/* Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <SummaryCard
          title="Facturas Aprobadas"
          count={aprobadas.length} total={sum(aprobadas)}
          accent="var(--hh-teal)" loading={loading}
          onClick={() => setView('APROBADO')}
        />
        <SummaryCard
          title="Pendiente Aprobación"
          count={pendientes.length} total={sum(pendientes)}
          accent="var(--hh-lemon)" loading={loading}
          onClick={() => setView('PENDIENTE')}
        />
        <SummaryCard
          title="Cartera Vencida"
          count={vencidas.length} total={sum(vencidas)}
          accent="var(--hh-mango)" loading={loading}
          onClick={() => setView('VENCIDO')}
        />
      </div>

      {/* View tabs */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16, borderBottom: '1px solid rgba(122,145,165,0.15)', paddingBottom: 0 }}>
        {VIEW_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            style={{
              fontFamily: 'var(--font-body)', fontSize: '0.8125rem', fontWeight: view === t.key ? 500 : 400,
              color: view === t.key ? 'var(--hh-dark)' : 'var(--hh-haze)',
              background: 'none', border: 'none', borderBottom: view === t.key ? '2px solid var(--hh-dark)' : '2px solid transparent',
              padding: '8px 14px', cursor: 'pointer', marginBottom: -1, transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-haze)' }}>
          Cargando…
        </div>
      ) : (view === 'BY_PROVEEDOR' || view === 'BY_EMPRESA') ? (
        <div style={{ background: 'var(--hh-white)', borderRadius: 10, border: '1px solid rgba(122,145,165,0.15)', overflow: 'hidden' }}>
          {groups.length === 0 ? (
            <EmptyState />
          ) : groups.map(([label, gRows]) => (
            <GroupSection
              key={label} label={label} rows={gRows} today={today}
              showApprove={view === 'BY_PROVEEDOR'}
              onApproved={() => void load()}
            />
          ))}
        </div>
      ) : (
        <div style={{ background: 'var(--hh-white)', borderRadius: 10, border: '1px solid rgba(122,145,165,0.15)', overflow: 'auto' }}>
          {viewRows.length === 0 ? (
            <EmptyState />
          ) : (
            <div style={{ padding: '0 20px 16px' }}>
              <RowTable
                rows={viewRows} today={today}
                showApprove={view === 'PENDIENTE'}
                onApproved={() => void load()}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmpresaBtn({ label, active, color, onClick }: { label: string; active: boolean; color: string | null; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 500,
        padding: '4px 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
        background: active ? (color ?? 'var(--hh-dark)') : 'rgba(122,145,165,0.12)',
        color: active ? '#fff' : 'var(--hh-haze)',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  )
}

function EmptyState() {
  return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-haze)' }}>
      Sin facturas en esta vista.
    </div>
  )
}
