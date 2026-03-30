import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, Pencil1Icon } from '@radix-ui/react-icons'
import { supabase } from '../lib/supabase'
import type { Supplier } from '../types/supplier'

const TABS = ['Resumen', 'Legal', 'Bancario', 'Documentos', 'Evaluación', 'B Corp', 'Gasto'] as const
type Tab = typeof TABS[number]

export function SupplierProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('Resumen')

  useEffect(() => {
    if (!id) return
    void (async () => {
      const { data, error } = await supabase
        .from('accounts_suppliers')
        .select('id, name, razon_social, nombre_operativo, nit, documento_tipo, tipo_persona, email, telefono, categoria, status, created_at, updated_at')
        .eq('id', id)
        .single()
      if (!error) setSupplier(data as Supplier)
      setLoading(false)
    })()
  }, [id])

  const displayName = supplier
    ? (supplier.razon_social || supplier.name)
    : '—'

  return (
    <div>
      {/* Back button */}
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: 'none',
          color: 'var(--hh-haze)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.8125rem',
          cursor: 'pointer',
          padding: 0,
          marginBottom: 24,
        }}
      >
        <ArrowLeftIcon width={16} height={16} />
        Proveedores
      </button>

      {/* Page title */}
      {loading ? (
        <div style={{ height: 36, width: 280, borderRadius: 4, background: 'rgba(122,145,165,0.15)', marginBottom: 28 }} />
      ) : (
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 300,
            fontSize: '1.75rem',
            color: 'var(--hh-dark)',
            margin: '0 0 28px',
            lineHeight: 1.2,
          }}
        >
          {displayName}
        </h1>
      )}

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 0,
          borderBottom: '1px solid rgba(122,145,165,0.2)',
          marginBottom: 32,
        }}
      >
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: activeTab === tab ? 500 : 400,
              fontSize: '0.8125rem',
              color: activeTab === tab ? 'var(--hh-teal)' : 'var(--hh-haze)',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid var(--hh-teal)' : '2px solid transparent',
              padding: '10px 18px',
              cursor: 'pointer',
              marginBottom: -1,
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Resumen' ? (
        <ResumenTab supplier={supplier} loading={loading} onUpdate={setSupplier} />
      ) : activeTab === 'Gasto' ? (
        <GastoTab supplierId={id ?? null} />
      ) : (
        <ComingSoon tab={activeTab} />
      )}
    </div>
  )
}

/* ─── Resumen Tab ─────────────────────────────────────────── */

interface ResumenTabProps {
  supplier: Supplier | null
  loading: boolean
  onUpdate: (s: Supplier) => void
}

function ResumenTab({ supplier, loading, onUpdate }: ResumenTabProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [draft, setDraft] = useState<Partial<Supplier>>({})

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const startEdit = () => {
    if (!supplier) return
    setDraft({
      razon_social: supplier.razon_social ?? '',
      nombre_operativo: supplier.nombre_operativo ?? '',
      nit: supplier.nit ?? '',
      documento_tipo: supplier.documento_tipo ?? '',
      tipo_persona: supplier.tipo_persona ?? '',
      email: supplier.email ?? '',
      telefono: supplier.telefono ?? '',
      categoria: supplier.categoria ?? '',
      status: supplier.status,
    })
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setDraft({})
  }

  const saveEdit = async () => {
    if (!supplier) return
    setSaving(true)
    const { data, error } = await supabase
      .from('accounts_suppliers')
      .update({ ...draft, updated_at: new Date().toISOString() })
      .eq('id', supplier.id)
      .select()
      .single()
    setSaving(false)
    if (error) {
      showToast('Error al guardar los cambios.')
    } else {
      onUpdate(data as Supplier)
      setEditing(false)
      setDraft({})
      showToast('Cambios guardados.')
    }
  }

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 28,
            right: 28,
            background: 'var(--hh-dark)',
            color: 'var(--hh-ice)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.8125rem',
            padding: '12px 20px',
            borderRadius: 6,
            zIndex: 100,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          }}
        >
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Identidad card */}
        <SectionCard
          title="Identidad"
          action={
            !editing ? (
              <button onClick={startEdit} style={ghostBtnStyle}>
                <Pencil1Icon width={14} height={14} />
                Editar
              </button>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={cancelEdit} style={ghostBtnStyle}>Cancelar</button>
                <button onClick={saveEdit} disabled={saving} style={primaryBtnStyle}>
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            )
          }
        >
          {loading ? (
            <SkeletonFields />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: '20px 32px',
              }}
            >
              <Field
                label="Razón Social"
                value={editing ? (draft.razon_social ?? '') : (supplier?.razon_social ?? null)}
                editing={editing}
                onChange={v => setDraft(d => ({ ...d, razon_social: v }))}
              />
              <Field
                label="Nombre Operativo"
                value={editing ? (draft.nombre_operativo ?? '') : (supplier?.nombre_operativo ?? null)}
                editing={editing}
                onChange={v => setDraft(d => ({ ...d, nombre_operativo: v }))}
              />
              <Field
                label="NIT"
                value={editing ? (draft.nit ?? '') : (supplier?.nit ?? null)}
                editing={editing}
                onChange={v => setDraft(d => ({ ...d, nit: v }))}
              />
              <Field
                label="Tipo de Documento"
                value={editing ? (draft.documento_tipo ?? '') : (supplier?.documento_tipo ?? null)}
                editing={editing}
                onChange={v => setDraft(d => ({ ...d, documento_tipo: v }))}
              />
              <Field
                label="Tipo de Persona"
                value={editing ? (draft.tipo_persona ?? '') : (supplier?.tipo_persona ?? null)}
                editing={editing}
                onChange={v => setDraft(d => ({ ...d, tipo_persona: v }))}
              />
              <Field
                label="Email"
                value={editing ? (draft.email ?? '') : (supplier?.email ?? null)}
                editing={editing}
                onChange={v => setDraft(d => ({ ...d, email: v }))}
              />
              <Field
                label="Teléfono"
                value={editing ? (draft.telefono ?? '') : (supplier?.telefono ?? null)}
                editing={editing}
                onChange={v => setDraft(d => ({ ...d, telefono: v }))}
              />
              <Field
                label="Categoría"
                value={editing ? (draft.categoria ?? '') : (supplier?.categoria ?? null)}
                editing={editing}
                onChange={v => setDraft(d => ({ ...d, categoria: v }))}
              />
              <div>
                <p style={labelStyle}>Estado</p>
                {editing ? (
                  <select
                    value={draft.status ?? ''}
                    onChange={e => setDraft(d => ({ ...d, status: e.target.value as Supplier['status'] }))}
                    style={inputStyle}
                  >
                    <option value="">—</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                ) : (
                  <p style={valueStyle}>
                    {supplier?.status ? <StatusBadge status={supplier.status} /> : <Muted>—</Muted>}
                  </p>
                )}
              </div>
            </div>
          )}
        </SectionCard>

        {/* Acceso del proveedor card */}
        <SectionCard title="Acceso del proveedor">
          <div style={{ maxWidth: 360 }}>
            <p style={labelStyle}>Email del proveedor</p>
            <p style={{ ...valueStyle, marginBottom: 20 }}>
              {supplier?.email ?? <Muted>Sin email registrado</Muted>}
            </p>
            <button
              onClick={() => showToast('Funcionalidad próximamente')}
              style={{
                ...primaryBtnStyle,
                width: '100%',
                justifyContent: 'center',
                padding: '11px 20px',
                fontSize: '0.875rem',
              }}
            >
              Enviar enlace de acceso
            </button>
            <p style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--hh-haze)', fontWeight: 300, lineHeight: 1.5 }}>
              El proveedor recibirá un enlace mágico para acceder a su perfil.
            </p>
          </div>
        </SectionCard>
      </div>
    </>
  )
}

/* ─── Gasto Tab ───────────────────────────────────────────── */

interface SpendMonthRow {
  entity: string
  year: number
  month: number
  amount_cop: number
}

interface YearData {
  year: number
  total: number
  months: number[] // length 12, index 0 = Jan
}

interface EntityData {
  entity: string
  years: YearData[]
}

const ENTITY_COLORS: Record<string, { bg: string; text: string }> = {
  BA: { bg: '#566778', text: '#fff' },
  TH: { bg: '#B9484E', text: '#fff' },
  PM: { bg: '#FC0083', text: '#fff' },
  GA: { bg: '#98B250', text: '#fff' },
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatCOPFull(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-CO')
}

function formatCOPShort(n: number): string {
  if (n >= 1_000_000_000) return '$' + Math.round(n / 1_000_000_000) + 'B'
  if (n >= 1_000_000)     return '$' + Math.round(n / 1_000_000) + 'M'
  return '$' + Math.round(n).toLocaleString('es-CO')
}

function GastoTab({ supplierId }: { supplierId: string | null }) {
  const [entities, setEntities] = useState<EntityData[]>([])
  const [loading, setLoading] = useState(true)
  // Tracks which year pills are expanded: key = "entity|year"
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!supplierId) return
    void (async () => {
      const { data, error } = await supabase
        .from('suppliers_spend_monthly')
        .select('entity, year, month, amount_cop')
        .eq('supplier_id', supplierId)
        .order('entity')
        .order('year')
        .order('month')

      if (error || !data) { setLoading(false); return }

      // Group into EntityData[]
      const entityMap = new Map<string, Map<number, number[]>>()
      for (const row of data as SpendMonthRow[]) {
        if (!entityMap.has(row.entity)) entityMap.set(row.entity, new Map())
        const yearMap = entityMap.get(row.entity)!
        if (!yearMap.has(row.year)) yearMap.set(row.year, Array(12).fill(0))
        yearMap.get(row.year)![row.month - 1] = row.amount_cop
      }

      const result: EntityData[] = Array.from(entityMap.entries()).map(([entity, yearMap]) => ({
        entity,
        years: Array.from(yearMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([year, months]) => ({
            year,
            months,
            total: months.reduce((s, v) => s + v, 0),
          })),
      }))

      setEntities(result)
      setLoading(false)
    })()
  }, [supplierId])

  const toggleYear = (entity: string, year: number) => {
    const key = `${entity}|${year}`
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
        {[100, 140, 80].map((w, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ ...shimmerStyle, width: 36, height: 22, borderRadius: 99 }} />
            <span style={{ ...shimmerStyle, width: w, height: 22, borderRadius: 6 }} />
            <span style={{ ...shimmerStyle, width: w - 20, height: 22, borderRadius: 6 }} />
          </div>
        ))}
      </div>
    )
  }

  if (entities.length === 0) {
    return (
      <div style={{ paddingTop: 48, textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 300,
          fontStyle: 'italic',
          fontSize: '1rem',
          color: 'var(--hh-haze)',
          margin: 0,
        }}>
          Este proveedor no tiene historial de gasto registrado.
        </p>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--hh-white)',
      border: '1px solid rgba(122,145,165,0.2)',
      borderRadius: 8,
      padding: '24px 28px',
    }}>
      <h2 style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 300,
        fontSize: '1.0625rem',
        color: 'var(--hh-dark)',
        margin: '0 0 20px',
      }}>
        Historial de Gasto
      </h2>

      <div>
        {entities.map(({ entity, years }) => {
          const color = ENTITY_COLORS[entity] ?? { bg: 'var(--hh-haze)', text: '#fff' }

          // Find which year (if any) is currently expanded for this entity
          const expandedYear = years.find(y => expanded.has(`${entity}|${y.year}`))

          return (
            <div key={entity} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              {/* Entity pill */}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '3px 10px',
                borderRadius: 99,
                background: color.bg,
                color: color.text,
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: '0.6875rem',
                letterSpacing: '0.05em',
                flexShrink: 0,
                marginTop: 3,
              }}>
                {entity}
              </span>

              {/* Year pills + expanded month grid */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {years.map(({ year, total }) => {
                    const key = `${entity}|${year}`
                    const isOpen = expanded.has(key)
                    return (
                      <button
                        key={year}
                        onClick={() => toggleYear(entity, year)}
                        style={{
                          fontFamily: 'var(--font-body)',
                          fontWeight: 400,
                          fontSize: '0.75rem',
                          background: isOpen ? 'var(--hh-dark)' : 'var(--hh-ice)',
                          color: isOpen ? 'var(--hh-ice)' : 'var(--hh-dark)',
                          border: `1px solid ${isOpen ? 'var(--hh-dark)' : 'var(--hh-haze)'}`,
                          borderRadius: 6,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          transition: 'all 0.15s',
                        }}
                      >
                        {year} · {formatCOPShort(total)}
                      </button>
                    )
                  })}
                </div>

                {/* Expanded month grid */}
                {expandedYear && (
                  <div style={{
                    marginTop: 10,
                    background: 'var(--hh-white)',
                    border: '1px solid rgba(122,145,165,0.15)',
                    borderRadius: 6,
                    padding: '14px 16px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(12, 1fr)',
                    gap: '4px 8px',
                  }}>
                    {MONTH_LABELS.map((label, i) => {
                      const amount = expandedYear.months[i]
                      return (
                        <div key={label} style={{ textAlign: 'right' }}>
                          <p style={{
                            fontFamily: 'var(--font-body)',
                            fontWeight: 300,
                            fontSize: '0.6875rem',
                            color: 'var(--hh-haze)',
                            margin: '0 0 3px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                          }}>
                            {label}
                          </p>
                          <p style={{
                            fontFamily: 'var(--font-body)',
                            fontWeight: amount > 0 ? 400 : 300,
                            fontSize: '0.75rem',
                            color: amount > 0 ? 'var(--hh-dark)' : 'var(--hh-haze)',
                            margin: 0,
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {amount > 0 ? formatCOPFull(amount) : '—'}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const shimmerStyle: React.CSSProperties = {
  display: 'inline-block',
  background: 'linear-gradient(90deg, rgba(122,145,165,0.1) 25%, rgba(122,145,165,0.2) 50%, rgba(122,145,165,0.1) 75%)',
  backgroundSize: '200% 100%',
  animation: 'shimmer 1.4s infinite',
}

/* ─── Shared sub-components ───────────────────────────────── */

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--hh-white)',
        border: '1px solid rgba(122,145,165,0.2)',
        borderRadius: 8,
        padding: '24px 28px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 300,
            fontSize: '1.0625rem',
            color: 'var(--hh-dark)',
            margin: 0,
          }}
        >
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  )
}

function Field({ label, value, editing, onChange }: {
  label: string
  value: string | null
  editing: boolean
  onChange: (v: string) => void
}) {
  return (
    <div>
      <p style={labelStyle}>{label}</p>
      {editing ? (
        <input
          type="text"
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
        />
      ) : (
        <p style={valueStyle}>{value || <Muted>—</Muted>}</p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'ACTIVE'
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: 99,
      background: isActive ? 'rgba(74,155,142,0.12)' : 'rgba(122,145,165,0.12)',
      color: isActive ? 'var(--hh-teal)' : 'var(--hh-haze)',
      fontSize: '0.75rem',
      fontWeight: 500,
      textTransform: 'uppercase' as const,
      letterSpacing: '0.06em',
    }}>
      {isActive ? 'Activo' : 'Inactivo'}
    </span>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: 'var(--hh-haze)' }}>{children}</span>
}

function SkeletonFields() {
  const shimmer: React.CSSProperties = {
    background: 'linear-gradient(90deg, rgba(122,145,165,0.1) 25%, rgba(122,145,165,0.2) 50%, rgba(122,145,165,0.1) 75%)',
    backgroundSize: '200% 100%',
    borderRadius: 4,
    animation: 'shimmer 1.4s infinite',
    height: 14,
    display: 'block',
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px 32px' }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i}>
          <span style={{ ...shimmer, width: 80, marginBottom: 8 }} />
          <span style={{ ...shimmer, width: '90%' }} />
        </div>
      ))}
    </div>
  )
}

function ComingSoon({ tab }: { tab: string }) {
  return (
    <div style={{ paddingTop: 48, textAlign: 'center' }}>
      <p style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic', fontSize: '1.25rem', color: 'var(--hh-haze)' }}>
        {tab} — Próximamente
      </p>
    </div>
  )
}

/* ─── Style constants ─────────────────────────────────────── */

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  fontSize: '0.6875rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--hh-teal)',
  margin: '0 0 4px',
}

const valueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 400,
  fontSize: '0.875rem',
  color: 'var(--hh-dark)',
  margin: 0,
}

const inputStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 400,
  fontSize: '0.875rem',
  color: 'var(--hh-dark)',
  background: 'var(--hh-ice)',
  border: '1px solid var(--hh-haze)',
  borderRadius: 4,
  padding: '6px 10px',
  width: '100%',
  outline: 'none',
}

const ghostBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: 'transparent',
  border: '1px solid var(--hh-haze)',
  color: 'var(--hh-dark)',
  fontFamily: 'var(--font-body)',
  fontWeight: 400,
  fontSize: '0.8125rem',
  padding: '6px 12px',
  borderRadius: 4,
  cursor: 'pointer',
}

const primaryBtnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: 'var(--hh-teal)',
  border: 'none',
  color: '#fff',
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  fontSize: '0.8125rem',
  padding: '6px 16px',
  borderRadius: 4,
  cursor: 'pointer',
}
