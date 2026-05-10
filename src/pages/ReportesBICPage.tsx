import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/* ─── Entity groups ──────────────────────────────────────────────────────── */

const GROUPS = [
  { key: 'BPM', label: 'BPM',          codes: ['BA'],                                color: 'var(--brand-ba)', textColor: '#fff' },
  { key: 'BMP', label: 'BMP',          codes: ['TH'],                                color: 'var(--brand-th)', textColor: '#fff' },
  { key: 'GA',  label: 'GA',           codes: ['GA'],                                color: 'var(--brand-ga)', textColor: '#658D5E' },
  { key: 'MA',  label: 'Manzana Azul', codes: ['PM', 'MA', 'HH', 'AB', 'AW', 'CR'], color: '#2D6A9F',         textColor: '#fff' },
] as const
type GroupKey = typeof GROUPS[number]['key']

/* ─── CSV export ─────────────────────────────────────────────────────────── */

function downloadCSV(filename: string, headers: string[], rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers, ...rows].map(r => r.map(esc).join(','))
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

function ExportBtn({ onClick, title = 'Descargar Excel' }: { onClick: () => void; title?: string }) {
  return (
    <button onClick={onClick} title={title} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '3px 10px', borderRadius: 6, border: '1px solid rgba(122,145,165,0.25)',
      background: 'transparent', cursor: 'pointer', color: 'var(--hh-haze)',
      fontFamily: 'var(--font-body)', fontSize: '0.7rem', fontWeight: 400,
    }}>
      ↓ xlsx
    </button>
  )
}

/* ─── Formatting ─────────────────────────────────────────────────────────── */

function fmt(n: number) { return '$ ' + Math.round(n).toLocaleString('es-CO') }

/* ─── Data types ─────────────────────────────────────────────────────────── */

interface SpendRow {
  supplier_id: string
  supplier_name_raw: string | null
  entity: string
  year: number
  amount_cop: number
}

interface SupplierInfo {
  id: string
  razon_social: string | null
  nombre_operativo: string | null
  nit: string | null
  bic_survey_score: string | null
  bic_ubicacion: string | null
  bic_ciudad: string | null
  bic_pais: string | null
  bic_independent: string | null
  bic_underserved: string | null
  bic_small_company: string | null
  bic_minoria: string | null
}

interface SupplierRow {
  supplier_id: string
  name: string
  nit: string | null
  total: number
  score: number | null
  location: string
  independent: boolean | null
  underserved: boolean | null
  smallCompany: boolean | null
  minoria: boolean | null
}

interface BoolBucket { yes: SupplierRow[]; no: SupplierRow[]; unknown: SupplierRow[] }

interface YearData {
  year: number
  all: SupplierRow[]
  bigSpenders: SupplierRow[]
  assessed: { passed: SupplierRow[]; failed: SupplierRow[]; none: SupplierRow[] }
  byLocation: { label: string; rows: SupplierRow[] }[]
  independent: BoolBucket
  underserved: BoolBucket
  smallCompany: BoolBucket
  minoria: BoolBucket
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function parseScore(val: string | null): number | null {
  if (!val) return null
  const n = parseFloat(val.replace('%', '').trim())
  if (isNaN(n)) return null
  return n > 0 && n <= 1 ? Math.round(n * 100) : Math.round(n)
}

function parseBool(val: string | null): boolean | null {
  if (!val) return null
  const v = val.trim().toUpperCase()
  if (v === 'TRUE' || v === 'SI' || v === 'SÍ' || v === '1' || v === 'YES'
    || v.startsWith('YES ') || v.startsWith('SI ') || v.startsWith('SÍ ')) return true
  if (v === 'FALSE' || v === 'NO' || v === '0') return false
  return null
}

const LOC_LABELS = ['Isla', 'Cartagena', 'Bolívar', 'Colombia', 'América Latina', 'Exterior', 'Sin datos']

function categorizeLocation(ubicacion: string | null, ciudad: string | null, pais: string | null): string {
  const raw = (ubicacion || ciudad || '').toLowerCase()
  const country = (pais || '').toLowerCase()
  if (!raw && !country) return 'Sin datos'
  if (/isla|bar[uú]|tierra.?bomb|mucura|tintip[aá]n|rosario/.test(raw)) return 'Isla'
  if (raw.includes('cartagena')) return 'Cartagena'
  if (/bol[ií]var|turbaco|mompox|mahates|arjona|san juan nepomuceno/.test(raw)) return 'Bolívar'
  const colCities = /bogot|medell|cali\b|barranquilla|bucaramanga|santa.?marta|pereira|armenia|manizales|c[uú]cuta|ibagu[eé]|villavicencio|pasto|monter[ií]a|valledupar|sincelejo|riohacha|neiva|popay[aá]n|tunja|colombia/
  if (colCities.test(raw) || (country.includes('colombia') && !raw)) return 'Colombia'
  const latam = /m[eé]xico|per[uú]|chile|argentin|brasil|brazil|ecuador|venezuel|bolivi[ae]|paraguay|uruguay|pana[mh][aá]|costa.?rica|guatemala|honduras|nicaragua|salvador|cuba|dominican|ha[ií]t[ií]|latina|latinoam/
  if (latam.test(raw) || latam.test(country)) return 'América Latina'
  if (country && !country.includes('colombia')) return 'Exterior'
  return 'Sin datos'
}

function boolBucket(all: SupplierRow[], key: keyof Pick<SupplierRow, 'independent' | 'underserved' | 'smallCompany' | 'minoria'>): BoolBucket {
  const yes: SupplierRow[] = [], no: SupplierRow[] = [], unknown: SupplierRow[] = []
  for (const r of all) {
    if (r[key] === true) yes.push(r)
    else if (r[key] === false) no.push(r)
    else unknown.push(r)
  }
  return { yes, no, unknown }
}

function sumSpend(rows: SupplierRow[]) { return rows.reduce((s, r) => s + r.total, 0) }

/* ─── Fetch ──────────────────────────────────────────────────────────────── */

async function fetchAllSpend(): Promise<SpendRow[]> {
  const PAGE = 1000
  let from = 0
  const out: SpendRow[] = []
  while (true) {
    const { data, error } = await supabase
      .from('suppliers_spend_monthly')
      .select('supplier_id, supplier_name_raw, entity, year, amount_cop')
      .range(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) break
    out.push(...(data as SpendRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return out
}

/* ─── Sub-components ─────────────────────────────────────────────────────── */

function SupplierList({ rows, showScore }: { rows: SupplierRow[]; showScore: boolean }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8 }}>
      <tbody>
        {rows.map(r => (
          <tr key={r.supplier_id} style={{ borderBottom: '1px solid rgba(122,145,165,0.07)' }}>
            <td style={{ padding: '7px 0', fontSize: '0.8125rem' }}>
              <Link
                to={`/suppliers/${r.supplier_id}`}
                style={{ color: 'var(--hh-dark)', textDecoration: 'none', fontWeight: 400 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hh-teal)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--hh-dark)' }}
              >
                {r.name}
              </Link>
            </td>
            {showScore && (
              <td style={{ padding: '7px 8px', fontSize: '0.8rem', whiteSpace: 'nowrap', fontFamily: 'var(--font-numeric)', color: r.score !== null && r.score >= 60 ? 'var(--hh-teal)' : '#B9484E' }}>
                {r.score !== null ? `${r.score}%` : ''}
              </td>
            )}
            <td style={{ padding: '7px 0', fontSize: '0.8rem', fontFamily: 'var(--font-numeric)', color: 'var(--hh-haze)', textAlign: 'right', whiteSpace: 'nowrap' }}>
              {fmt(r.total)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AssessmentGroup({
  label, rows, color, showScore, defaultOpen, csvPrefix,
}: { label: string; rows: SupplierRow[]; color: string; showScore: boolean; defaultOpen?: boolean; csvPrefix: string }) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const spend = sumSpend(rows)

  const exportRows = () => {
    const headers = showScore ? ['Proveedor', 'NIT', 'Puntaje', 'Gasto'] : ['Proveedor', 'NIT', 'Gasto']
    const data = rows.map(r => showScore
      ? [r.name, r.nit, r.score !== null ? `${r.score}%` : '', Math.round(r.total)]
      : [r.name, r.nit, Math.round(r.total)])
    downloadCSV(`${csvPrefix}-${label.replace(/[^a-zA-Z0-9]/g, '_')}.csv`, headers, data)
  }

  return (
    <div style={{ borderBottom: '1px solid rgba(122,145,165,0.1)', paddingBottom: open ? 12 : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ display: 'flex', alignItems: 'center', flex: 1, padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', gap: 10 }}
        >
          <span style={{ fontSize: '0.8125rem', fontWeight: 500, color, flex: 1, textAlign: 'left' }}>{label}</span>
          <span style={{ fontFamily: 'var(--font-numeric)', fontSize: '0.8125rem', color: 'var(--hh-dark)' }}>{rows.length} prov.</span>
          <span style={{ fontFamily: 'var(--font-numeric)', fontSize: '0.8125rem', color: 'var(--hh-haze)', minWidth: 100, textAlign: 'right' }}>{fmt(spend)}</span>
          <span style={{ color: 'var(--hh-haze)', fontSize: '0.7rem', marginLeft: 4 }}>{open ? '▲' : '▼'}</span>
        </button>
        {rows.length > 0 && <ExportBtn onClick={exportRows} />}
      </div>
      {open && rows.length > 0 && <SupplierList rows={rows} showScore={showScore} />}
    </div>
  )
}

function BoolCard({ label, b, color, csvPrefix }: { label: string; b: BoolBucket; color: string; csvPrefix: string }) {
  const yesSpend = sumSpend(b.yes)
  const noSpend  = sumSpend(b.no)

  const exportBool = () => {
    const headers = ['Proveedor', 'NIT', 'Gasto', label]
    const rows = [
      ...b.yes.map(r => [r.name, r.nit, Math.round(r.total), 'Sí']),
      ...b.no.map(r => [r.name, r.nit, Math.round(r.total), 'No']),
      ...b.unknown.map(r => [r.name, r.nit, Math.round(r.total), '']),
    ]
    downloadCSV(`${csvPrefix}-${label.replace(/[^a-zA-Z0-9]/g, '_')}.csv`, headers, rows)
  }

  return (
    <div style={{ background: 'white', borderRadius: 10, border: '1px solid rgba(122,145,165,0.15)', padding: '14px 18px', flex: '1 1 200px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: '0.65rem', color: 'var(--hh-haze)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
          {label}
        </span>
        <ExportBtn onClick={exportBool} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {([['Sí', b.yes, yesSpend], ['No', b.no, noSpend]] as [string, SupplierRow[], number][]).map(([lbl, rows, spend]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ minWidth: 22, fontSize: '0.75rem', fontWeight: 600, color: lbl === 'Sí' ? color : 'var(--hh-haze)' }}>{lbl}</span>
            <span style={{ fontFamily: 'var(--font-numeric)', fontWeight: 500, fontSize: '0.9rem', color: 'var(--hh-dark)' }}>{rows.length}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--hh-haze)' }}>prov.</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-numeric)', fontSize: '0.8rem', color: 'var(--hh-dark)' }}>{fmt(spend)}</span>
          </div>
        ))}
        {b.unknown.length > 0 && (
          <div style={{ fontSize: '0.75rem', color: 'var(--hh-haze)', marginTop: 2 }}>{b.unknown.length} sin dato</div>
        )}
      </div>
    </div>
  )
}

function BigSpendersCard({ rows, year, color, textColor, csvPrefix }: {
  rows: SupplierRow[]; year: number; color: string; textColor: string; csvPrefix: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid rgba(122,145,165,0.15)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', width: '100%', padding: '14px 20px',
          background: 'none', border: 'none', cursor: 'pointer', gap: 10, textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--hh-haze)', textTransform: 'uppercase', letterSpacing: '0.07em', flex: 1 }}>
          Proveedores &gt; $12M · {year}
        </span>
        {rows.length > 0 && (
          <span style={{ background: color, color: textColor, borderRadius: 10, padding: '1px 8px', fontSize: '0.65rem', fontWeight: 500 }}>
            {rows.length}
          </span>
        )}
        <span style={{ color: 'var(--hh-haze)', fontSize: '0.7rem', marginLeft: 4 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ padding: '0 20px 16px' }}>
          {rows.length === 0
            ? <p style={{ color: 'var(--hh-haze)', fontSize: '0.875rem', margin: 0 }}>Ningún proveedor superó $12M.</p>
            : (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                  <ExportBtn onClick={() => downloadCSV(`${csvPrefix}-12M.csv`,
                    ['Proveedor', 'NIT', 'Gasto'],
                    rows.map(r => [r.name, r.nit, Math.round(r.total)])
                  )} />
                </div>
                <SupplierList rows={rows} showScore={false} />
              </>
            )
          }
        </div>
      )}
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────────────────── */

export function ReportesBICPage() {
  const [loading, setLoading]       = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [spendRows, setSpendRows]   = useState<SpendRow[]>([])
  const [suppliers, setSuppliers]   = useState<Map<string, SupplierInfo>>(new Map())
  const [activeGroup, setActiveGroup] = useState<GroupKey>('BPM')
  const [activeYear, setActiveYear]   = useState<number | null>(null)
  const loadSuppliers = async (ids: string[]) => {
    if (ids.length === 0) return
    const CHUNK = 500
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK))
    const results = await Promise.all(
      chunks.map(chunk =>
        supabase
          .from('accounts_suppliers')
          .select('id, razon_social, nombre_operativo, nit, bic_survey_score, bic_ubicacion, bic_ciudad, bic_pais, bic_independent, bic_underserved, bic_small_company, bic_minoria')
          .in('id', chunk)
      )
    )
    const map = new Map<string, SupplierInfo>()
    for (const { data } of results) {
      for (const s of (data ?? []) as SupplierInfo[]) map.set(s.id, s)
    }
    setSuppliers(map)
  }

  useEffect(() => {
    void (async () => {
      try {
        const rows = await fetchAllSpend()
        setSpendRows(rows)
        await loadSuppliers([...new Set(rows.map(r => r.supplier_id))])
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Error')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const yearDataList = useMemo<YearData[]>(() => {
    const group = GROUPS.find(g => g.key === activeGroup)
    if (!group) return []
    const codeSet = new Set(group.codes)
    const totals  = new Map<string, Map<number, number>>()
    const rawNames = new Map<string, string>()

    for (const row of spendRows) {
      if (!codeSet.has(row.entity as typeof group.codes[number])) continue
      const amount = Number(row.amount_cop ?? 0)
      if (amount <= 0) continue
      if (!totals.has(row.supplier_id)) totals.set(row.supplier_id, new Map())
      const ym = totals.get(row.supplier_id)!
      ym.set(row.year, (ym.get(row.year) ?? 0) + amount)
      if (row.supplier_name_raw && !rawNames.has(row.supplier_id)) rawNames.set(row.supplier_id, row.supplier_name_raw)
    }

    const yearSet = new Set<number>()
    for (const ym of totals.values()) for (const y of ym.keys()) yearSet.add(y)

    return [...yearSet].sort((a, b) => b - a).map(year => {
      const all: SupplierRow[] = []
      for (const [sid, ym] of totals) {
        const total = ym.get(year) ?? 0
        if (total <= 0) continue
        const s = suppliers.get(sid)
        all.push({
          supplier_id: sid,
          name: s?.nombre_operativo || s?.razon_social || rawNames.get(sid) || sid,
          nit: s?.nit ?? null,
          total,
          score: parseScore(s?.bic_survey_score ?? null),
          location: categorizeLocation(s?.bic_ubicacion ?? null, s?.bic_ciudad ?? null, s?.bic_pais ?? null),
          independent: parseBool(s?.bic_independent ?? null),
          underserved: parseBool(s?.bic_underserved ?? null),
          smallCompany: parseBool(s?.bic_small_company ?? null),
          minoria: parseBool(s?.bic_minoria ?? null),
        })
      }
      all.sort((a, b) => b.total - a.total)

      return {
        year,
        all,
        bigSpenders: all.filter(r => r.total >= 12_000_000),
        assessed: {
          passed: all.filter(r => r.score !== null && r.score >= 60).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
          failed: all.filter(r => r.score !== null && r.score < 60).sort((a, b) => (b.score ?? 0) - (a.score ?? 0)),
          none:   all.filter(r => r.score === null),
        },
        byLocation: LOC_LABELS.map(label => ({ label, rows: all.filter(r => r.location === label) })).filter(b => b.rows.length > 0),
        independent: boolBucket(all, 'independent'),
        underserved: boolBucket(all, 'underserved'),
        smallCompany: boolBucket(all, 'smallCompany'),
        minoria: boolBucket(all, 'minoria'),
      }
    })
  }, [spendRows, suppliers, activeGroup])

  useEffect(() => {
    if (yearDataList.length > 0) setActiveYear(yearDataList[0].year)
  }, [activeGroup, yearDataList])

  const currentGroup = GROUPS.find(g => g.key === activeGroup)!
  const yd = yearDataList.find(y => y.year === activeYear)
  const csvPrefix = `BIC-${currentGroup.label}-${activeYear}`

  const SH: React.CSSProperties = {
    fontSize: '0.65rem', fontWeight: 600, color: 'var(--hh-haze)',
    textTransform: 'uppercase', letterSpacing: '0.07em',
  }

  const Card = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid rgba(122,145,165,0.15)', padding: '16px 20px', ...style }}>
      {children}
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: '1.75rem', color: 'var(--hh-dark)', margin: 0 }}>
          Reportes BIC
        </h1>
        <div style={{ marginLeft: 'auto' }} />
      </div>

      {/* Entity tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 28, flexWrap: 'wrap' }}>
        {GROUPS.map(g => (
          <button key={g.key} onClick={() => setActiveGroup(g.key)} style={{
            padding: '6px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: '0.8125rem', fontWeight: 500,
            background: activeGroup === g.key ? g.color : 'rgba(122,145,165,0.12)',
            color: activeGroup === g.key ? g.textColor : 'var(--hh-haze)',
            transition: 'all 0.15s ease',
          }}>{g.label}</button>
        ))}
      </div>

      {loading && <div style={{ color: 'var(--hh-haze)', fontSize: '0.875rem' }}>Cargando datos…</div>}
      {fetchError && <div style={{ color: '#B94848' }}>{fetchError}</div>}
      {!loading && !fetchError && yearDataList.length === 0 && (
        <div style={{ color: 'var(--hh-haze)', fontSize: '0.875rem' }}>Sin datos para {currentGroup.label}.</div>
      )}

      {!loading && !fetchError && yearDataList.length > 0 && (
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

          {/* Year sidebar */}
          <div style={{ minWidth: 72, background: 'white', borderRadius: 12, border: '1px solid rgba(122,145,165,0.15)', overflow: 'hidden', flexShrink: 0 }}>
            {yearDataList.map((y, i) => (
              <button key={y.year} onClick={() => setActiveYear(y.year)} style={{
                display: 'block', width: '100%', padding: '10px 16px', border: 'none',
                borderBottom: i < yearDataList.length - 1 ? '1px solid rgba(122,145,165,0.1)' : 'none',
                background: activeYear === y.year ? currentGroup.color : 'transparent',
                color: activeYear === y.year ? currentGroup.textColor : 'var(--hh-dark)',
                cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.875rem',
                fontWeight: activeYear === y.year ? 500 : 300, textAlign: 'left', transition: 'all 0.15s ease',
              }}>{y.year}</button>
            ))}
          </div>

          {/* Content */}
          {yd && (
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Active count */}
              <Card>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontFamily: 'var(--font-numeric)', fontSize: '2.5rem', fontWeight: 500, color: currentGroup.color, lineHeight: 1 }}>
                    {yd.all.length}
                  </span>
                  <span style={{ color: 'var(--hh-haze)', fontSize: '0.875rem' }}>proveedores activos en {yd.year}</span>
                  <span style={{ marginLeft: 'auto' }}>
                    <ExportBtn onClick={() => downloadCSV(`${csvPrefix}-activos.csv`,
                      ['Proveedor', 'NIT', 'Gasto', 'Puntaje BIC', 'Ubicación', 'Independiente', 'En desventaja', '<50 emp', 'Minoría'],
                      yd.all.map(r => [r.name, r.nit, Math.round(r.total), r.score !== null ? `${r.score}%` : '', r.location,
                        r.independent === true ? 'Sí' : r.independent === false ? 'No' : '',
                        r.underserved === true ? 'Sí' : r.underserved === false ? 'No' : '',
                        r.smallCompany === true ? 'Sí' : r.smallCompany === false ? 'No' : '',
                        r.minoria === true ? 'Sí' : r.minoria === false ? 'No' : ''])
                    )} title="Exportar todos los proveedores activos" />
                  </span>
                </div>
              </Card>

              {/* >12M — collapsible */}
              <BigSpendersCard rows={yd.bigSpenders} year={yd.year} color={currentGroup.color} textColor={currentGroup.textColor} csvPrefix={csvPrefix} />

              {/* Assessment */}
              <Card>
                <div style={{ ...SH, marginBottom: 4 }}>Evaluación BIC</div>
                <AssessmentGroup label="Aprobado (≥ 60%)"    rows={yd.assessed.passed} color="var(--hh-teal)"  showScore defaultOpen={yd.assessed.passed.length > 0} csvPrefix={csvPrefix} />
                <AssessmentGroup label="No aprobado (< 60%)" rows={yd.assessed.failed} color="#B9484E"         showScore csvPrefix={csvPrefix} />
                <AssessmentGroup label="Sin evaluación"       rows={yd.assessed.none}  color="var(--hh-haze)" showScore={false} csvPrefix={csvPrefix} />
              </Card>

              {/* Location */}
              {yd.byLocation.length > 0 && (
                <Card>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
                    <span style={SH}>Ubicación</span>
                    <span style={{ marginLeft: 'auto' }}>
                      <ExportBtn onClick={() => downloadCSV(`${csvPrefix}-ubicacion.csv`,
                        ['Ubicación', 'Proveedores', 'Gasto Total'],
                        yd.byLocation.map(b => [b.label, b.rows.length, Math.round(sumSpend(b.rows))])
                      )} />
                    </span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {yd.byLocation.map(b => (
                        <tr key={b.label} style={{ borderBottom: '1px solid rgba(122,145,165,0.07)' }}>
                          <td style={{ padding: '8px 0', fontSize: '0.8125rem', color: 'var(--hh-dark)' }}>{b.label}</td>
                          <td style={{ padding: '8px 12px', fontSize: '0.8125rem', color: 'var(--hh-haze)', fontFamily: 'var(--font-numeric)' }}>{b.rows.length} prov.</td>
                          <td style={{ padding: '8px 0', fontSize: '0.8125rem', fontFamily: 'var(--font-numeric)', textAlign: 'right', color: 'var(--hh-dark)' }}>{fmt(sumSpend(b.rows))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}

              {/* Boolean breakdowns */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                <BoolCard label="Proveedor independiente" b={yd.independent}  color={currentGroup.color} csvPrefix={csvPrefix} />
                <BoolCard label="Proveedor en desventaja" b={yd.underserved}  color={currentGroup.color} csvPrefix={csvPrefix} />
                <BoolCard label="Menos de 50 empleados"  b={yd.smallCompany} color={currentGroup.color} csvPrefix={csvPrefix} />
                <BoolCard label="Empresa minoría"         b={yd.minoria}      color={currentGroup.color} csvPrefix={csvPrefix} />
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  )
}
