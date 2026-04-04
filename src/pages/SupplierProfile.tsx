import { useState, useEffect, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, Pencil1Icon, EyeOpenIcon, EyeClosedIcon, CheckCircledIcon, DownloadIcon } from '@radix-ui/react-icons'
import { useAuth } from '../context/AuthContext'
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
      ) : activeTab === 'Legal' ? (
        <LegalTab supplier={supplier} supplierId={id ?? null} />
      ) : activeTab === 'Bancario' ? (
        <BancarioTab supplierId={id ?? null} />
      ) : activeTab === 'Documentos' ? (
        <DocumentosTab supplierId={id ?? null} />
      ) : activeTab === 'Evaluación' ? (
        <EvaluacionTab supplierId={id ?? null} />
      ) : activeTab === 'Gasto' ? (
        <GastoTab supplierId={id ?? null} nit={supplier?.nit ?? null} />
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

/* ─── Legal Tab ──────────────────────────────────────────── */

const BOLIVAR_TOWNS = new Set([
  'Turbaco', 'Arjona', 'Mahates', 'Clemencia', 'Santa Rosa', 'Villanueva',
  'San Estanislao', 'Soplaviento', 'Calamar', 'El Guamo',
  'San Juan Nepomuceno', 'María la Baja', 'Zambrano',
])

const COLOMBIAN_CITIES = [
  'Cartagena',
  'Turbaco', 'Arjona', 'Mahates', 'Clemencia', 'Santa Rosa', 'Villanueva',
  'San Estanislao', 'Soplaviento', 'Calamar', 'El Guamo',
  'San Juan Nepomuceno', 'María la Baja', 'Zambrano',
  'Bogotá', 'Medellín', 'Cali', 'Barranquilla', 'Bucaramanga',
  'Pereira', 'Santa Marta', 'Ibagué', 'Pasto', 'Manizales',
  'Neiva', 'Villavicencio', 'Armenia', 'Montería', 'Valledupar',
  'Sincelejo', 'Popayán', 'Tunja', 'Riohacha', 'Quibdó',
  'Florencia', 'Yopal', 'Arauca', 'Mocoa',
]

function computeZone(ciudad: string): string {
  const c = ciudad.trim()
  if (!c) return ''
  if (c.toLowerCase() === 'cartagena') return 'Cartagena'
  if (BOLIVAR_TOWNS.has(c)) return 'Bolivar'
  if (COLOMBIAN_CITIES.includes(c)) return 'Colombia'
  return 'ROW'
}

interface LegalData {
  id: string
  supplier_id: string
  codigo_tributario: string | null
  ciiu: string | null
  direccion: string | null
  ciudad: string | null
  pais: string | null
  proximity_zone: string | null
}

type LegalDraft = Omit<LegalData, 'id' | 'supplier_id'>

interface Retencion {
  id: string
  supplier_id: string
  tipo: string
  concepto: string | null
  tarifa_recomendada: number | null
  base_minima: number | null
  tarifa_aplicada: number | null
  aplica: boolean
  notas: string | null
}

const ZONE_COLORS: Record<string, { bg: string; text: string }> = {
  Cartagena: { bg: 'var(--hh-teal)',  text: '#fff' },
  Bolivar:   { bg: 'var(--hh-lemon)', text: 'var(--hh-dark)' },
  Colombia:  { bg: 'var(--hh-haze)',  text: '#fff' },
  ROW:       { bg: 'var(--hh-dark)',  text: 'var(--hh-ice)' },
}

function LegalTab({ supplier, supplierId }: { supplier: Supplier | null; supplierId: string | null }) {
  const [legalData, setLegalData] = useState<LegalData | null>(null)
  const [loadingLegal, setLoadingLegal] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [draft, setDraft] = useState<LegalDraft>({
    codigo_tributario: null, ciiu: null, direccion: null,
    ciudad: null, pais: 'Colombia', proximity_zone: null,
  })

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!supplierId) return
    void (async () => {
      const { data } = await supabase
        .from('suppliers_legal')
        .select('*')
        .eq('supplier_id', supplierId)
        .maybeSingle()
      setLegalData((data as LegalData) ?? null)
      setLoadingLegal(false)
    })()
  }, [supplierId])

  const startEdit = () => {
    setDraft({
      codigo_tributario: legalData?.codigo_tributario ?? null,
      ciiu: legalData?.ciiu ?? null,
      direccion: legalData?.direccion ?? null,
      ciudad: legalData?.ciudad ?? null,
      pais: legalData?.pais ?? 'Colombia',
      proximity_zone: legalData?.proximity_zone ?? null,
    })
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setDraft({ codigo_tributario: null, ciiu: null, direccion: null, ciudad: null, pais: 'Colombia', proximity_zone: null })
  }

  const setField = <K extends keyof LegalDraft>(key: K, value: LegalDraft[K]) => {
    setDraft(d => {
      const next = { ...d, [key]: value }
      if (key === 'ciudad') next.proximity_zone = computeZone(String(value ?? '')) || null
      return next
    })
  }

  const saveEdit = async () => {
    if (!supplierId) return
    setSaving(true)
    const payload = { ...draft, supplier_id: supplierId, updated_at: new Date().toISOString() }
    if (legalData?.id) {
      const { data, error } = await supabase.from('suppliers_legal').update(payload).eq('id', legalData.id).select().single()
      setSaving(false)
      if (error) { showToast('Error al guardar los cambios.'); return }
      setLegalData(data as LegalData)
    } else {
      const { data, error } = await supabase.from('suppliers_legal').insert(payload).select().single()
      setSaving(false)
      if (error) { showToast('Error al guardar los cambios.'); return }
      setLegalData(data as LegalData)
    }
    setEditing(false)
    showToast('Cambios guardados.')
  }

  const zone = editing ? (draft.proximity_zone ?? '') : (legalData?.proximity_zone ?? '')
  const zoneColor = zone ? ZONE_COLORS[zone] : null

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28,
          background: 'var(--hh-dark)', color: 'var(--hh-ice)',
          fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
          padding: '12px 20px', borderRadius: 6, zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <SectionCard
          title="Información Legal"
          action={
            !editing ? (
              <button onClick={startEdit} style={ghostBtnStyle}>
                <Pencil1Icon width={14} height={14} />
                {legalData ? 'Editar' : 'Agregar'}
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
          {loadingLegal ? (
            <SkeletonFields />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px 32px' }}>

              {/* NIT (read-only) + DIAN button */}
              <div>
                <p style={labelStyle}>NIT</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
                  <p style={{ ...valueStyle, margin: 0 }}>{supplier?.nit || <Muted>—</Muted>}</p>
                  <button
                    onClick={() => showToast('Integración DIAN próximamente')}
                    style={{ ...primaryBtnStyle, fontSize: '0.72rem', padding: '3px 9px' }}
                  >
                    Consultar DIAN →
                  </button>
                </div>
              </div>

              {/* Tipo Persona (read-only) */}
              <div>
                <p style={labelStyle}>Tipo Persona</p>
                <p style={valueStyle}>{supplier?.tipo_persona || <Muted>—</Muted>}</p>
              </div>

              <Field
                label="Código Tributario"
                value={editing ? (draft.codigo_tributario ?? '') : (legalData?.codigo_tributario ?? null)}
                editing={editing}
                onChange={v => setField('codigo_tributario', v || null)}
              />

              <Field
                label="CIIU"
                value={editing ? (draft.ciiu ?? '') : (legalData?.ciiu ?? null)}
                editing={editing}
                onChange={v => setField('ciiu', v || null)}
              />

              <Field
                label="Dirección"
                value={editing ? (draft.direccion ?? '') : (legalData?.direccion ?? null)}
                editing={editing}
                onChange={v => setField('direccion', v || null)}
              />

              {/* Ciudad — text + datalist */}
              <div>
                <p style={labelStyle}>Ciudad</p>
                {editing ? (
                  <>
                    <input
                      type="text"
                      list="ciudad-datalist"
                      value={draft.ciudad ?? ''}
                      onChange={e => setField('ciudad', e.target.value || null)}
                      placeholder="Ciudad…"
                      style={inputStyle}
                    />
                    <datalist id="ciudad-datalist">
                      {COLOMBIAN_CITIES.map(c => <option key={c} value={c} />)}
                    </datalist>
                  </>
                ) : (
                  <p style={valueStyle}>{legalData?.ciudad || <Muted>—</Muted>}</p>
                )}
              </div>

              <Field
                label="País"
                value={editing ? (draft.pais ?? 'Colombia') : (legalData?.pais ?? 'Colombia')}
                editing={editing}
                onChange={v => setField('pais', v || null)}
              />

              {/* Zona de Proximidad (computed, read-only) */}
              <div>
                <p style={labelStyle}>Zona de Proximidad</p>
                {zone && zoneColor ? (
                  <span style={{
                    display: 'inline-block',
                    padding: '3px 12px',
                    borderRadius: 99,
                    background: zoneColor.bg,
                    color: zoneColor.text,
                    fontFamily: 'var(--font-body)',
                    fontWeight: 500,
                    fontSize: '0.75rem',
                    letterSpacing: '0.04em',
                  }}>
                    {zone}
                  </span>
                ) : (
                  <p style={valueStyle}><Muted>—</Muted></p>
                )}
              </div>

            </div>
          )}
        </SectionCard>

        {!loadingLegal && <RetencionesCard supplierId={supplierId} showToast={showToast} />}
      </div>
    </>
  )
}

/* ─── Retenciones Card ───────────────────────────────────── */

function RetencionesCard({ supplierId, showToast }: { supplierId: string | null; showToast: (m: string) => void }) {
  const [rows, setRows] = useState<Retencion[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftRows, setDraftRows] = useState<Retencion[]>([])
  const [counter, setCounter] = useState(0)

  useEffect(() => {
    if (!supplierId) return
    void (async () => {
      const { data } = await supabase
        .from('suppliers_retenciones')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('created_at')
      setRows((data as Retencion[]) ?? [])
      setLoading(false)
    })()
  }, [supplierId])

  const startEdit = () => { setDraftRows(rows.map(r => ({ ...r }))); setEditing(true) }
  const cancelEdit = () => { setEditing(false); setDraftRows([]) }

  const addRow = () => {
    const tempId = `new-${counter}`
    setCounter(c => c + 1)
    setDraftRows(prev => [...prev, {
      id: tempId,
      supplier_id: supplierId ?? '',
      tipo: 'RetenFuente',
      concepto: null,
      tarifa_recomendada: null,
      base_minima: null,
      tarifa_aplicada: null,
      aplica: true,
      notas: null,
    }])
  }

  const updateRow = (id: string, field: keyof Retencion, value: unknown) => {
    setDraftRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
  }

  const saveEdit = async () => {
    if (!supplierId) return
    setSaving(true)
    try {
      const isNew = (id: string) => id.startsWith('new-')
      const existing = draftRows.filter(r => !isNew(r.id))
      const added    = draftRows.filter(r =>  isNew(r.id))

      for (const r of existing) {
        await supabase.from('suppliers_retenciones').update({
          tipo: r.tipo, concepto: r.concepto,
          tarifa_recomendada: r.tarifa_recomendada, base_minima: r.base_minima,
          tarifa_aplicada: r.tarifa_aplicada, aplica: r.aplica, notas: r.notas,
          updated_at: new Date().toISOString(),
        }).eq('id', r.id)
      }

      if (added.length > 0) {
        await supabase.from('suppliers_retenciones').insert(added.map(r => ({
          supplier_id: supplierId,
          tipo: r.tipo, concepto: r.concepto,
          tarifa_recomendada: r.tarifa_recomendada, base_minima: r.base_minima,
          tarifa_aplicada: r.tarifa_aplicada, aplica: r.aplica, notas: r.notas,
        })))
      }

      const { data } = await supabase
        .from('suppliers_retenciones').select('*')
        .eq('supplier_id', supplierId).order('created_at')
      setRows((data as Retencion[]) ?? [])
      setEditing(false)
      showToast('Retenciones guardadas.')
    } catch {
      showToast('Error al guardar las retenciones.')
    } finally {
      setSaving(false)
    }
  }

  const displayRows = editing ? draftRows : rows

  return (
    <SectionCard
      title="Retenciones"
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
      ) : displayRows.length === 0 && !editing ? (
        <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '0.875rem', color: 'var(--hh-haze)', margin: 0 }}>
          Sin retenciones registradas.
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(122,145,165,0.2)' }}>
                {['Tipo', 'Concepto', 'Tarifa Rec. (%)', 'Base Mínima (COP)', 'Tarifa Aplic. (%)', 'Aplica', 'Notas'].map(h => (
                  <th key={h} style={retThStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayRows.map((r, idx) => (
                <tr key={r.id} style={{ background: idx % 2 === 1 ? 'var(--hh-ice)' : 'var(--hh-white)' }}>
                  <td style={retTdStyle}>
                    {editing ? (
                      <select value={r.tipo} onChange={e => updateRow(r.id, 'tipo', e.target.value)} style={{ ...inputStyle, width: 'auto' }}>
                        <option>RetenFuente</option>
                        <option>ReteICA</option>
                        <option>ReteIVA</option>
                      </select>
                    ) : (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', fontWeight: 500 }}>{r.tipo}</span>
                    )}
                  </td>
                  <td style={retTdStyle}>
                    {editing
                      ? <input type="text" value={r.concepto ?? ''} onChange={e => updateRow(r.id, 'concepto', e.target.value || null)} style={inputStyle} />
                      : <span style={retValStyle}>{r.concepto ?? <Muted>—</Muted>}</span>}
                  </td>
                  <td style={retTdStyle}>
                    {editing
                      ? <input type="number" value={r.tarifa_recomendada ?? ''} onChange={e => updateRow(r.id, 'tarifa_recomendada', e.target.value ? Number(e.target.value) : null)} style={{ ...inputStyle, width: 72 }} />
                      : <span style={{ ...retValStyle, fontVariantNumeric: 'tabular-nums' }}>{r.tarifa_recomendada != null ? `${r.tarifa_recomendada}%` : <Muted>—</Muted>}</span>}
                  </td>
                  <td style={retTdStyle}>
                    {editing
                      ? <input type="number" value={r.base_minima ?? ''} onChange={e => updateRow(r.id, 'base_minima', e.target.value ? Number(e.target.value) : null)} style={{ ...inputStyle, width: 110 }} />
                      : <span style={{ ...retValStyle, fontVariantNumeric: 'tabular-nums' }}>{r.base_minima != null ? `$${Math.round(r.base_minima).toLocaleString('es-CO')}` : <Muted>—</Muted>}</span>}
                  </td>
                  <td style={retTdStyle}>
                    {editing
                      ? <input type="number" value={r.tarifa_aplicada ?? ''} onChange={e => updateRow(r.id, 'tarifa_aplicada', e.target.value ? Number(e.target.value) : null)} style={{ ...inputStyle, width: 72 }} />
                      : <span style={{ ...retValStyle, fontVariantNumeric: 'tabular-nums' }}>{r.tarifa_aplicada != null ? `${r.tarifa_aplicada}%` : <Muted>—</Muted>}</span>}
                  </td>
                  <td style={retTdStyle}>
                    {editing ? (
                      <input type="checkbox" checked={r.aplica} onChange={e => updateRow(r.id, 'aplica', e.target.checked)}
                        style={{ cursor: 'pointer', width: 16, height: 16 }} />
                    ) : (
                      <span style={{
                        display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                        background: r.aplica ? 'rgba(74,155,142,0.12)' : 'rgba(122,145,165,0.12)',
                        color: r.aplica ? 'var(--hh-teal)' : 'var(--hh-haze)',
                        fontSize: '0.75rem', fontWeight: 500,
                      }}>
                        {r.aplica ? 'Sí' : 'No'}
                      </span>
                    )}
                  </td>
                  <td style={retTdStyle}>
                    {editing
                      ? <input type="text" value={r.notas ?? ''} onChange={e => updateRow(r.id, 'notas', e.target.value || null)} style={inputStyle} />
                      : <span style={retValStyle}>{r.notas ?? <Muted>—</Muted>}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <button onClick={addRow} style={{ ...ghostBtnStyle, marginTop: 12 }}>
          + Agregar retención
        </button>
      )}
    </SectionCard>
  )
}

/* ─── Bancario Tab ───────────────────────────────────────── */

const COLOMBIAN_BANKS = [
  'Bancolombia', 'Banco de Bogotá', 'Davivienda', 'BBVA', 'Banco Popular',
  'Banco Agrario', 'Colpatria', 'Helm Bank', 'Scotiabank Colpatria',
  'Caja Social', 'Banco Falabella', 'Nequi', 'Daviplata', 'Otro',
]

interface BankingData {
  id: string
  supplier_id: string
  nombre_beneficiario: string | null
  banco: string | null
  tipo_cuenta: string | null
  numero_cuenta: string | null
  tipo_documento_bancolombia: string | null
  verificacion_notas: string | null
  verificado_at: string | null
  verificado_por: string | null
}

type BankingDraft = Omit<BankingData, 'id' | 'supplier_id' | 'verificado_at' | 'verificado_por'>

function maskAccount(num: string): string {
  if (num.length <= 4) return num
  return '•••• •••• ' + num.slice(-4)
}

function BancarioTab({ supplierId }: { supplierId: string | null }) {
  const { session } = useAuth()
  const [data, setData] = useState<BankingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [draft, setDraft] = useState<BankingDraft>({
    nombre_beneficiario: null, banco: null, tipo_cuenta: null,
    numero_cuenta: null, tipo_documento_bancolombia: null, verificacion_notas: null,
  })

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!supplierId) return
    void (async () => {
      const { data: row } = await supabase
        .from('suppliers_banking')
        .select('*')
        .eq('supplier_id', supplierId)
        .maybeSingle()
      setData((row as BankingData) ?? null)
      setLoading(false)
    })()
  }, [supplierId])

  const startEdit = () => {
    setDraft({
      nombre_beneficiario: data?.nombre_beneficiario ?? null,
      banco: data?.banco ?? null,
      tipo_cuenta: data?.tipo_cuenta ?? null,
      numero_cuenta: data?.numero_cuenta ?? null,
      tipo_documento_bancolombia: data?.tipo_documento_bancolombia ?? null,
      verificacion_notas: data?.verificacion_notas ?? null,
    })
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
  }

  const saveEdit = async () => {
    if (!supplierId) return
    setSaving(true)
    const payload = { ...draft, supplier_id: supplierId, updated_at: new Date().toISOString() }
    if (data?.id) {
      const { data: row, error } = await supabase
        .from('suppliers_banking').update(payload).eq('id', data.id).select().single()
      setSaving(false)
      if (error) { showToast('Error al guardar los cambios.'); return }
      setData(row as BankingData)
    } else {
      const { data: row, error } = await supabase
        .from('suppliers_banking').insert(payload).select().single()
      setSaving(false)
      if (error) { showToast('Error al guardar los cambios.'); return }
      setData(row as BankingData)
    }
    setEditing(false)
    showToast('Cambios guardados.')
  }

  const markVerified = async () => {
    if (!supplierId || !data?.id || !session?.user) return
    setVerifying(true)
    const { data: row, error } = await supabase
      .from('suppliers_banking')
      .update({ verificado_at: new Date().toISOString(), verificado_por: session.user.email })
      .eq('id', data.id)
      .select()
      .single()
    setVerifying(false)
    if (error) { showToast('Error al verificar.'); return }
    setData(row as BankingData)
    showToast('Datos bancarios verificados.')
  }

  /* ── Verification status banner ── */
  const VerificationBanner = () => {
    if (loading) return null
    if (!data) {
      return (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(122,145,165,0.08)', border: '1px solid rgba(122,145,165,0.2)',
          borderRadius: 8, padding: '14px 20px',
        }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--hh-haze)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--hh-haze)' }}>
            Sin datos bancarios
          </span>
        </div>
      )
    }
    if (data.verificado_at) {
      const date = new Date(data.verificado_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
          background: 'rgba(74,155,142,0.07)', border: '1px solid rgba(74,155,142,0.25)',
          borderRadius: 8, padding: '14px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircledIcon width={18} height={18} style={{ color: 'var(--hh-teal)', flexShrink: 0 }} />
            <div>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--hh-teal)' }}>
                Verificado
              </span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--hh-haze)', marginLeft: 10 }}>
                {date} · {data.verificado_por}
              </span>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
        background: 'rgba(255,208,0,0.08)', border: '1px solid rgba(255,208,0,0.4)',
        borderRadius: 8, padding: '14px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--hh-lemon)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', fontWeight: 500, color: 'var(--hh-dark)' }}>
            Pendiente verificación
          </span>
        </div>
        <button onClick={markVerified} disabled={verifying} style={primaryBtnStyle}>
          {verifying ? 'Verificando…' : 'Marcar como verificado'}
        </button>
      </div>
    )
  }

  const numCuenta = editing ? (draft.numero_cuenta ?? '') : (data?.numero_cuenta ?? '')

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28,
          background: 'var(--hh-dark)', color: 'var(--hh-ice)',
          fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
          padding: '12px 20px', borderRadius: 6, zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <VerificationBanner />

        <SectionCard
          title="Datos Bancarios"
          action={
            !editing ? (
              <button onClick={startEdit} style={ghostBtnStyle}>
                <Pencil1Icon width={14} height={14} />
                {data ? 'Editar' : 'Agregar'}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px 32px' }}>

              <Field
                label="Nombre Beneficiario"
                value={editing ? (draft.nombre_beneficiario ?? '') : (data?.nombre_beneficiario ?? null)}
                editing={editing}
                onChange={v => setDraft(d => ({ ...d, nombre_beneficiario: v || null }))}
              />

              {/* Banco */}
              <div>
                <p style={labelStyle}>Banco</p>
                {editing ? (
                  <select
                    value={draft.banco ?? ''}
                    onChange={e => setDraft(d => ({ ...d, banco: e.target.value || null }))}
                    style={inputStyle}
                  >
                    <option value="">—</option>
                    {COLOMBIAN_BANKS.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                ) : (
                  <p style={valueStyle}>{data?.banco || <Muted>—</Muted>}</p>
                )}
              </div>

              {/* Tipo de Cuenta */}
              <div>
                <p style={labelStyle}>Tipo de Cuenta</p>
                {editing ? (
                  <select
                    value={draft.tipo_cuenta ?? ''}
                    onChange={e => setDraft(d => ({ ...d, tipo_cuenta: e.target.value || null }))}
                    style={inputStyle}
                  >
                    <option value="">—</option>
                    <option value="Ahorros">Ahorros</option>
                    <option value="Corriente">Corriente</option>
                  </select>
                ) : (
                  <p style={valueStyle}>{data?.tipo_cuenta || <Muted>—</Muted>}</p>
                )}
              </div>

              {/* Número de Cuenta — masked with reveal toggle */}
              <div>
                <p style={labelStyle}>Número de Cuenta</p>
                {editing ? (
                  <input
                    type="text"
                    value={draft.numero_cuenta ?? ''}
                    onChange={e => setDraft(d => ({ ...d, numero_cuenta: e.target.value || null }))}
                    style={inputStyle}
                  />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <p style={{ ...valueStyle, margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {numCuenta
                        ? (revealed ? numCuenta : <span style={{ color: 'var(--hh-haze)' }}>{maskAccount(numCuenta)}</span>)
                        : <Muted>—</Muted>}
                    </p>
                    {numCuenta && (
                      <button
                        onClick={() => setRevealed(r => !r)}
                        style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--hh-haze)', display: 'flex' }}
                      >
                        {revealed ? <EyeClosedIcon width={15} height={15} /> : <EyeOpenIcon width={15} height={15} />}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Tipo Documento Bancolombia */}
              <div>
                <p style={labelStyle}>Tipo Documento Bancolombia</p>
                {editing ? (
                  <select
                    value={draft.tipo_documento_bancolombia ?? ''}
                    onChange={e => setDraft(d => ({ ...d, tipo_documento_bancolombia: e.target.value || null }))}
                    style={inputStyle}
                  >
                    <option value="">—</option>
                    <option value="NIT">NIT</option>
                    <option value="CC">CC</option>
                    <option value="CE">CE</option>
                  </select>
                ) : (
                  <p style={valueStyle}>{data?.tipo_documento_bancolombia || <Muted>—</Muted>}</p>
                )}
              </div>

              {/* Verificación — staff-only note */}
              <div style={{ gridColumn: 'span 2' }}>
                <p style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 6 }}>
                  Verificación
                  <span style={{
                    background: 'var(--hh-lemon)', color: 'var(--hh-dark)',
                    fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em',
                    padding: '1px 6px', borderRadius: 99, textTransform: 'uppercase',
                  }}>
                    Solo staff
                  </span>
                </p>
                {editing ? (
                  <input
                    type="text"
                    value={draft.verificacion_notas ?? ''}
                    onChange={e => setDraft(d => ({ ...d, verificacion_notas: e.target.value || null }))}
                    placeholder="Notas internas sobre la verificación…"
                    style={inputStyle}
                  />
                ) : (
                  <p style={valueStyle}>{data?.verificacion_notas || <Muted>—</Muted>}</p>
                )}
              </div>

            </div>
          )}
        </SectionCard>
      </div>
    </>
  )
}

/* ─── Documentos Tab ─────────────────────────────────────── */

const DOC_TYPES = [
  'RUT',
  'Cámara de Comercio',
  'Cédula Rep. Legal',
  'Certificado Bancario',
  'Certificación Ambiental',
  'Otro',
] as const

const ACCEPTED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

interface DocRow {
  id: string
  supplier_id: string
  document_type: string
  storage_path: string
  file_name: string
  file_size_bytes: number | null
  mime_type: string | null
  uploaded_by: string | null
  created_at: string
}

function DocumentosTab({ supplierId }: { supplierId: string | null }) {
  const { session } = useAuth()
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [uploadType, setUploadType] = useState<string>(DOC_TYPES[0])
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const fetchDocs = async () => {
    if (!supplierId) return
    const { data } = await supabase
      .from('suppliers_documents')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('created_at', { ascending: false })
    setDocs((data as DocRow[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { void fetchDocs() }, [supplierId])

  const handleUpload = async () => {
    if (!supplierId || !uploadFile) return
    if (!ACCEPTED_MIME.includes(uploadFile.type)) {
      showToast('Tipo de archivo no permitido. Use PDF, JPG, PNG o WEBP.')
      return
    }
    if (uploadFile.size > MAX_BYTES) {
      showToast('El archivo supera el límite de 10 MB.')
      return
    }
    setUploading(true)
    const storagePath = `${supplierId}/${uploadType}/${uploadFile.name}`
    const { error: uploadError } = await supabase.storage
      .from('supplier-documents')
      .upload(storagePath, uploadFile, { upsert: true })
    if (uploadError) {
      setUploading(false)
      showToast('Error al subir el archivo.')
      return
    }
    const { error: dbError } = await supabase.from('suppliers_documents').insert({
      supplier_id: supplierId,
      document_type: uploadType,
      storage_path: storagePath,
      file_name: uploadFile.name,
      file_size_bytes: uploadFile.size,
      mime_type: uploadFile.type,
      uploaded_by: session?.user?.email ?? null,
    })
    setUploading(false)
    if (dbError) { showToast('Archivo subido pero error al registrar.'); return }
    setUploadFile(null)
    const input = document.getElementById('doc-file-input') as HTMLInputElement | null
    if (input) input.value = ''
    showToast('Documento subido correctamente.')
    void fetchDocs()
  }

  const handleDownload = async (doc: DocRow) => {
    const { data, error } = await supabase.storage
      .from('supplier-documents')
      .createSignedUrl(doc.storage_path, 60)
    if (error || !data?.signedUrl) { showToast('Error al generar enlace de descarga.'); return }
    window.open(data.signedUrl, '_blank')
  }

  const handleDelete = async (doc: DocRow) => {
    setDeletingId(doc.id)
    const { error: storageErr } = await supabase.storage
      .from('supplier-documents')
      .remove([doc.storage_path])
    if (storageErr) { setDeletingId(null); showToast('Error al eliminar el archivo.'); return }
    await supabase.from('suppliers_documents').delete().eq('id', doc.id)
    setDeletingId(null)
    showToast('Documento eliminado.')
    void fetchDocs()
  }

  const formatBytes = (b: number | null) => {
    if (!b) return ''
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })

  // Group by document_type, preserving predefined order
  const grouped = DOC_TYPES.reduce<Record<string, DocRow[]>>((acc, t) => {
    const rows = docs.filter(d => d.document_type === t)
    if (rows.length) acc[t] = rows
    return acc
  }, {} as Record<string, DocRow[]>)
  // Also catch any "Otro" or unknown types not in predefined list
  docs.forEach(d => {
    if (!DOC_TYPES.includes(d.document_type as typeof DOC_TYPES[number]) && !grouped[d.document_type]) {
      grouped[d.document_type] = docs.filter(x => x.document_type === d.document_type)
    }
  })

  const isStaff = !!session?.user

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28,
          background: 'var(--hh-dark)', color: 'var(--hh-ice)',
          fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
          padding: '12px 20px', borderRadius: 6, zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading ? (
          <SkeletonFields />
        ) : Object.keys(grouped).length === 0 ? (
          <p style={{
            fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic',
            fontSize: '1.0625rem', color: 'var(--hh-haze)', margin: '32px 0',
          }}>
            No hay documentos subidos aún.
          </p>
        ) : (
          Object.entries(grouped).map(([type, rows]) => (
            <div key={type} style={{
              background: 'var(--hh-white)',
              border: '1px solid rgba(122,145,165,0.2)',
              borderRadius: 8,
              padding: '20px 24px',
            }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 500,
                fontSize: '0.6875rem', textTransform: 'uppercase',
                letterSpacing: '0.12em', color: 'var(--hh-haze)',
                margin: '0 0 14px',
              }}>
                {type}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rows.map(doc => (
                  <div key={doc.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, flexWrap: 'wrap',
                    padding: '10px 14px',
                    background: 'var(--hh-ice)',
                    borderRadius: 6,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontFamily: 'var(--font-body)', fontWeight: 500,
                        fontSize: '0.875rem', color: 'var(--hh-dark)',
                        margin: '0 0 2px',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {doc.file_name}
                      </p>
                      <p style={{
                        fontFamily: 'var(--font-body)', fontWeight: 300,
                        fontSize: '0.75rem', color: 'var(--hh-haze)', margin: 0,
                      }}>
                        {formatDate(doc.created_at)}
                        {doc.file_size_bytes ? ` · ${formatBytes(doc.file_size_bytes)}` : ''}
                        {' · '}
                        {doc.uploaded_by ?? 'Proveedor'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => handleDownload(doc)} style={ghostBtnStyle}>
                        Descargar
                      </button>
                      {isStaff && (
                        <button
                          onClick={() => handleDelete(doc)}
                          disabled={deletingId === doc.id}
                          style={{
                            ...ghostBtnStyle,
                            borderColor: 'rgba(220,53,69,0.4)',
                            color: deletingId === doc.id ? 'var(--hh-haze)' : '#dc3545',
                          }}
                        >
                          {deletingId === doc.id ? 'Eliminando…' : 'Eliminar'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}

        {/* Upload area */}
        <div style={{
          background: 'var(--hh-white)',
          border: '1px solid rgba(122,145,165,0.2)',
          borderRadius: 8,
          padding: '20px 24px',
        }}>
          <p style={{
            fontFamily: 'var(--font-display)', fontWeight: 300,
            fontSize: '1.0625rem', color: 'var(--hh-dark)',
            margin: '0 0 16px',
          }}>
            Subir documento
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <p style={{ ...labelStyle, marginBottom: 6 }}>Tipo de documento</p>
              <select
                value={uploadType}
                onChange={e => setUploadType(e.target.value)}
                style={{ ...inputStyle, width: 220 }}
              >
                {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <p style={{ ...labelStyle, marginBottom: 6 }}>Archivo</p>
              <input
                id="doc-file-input"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={e => setUploadFile(e.target.files?.[0] ?? null)}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
                  color: 'var(--hh-dark)', cursor: 'pointer',
                }}
              />
            </div>
            <button
              onClick={handleUpload}
              disabled={!uploadFile || uploading}
              style={{
                ...primaryBtnStyle,
                opacity: !uploadFile || uploading ? 0.6 : 1,
                cursor: !uploadFile || uploading ? 'not-allowed' : 'pointer',
              }}
            >
              {uploading ? 'Subiendo…' : 'Subir documento'}
            </button>
          </div>
          <p style={{
            fontFamily: 'var(--font-body)', fontWeight: 300,
            fontSize: '0.75rem', color: 'var(--hh-haze)',
            margin: '10px 0 0',
          }}>
            PDF, JPG, PNG o WEBP · Máximo 10 MB
          </p>
        </div>
      </div>
    </>
  )
}

/* ─── Evaluación Tab ─────────────────────────────────────── */

interface QuestionOption {
  label: string
  score: number
}

interface Question {
  key: string
  text: string
  maxScore: number
  options: QuestionOption[]
}

const HST_QUESTIONS: Question[] = [
  {
    key: 'q1', text: '¿Qué tipo de organización es?', maxScore: 5,
    options: [
      { label: 'Empresa Formal', score: 5 },
      { label: 'Empresa Social / Beneficio e Interés Colectivo', score: 3 },
      { label: 'Cooperativo', score: 4 },
      { label: 'ESAL / ONG', score: 1 },
      { label: 'Empresa Informal o Persona Natural', score: 0 },
      { label: 'Otro', score: 0 },
    ],
  },
  {
    key: 'q2', text: '¿De dónde es la organización?', maxScore: 5,
    options: [
      { label: 'Cartagena', score: 5 },
      { label: 'Bolívar', score: 3 },
      { label: 'Colombia', score: 2 },
      { label: 'Extranjería', score: 0 },
    ],
  },
  {
    key: 'q3', text: '¿Cuántas personas trabajan en la organización?', maxScore: 4,
    options: [
      { label: 'Menos de 10', score: 4 },
      { label: 'Entre 10 y 50', score: 3 },
      { label: 'Más de 50', score: 1 },
    ],
  },
  {
    key: 'q4', text: '¿Conocimos o podemos hablar con el dueño/a o representante legal?', maxScore: 3,
    options: [
      { label: 'Sí', score: 3 },
      { label: 'No', score: 0 },
    ],
  },
  {
    key: 'q5', text: '¿En cuál estrato está ubicada su operación principal?', maxScore: 5,
    options: [
      { label: '0, 1 o 2', score: 5 },
      { label: '3 o 4', score: 2 },
      { label: '5 o 6', score: 0 },
      { label: 'No sé / No aplica', score: 0 },
    ],
  },
  {
    key: 'q6', text: '¿Los líderes de la organización son de una minoría?', maxScore: 3,
    options: [
      { label: 'Sí', score: 3 },
      { label: 'No', score: 0 },
    ],
  },
  {
    key: 'q7', text: '¿La organización tiene y muestra públicamente un compromiso ambiental?', maxScore: 3,
    options: [
      { label: 'Sí', score: 3 },
      { label: 'No', score: 0 },
    ],
  },
  {
    key: 'q8', text: '¿La organización tiene y muestra públicamente un compromiso sociocultural?', maxScore: 3,
    options: [
      { label: 'Sí', score: 3 },
      { label: 'No', score: 0 },
    ],
  },
  {
    key: 'q9', text: '¿Está la empresa o el producto certificado?', maxScore: 5,
    options: [
      { label: 'Sí', score: 5 },
      { label: 'No', score: 0 },
    ],
  },
  {
    key: 'q10', text: '¿Sus productos o servicios tienen como propósito principal mejorar impactos ambiental o sociocultural?', maxScore: 3,
    options: [
      { label: 'Sí', score: 3 },
      { label: 'No', score: 0 },
      { label: 'No sé', score: 0 },
    ],
  },
  {
    key: 'q11', text: '¿Sus colaboradores están contratados formalmente con sueldo digno y prestaciones sociales?', maxScore: 5,
    options: [
      { label: 'Sí', score: 5 },
      { label: 'No', score: 0 },
      { label: 'No Aplica', score: 0 },
    ],
  },
  {
    key: 'q12', text: '¿Han visitado Blue Apple o Townhouse en los últimos 12 meses?', maxScore: 3,
    options: [
      { label: 'Sí', score: 3 },
      { label: 'No', score: 0 },
    ],
  },
  {
    key: 'q13', text: '¿Están dispuestos a mandar fotos o permitir una inspección presencial?', maxScore: 3,
    options: [
      { label: 'Sí', score: 3 },
      { label: 'No', score: 0 },
    ],
  },
]

const MAX_TOTAL = HST_QUESTIONS.reduce((s, q) => s + q.maxScore, 0) // 50

type Answers = Record<string, string> // key → option label

interface AssessmentRow {
  id: string
  supplier_id: string
  answers: Answers
  total_score: number
  pass: boolean
  assessed_at: string
  assessed_by: string | null
}

function computeScore(answers: Answers): number {
  return HST_QUESTIONS.reduce((sum, q) => {
    const selected = q.options.find(o => o.label === answers[q.key])
    return sum + (selected?.score ?? 0)
  }, 0)
}

function EvaluacionTab({ supplierId }: { supplierId: string | null }) {
  const { session } = useAuth()
  const [row, setRow] = useState<AssessmentRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [draft, setDraft] = useState<Answers>({})

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!supplierId) return
    void (async () => {
      const { data } = await supabase
        .from('suppliers_assessment')
        .select('*')
        .eq('supplier_id', supplierId)
        .maybeSingle()
      setRow((data as AssessmentRow) ?? null)
      setLoading(false)
    })()
  }, [supplierId])

  const startEdit = () => {
    setDraft(row?.answers ?? {})
    setEditing(true)
  }

  const cancelEdit = () => {
    setEditing(false)
    setDraft({})
  }

  const saveEdit = async () => {
    if (!supplierId) return
    setSaving(true)
    const score = computeScore(draft)
    const pass = score >= 30
    const payload = {
      supplier_id: supplierId,
      answers: draft,
      total_score: score,
      pass,
      assessed_at: new Date().toISOString(),
      assessed_by: session?.user?.email ?? null,
    }
    if (row?.id) {
      const { data, error } = await supabase
        .from('suppliers_assessment').update(payload).eq('id', row.id).select().single()
      setSaving(false)
      if (error) { showToast('Error al guardar la evaluación.'); return }
      setRow(data as AssessmentRow)
    } else {
      const { data, error } = await supabase
        .from('suppliers_assessment').insert(payload).select().single()
      setSaving(false)
      if (error) { showToast('Error al guardar la evaluación.'); return }
      setRow(data as AssessmentRow)
    }
    setEditing(false)
    setDraft({})
    showToast('Evaluación guardada.')
  }

  const liveScore = computeScore(draft)
  const answeredCount = Object.keys(draft).length

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28,
          background: 'var(--hh-dark)', color: 'var(--hh-ice)',
          fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
          padding: '12px 20px', borderRadius: 6, zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}

      <SectionCard
        title="Happy Supplier Test"
        action={
          !editing ? (
            <button onClick={startEdit} style={ghostBtnStyle}>
              <Pencil1Icon width={14} height={14} />
              {row ? 'Editar' : 'Evaluar'}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={cancelEdit} style={ghostBtnStyle}>Cancelar</button>
              <button onClick={saveEdit} disabled={saving || answeredCount < HST_QUESTIONS.length} style={{
                ...primaryBtnStyle,
                opacity: saving || answeredCount < HST_QUESTIONS.length ? 0.6 : 1,
                cursor: saving || answeredCount < HST_QUESTIONS.length ? 'not-allowed' : 'pointer',
              }}>
                {saving ? 'Guardando…' : 'Guardar evaluación'}
              </button>
            </div>
          )
        }
      >
        {loading ? (
          <SkeletonFields />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            {/* Score display — shown in read mode when row exists */}
            {!editing && row && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
                paddingBottom: 24, borderBottom: '1px solid rgba(122,145,165,0.15)',
              }}>
                <span style={{
                  fontFamily: 'var(--font-display)', fontWeight: 300,
                  fontSize: '2.5rem', color: 'var(--hh-dark)', lineHeight: 1,
                }}>
                  {row.total_score}<span style={{ fontSize: '1.25rem', color: 'var(--hh-haze)' }}>/{MAX_TOTAL}</span>
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 14px', borderRadius: 99, fontFamily: 'var(--font-body)',
                  fontWeight: 500, fontSize: '0.8125rem',
                  background: row.pass ? 'rgba(74,155,142,0.12)' : 'rgba(220,53,69,0.1)',
                  color: row.pass ? 'var(--hh-teal)' : '#dc3545',
                }}>
                  {row.pass ? 'Aprobado ✓' : 'No aprobado'}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '0.8125rem', color: 'var(--hh-haze)' }}>
                  {formatDate(row.assessed_at)}{row.assessed_by ? ` · ${row.assessed_by}` : ''}
                </span>
              </div>
            )}

            {/* Questions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {HST_QUESTIONS.map((q, idx) => {
                const selected = editing ? draft[q.key] : row?.answers?.[q.key]
                return (
                  <div key={q.key}>
                    <p style={{
                      fontFamily: 'var(--font-body)', fontWeight: 500,
                      fontSize: '0.875rem', color: 'var(--hh-dark)',
                      margin: '0 0 10px',
                    }}>
                      <span style={{ color: 'var(--hh-haze)', marginRight: 8, fontWeight: 300 }}>
                        {idx + 1}.
                      </span>
                      {q.text}
                      <span style={{ color: 'var(--hh-haze)', fontWeight: 300, marginLeft: 8, fontSize: '0.75rem' }}>
                        (máx. {q.maxScore} pts)
                      </span>
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}>
                      {q.options.map(opt => {
                        const isSelected = selected === opt.label
                        return editing ? (
                          <label key={opt.label} style={{
                            display: 'flex', alignItems: 'center', gap: 7,
                            cursor: 'pointer',
                            fontFamily: 'var(--font-body)', fontSize: '0.875rem',
                            color: isSelected ? 'var(--hh-teal)' : 'var(--hh-dark)',
                            fontWeight: isSelected ? 500 : 400,
                            padding: '6px 12px',
                            borderRadius: 6,
                            background: isSelected ? 'rgba(74,155,142,0.08)' : 'transparent',
                            border: `1px solid ${isSelected ? 'rgba(74,155,142,0.35)' : 'rgba(122,145,165,0.2)'}`,
                            transition: 'all 0.1s',
                          }}>
                            <input
                              type="radio"
                              name={q.key}
                              value={opt.label}
                              checked={isSelected}
                              onChange={() => setDraft(d => ({ ...d, [q.key]: opt.label }))}
                              style={{ accentColor: 'var(--hh-teal)', width: 15, height: 15, flexShrink: 0 }}
                            />
                            {opt.label}
                            <span style={{ color: 'var(--hh-haze)', fontSize: '0.75rem', fontWeight: 300 }}>
                              {opt.score} pt{opt.score !== 1 ? 's' : ''}
                            </span>
                          </label>
                        ) : (
                          isSelected ? (
                            <span key={opt.label} style={{
                              display: 'inline-block', padding: '4px 12px', borderRadius: 99,
                              fontFamily: 'var(--font-body)', fontSize: '0.875rem',
                              background: 'rgba(74,155,142,0.08)',
                              color: 'var(--hh-teal)', fontWeight: 500,
                              border: '1px solid rgba(74,155,142,0.25)',
                            }}>
                              {opt.label}
                            </span>
                          ) : null
                        )
                      })}
                      {!editing && !selected && (
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-haze)', fontWeight: 300 }}>—</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Live score preview during edit */}
            {editing && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 12,
                padding: '16px 20px',
                background: 'var(--hh-ice)',
                borderRadius: 8,
                border: '1px solid rgba(122,145,165,0.2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '0.875rem', color: 'var(--hh-haze)' }}>
                    Puntaje actual:
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: '1.5rem',
                    color: liveScore >= 30 ? 'var(--hh-teal)' : 'var(--hh-dark)',
                  }}>
                    {liveScore}<span style={{ fontSize: '0.875rem', color: 'var(--hh-haze)' }}>/{MAX_TOTAL}</span>
                  </span>
                  {liveScore >= 30 && (
                    <span style={{
                      fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.75rem',
                      color: 'var(--hh-teal)', background: 'rgba(74,155,142,0.1)',
                      padding: '2px 10px', borderRadius: 99,
                    }}>
                      Aprobado ✓
                    </span>
                  )}
                </div>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '0.8125rem', color: 'var(--hh-haze)' }}>
                  {answeredCount}/{HST_QUESTIONS.length} preguntas respondidas
                </span>
              </div>
            )}

          </div>
        )}
      </SectionCard>
    </>
  )
}

/* ─── Gasto Tab ───────────────────────────────────────��───── */

interface TxRow {
  id: string
  source: string
  fecha_operacion: string | null
  fecha_factura: string | null
  proveedor: string | null
  nit: string | null
  importe_cop: number | null
  monto_base: number | null
  total_iva: number | null
  total_ipc: number | null
  rete_fuente: number | null
  rete_ica: number | null
  concepto: string | null
  centro_costo: string | null
  empresa: string | null
  no_fac: string | null
}

interface CppRow {
  id: string
  fecha_operacion: string | null
  fecha_factura: string | null
  fecha_vencimiento: string | null
  nit: string | null
  importe_cop: number | null
  concepto: string | null
  centro_costo: string | null
  empresa: string | null
  no_fac: string | null
  aprobado: string | null
}

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

function GastoTab({ supplierId, nit }: { supplierId: string | null; nit: string | null }) {
  const [txns, setTxns] = useState<TxRow[]>([])
  const [cpp, setCpp] = useState<CppRow[]>([])
  const [txLoading, setTxLoading] = useState(true)
  const [entities, setEntities] = useState<EntityData[]>([])
  const [histLoading, setHistLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500) }

  // Financial data by NIT
  useEffect(() => {
    if (!nit) { setTxLoading(false); return }
    void (async () => {
      const [{ data: txData }, { data: cppData }] = await Promise.all([
        supabase.from('transactions_cache').select('*').eq('nit', nit).order('fecha_operacion', { ascending: false }),
        supabase.from('cuentas_por_pagar_cache').select('*').eq('nit', nit).order('fecha_operacion', { ascending: false }),
      ])
      setTxns((txData as TxRow[]) ?? [])
      setCpp((cppData as CppRow[]) ?? [])
      setTxLoading(false)
    })()
  }, [nit])

  // Historial by supplierId
  useEffect(() => {
    if (!supplierId) { setHistLoading(false); return }
    void (async () => {
      const { data, error } = await supabase
        .from('suppliers_spend_monthly')
        .select('entity, year, month, amount_cop')
        .eq('supplier_id', supplierId)
        .order('entity').order('year').order('month')
      if (error || !data) { setHistLoading(false); return }
      const entityMap = new Map<string, Map<number, number[]>>()
      for (const row of data as SpendMonthRow[]) {
        if (!entityMap.has(row.entity)) entityMap.set(row.entity, new Map())
        const yearMap = entityMap.get(row.entity)!
        if (!yearMap.has(row.year)) yearMap.set(row.year, Array(12).fill(0))
        yearMap.get(row.year)![row.month - 1] = Number(row.amount_cop)
      }
      const result: EntityData[] = Array.from(entityMap.entries()).map(([entity, yearMap]) => ({
        entity,
        years: Array.from(yearMap.entries()).sort(([a], [b]) => a - b).map(([year, months]) => ({
          year, months, total: months.reduce((s, v) => s + v, 0),
        })),
      }))
      const currentYear = new Date().getFullYear()
      const yearSet = new Set<number>([currentYear])
      result.forEach(e => e.years.forEach(y => yearSet.add(y.year)))
      const allYears = [...yearSet].sort((a, b) => a - b)
      setEntities(result.map(e => ({
        ...e,
        years: allYears.map(yr => e.years.find(y => y.year === yr) ?? { year: yr, months: Array(12).fill(0), total: 0 }),
      })))
      setHistLoading(false)
    })()
  }, [supplierId])

  const toggleYear = (entity: string, year: number) => {
    const key = `${entity}|${year}`
    setExpanded(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next })
  }

  // ─── Metrics ───
  const totalPagado = txns.reduce((s, t) => s + (t.importe_cop ?? 0), 0)
  const promedio = txns.length > 0 ? totalPagado / txns.length : 0

  const retRows = (
    [
      { label: 'Rete Fuente', field: 'rete_fuente' },
      { label: 'Rete ICA',    field: 'rete_ica' },
      { label: 'IVA',         field: 'total_iva' },
      { label: 'IPC',         field: 'total_ipc' },
    ] as const
  ).map(({ label, field }) => {
    const rel = txns.filter(t => ((t[field as keyof TxRow] as number | null) ?? 0) > 0)
    const total = rel.reduce((s, t) => s + ((t[field as keyof TxRow] as number) ?? 0), 0)
    const baseSum = rel.reduce((s, t) => s + (t.monto_base ?? 0), 0)
    return { label, total, tasa: baseSum > 0 ? (total / baseSum) * 100 : null, count: rel.length }
  })

  const today = new Date().toISOString().slice(0, 10)
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'

  const downloadCSV = () => {
    const headers = ['Fecha Op','Fecha Fac','Descripción','Clasificación','Importe COP','Empresa','Fuente','No. Factura']
    const rows = txns.map(t => [
      t.fecha_operacion ?? '', t.fecha_factura ?? '', t.concepto ?? '',
      t.centro_costo ?? '', t.importe_cop ?? '', t.empresa ?? '',
      t.source === 'CASHAPP' ? 'Cash App' : 'Banco', t.no_fac ?? 'N/A',
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'transacciones.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const EmpresaPill = ({ empresa }: { empresa: string | null }) => {
    if (!empresa) return <span style={{ color: 'var(--hh-haze)' }}>—</span>
    return (
      <span style={{ display: 'inline-flex', gap: 3, flexWrap: 'wrap' }}>
        {empresa.split('|').map(p => p.trim()).filter(Boolean).map(p => {
          const c = ENTITY_COLORS[p] ?? { bg: 'var(--hh-haze)', text: '#fff' }
          return (
            <span key={p} style={{
              display: 'inline-block', padding: '1px 7px', borderRadius: 99,
              background: c.bg, color: c.text,
              fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.6875rem',
            }}>{p}</span>
          )
        })}
      </span>
    )
  }

  const tblTh = retThStyle
  const tblTd = retTdStyle
  const tblVal = retValStyle

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28, background: 'var(--hh-dark)', color: 'var(--hh-ice)',
          fontFamily: 'var(--font-body)', fontSize: '0.8125rem', padding: '12px 20px',
          borderRadius: 6, zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>{toast}</div>
      )}

      {/* ── Card 1: Resumen Financiero ── */}
      <SectionCard title="Resumen Financiero">
        {txLoading ? <SkeletonFields /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { label: 'Total Pagado', value: formatCOPFull(totalPagado), accent: 'var(--hh-teal)' },
              { label: 'Transacciones', value: txns.length.toLocaleString('es-CO'), accent: 'var(--hh-lemon)' },
              { label: 'Promedio por Tx', value: txns.length > 0 ? formatCOPFull(promedio) : '—', accent: 'var(--hh-haze)' },
            ].map(({ label, value, accent }) => (
              <div key={label} style={{
                background: 'var(--hh-ice)', borderLeft: `4px solid ${accent}`,
                borderRadius: 6, padding: '14px 18px',
              }}>
                <p style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--hh-haze)', margin: '0 0 6px' }}>
                  {label}
                </p>
                <p style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: '1.25rem', color: 'var(--hh-dark)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Card 2: Retenciones Aplicadas ── */}
      <SectionCard title="Retenciones Aplicadas">
        {txLoading ? <SkeletonFields /> : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 420 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(122,145,165,0.2)' }}>
                    {['Concepto', 'Monto', 'Tasa Prom.', 'Txns'].map(h => <th key={h} style={tblTh}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {retRows.map((r, i) => (
                    <tr key={r.label} style={{ background: i % 2 === 1 ? 'var(--hh-ice)' : 'var(--hh-white)' }}>
                      <td style={{ ...tblTd, fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.875rem', color: 'var(--hh-dark)' }}>{r.label}</td>
                      <td style={{ ...tblTd, fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums', color: r.total > 0 ? 'var(--hh-dark)' : 'var(--hh-haze)' }}>
                        {r.total > 0 ? formatCOPFull(r.total) : '—'}
                      </td>
                      <td style={{ ...tblTd, fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: r.tasa != null ? 'var(--hh-dark)' : 'var(--hh-haze)' }}>
                        {r.tasa != null ? `${r.tasa.toFixed(2)}%` : '—'}
                      </td>
                      <td style={{ ...tblTd, fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: r.count > 0 ? 'var(--hh-dark)' : 'var(--hh-haze)' }}>
                        {r.count > 0 ? r.count : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => showToast('Próximamente')} style={{ ...ghostBtnStyle, marginTop: 14 }}>
              Generar Certificado de Retenciones
            </button>
          </>
        )}
      </SectionCard>

      {/* ── Card 3: Todas las Transacciones ── */}
      <SectionCard
        title={`Todas las Transacciones${!txLoading ? ` (${txns.length})` : ''}`}
        action={
          <button onClick={downloadCSV} title="Descargar CSV" style={{ ...ghostBtnStyle, padding: '6px 10px' }}>
            <DownloadIcon width={14} height={14} />
          </button>
        }
      >
        {txLoading ? <SkeletonFields /> : txns.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic', fontSize: '0.9375rem', color: 'var(--hh-haze)', margin: 0 }}>
            Sin transacciones registradas.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(122,145,165,0.2)' }}>
                  {['Fecha Op','Fecha Fac','Descripción','Clasificación','Importe COP','Empresa','Fuente','No. Factura'].map(h => <th key={h} style={tblTh}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {txns.map((t, i) => (
                  <tr key={t.id} style={{ background: i % 2 === 1 ? 'var(--hh-ice)' : 'var(--hh-white)' }}>
                    <td style={tblTd}><span style={{ ...tblVal, whiteSpace: 'nowrap' }}>{fmtDate(t.fecha_operacion)}</span></td>
                    <td style={tblTd}><span style={{ ...tblVal, whiteSpace: 'nowrap' }}>{fmtDate(t.fecha_factura)}</span></td>
                    <td style={{ ...tblTd, maxWidth: 200 }}><span style={{ ...tblVal, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.concepto ?? <span style={{ color: 'var(--hh-haze)' }}>—</span>}</span></td>
                    <td style={tblTd}><span style={{ ...tblVal, whiteSpace: 'nowrap' }}>{t.centro_costo ?? <span style={{ color: 'var(--hh-haze)' }}>—</span>}</span></td>
                    <td style={{ ...tblTd, textAlign: 'right' }}><span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.875rem', color: 'var(--hh-mango)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatCOPFull(t.importe_cop ?? 0)}</span></td>
                    <td style={tblTd}><EmpresaPill empresa={t.empresa} /></td>
                    <td style={tblTd}><span style={tblVal}>{t.source === 'CASHAPP' ? 'Cash App' : 'Banco'}</span></td>
                    <td style={tblTd}><span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 400, color: t.no_fac ? 'var(--hh-teal)' : 'var(--hh-haze)' }}>{t.no_fac ?? 'N/A'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Card 4: Facturas Pagadas ── */}
      <SectionCard title={`Facturas Pagadas${!txLoading ? ` (${txns.length})` : ''}`}>
        {txLoading ? <SkeletonFields /> : txns.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic', fontSize: '0.9375rem', color: 'var(--hh-haze)', margin: 0 }}>
            Sin facturas pagadas.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(122,145,165,0.2)' }}>
                  {['Fecha Op','Importe COP','No. Factura','Fecha Factura','Concepto','Centro de Costo','Empresa'].map(h => <th key={h} style={tblTh}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {txns.map((t, i) => (
                  <tr key={t.id} style={{ background: i % 2 === 1 ? 'var(--hh-ice)' : 'var(--hh-white)' }}>
                    <td style={tblTd}><span style={{ ...tblVal, whiteSpace: 'nowrap' }}>{fmtDate(t.fecha_operacion)}</span></td>
                    <td style={{ ...tblTd, textAlign: 'right' }}><span style={{ ...tblVal, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatCOPFull(t.importe_cop ?? 0)}</span></td>
                    <td style={tblTd}><span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: t.no_fac ? 'var(--hh-teal)' : 'var(--hh-haze)' }}>{t.no_fac ?? 'N/A'}</span></td>
                    <td style={tblTd}><span style={{ ...tblVal, whiteSpace: 'nowrap' }}>{fmtDate(t.fecha_factura)}</span></td>
                    <td style={{ ...tblTd, maxWidth: 180 }}><span style={{ ...tblVal, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.concepto ?? <span style={{ color: 'var(--hh-haze)' }}>—</span>}</span></td>
                    <td style={tblTd}><span style={tblVal}>{t.centro_costo ?? <span style={{ color: 'var(--hh-haze)' }}>—</span>}</span></td>
                    <td style={tblTd}><EmpresaPill empresa={t.empresa} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--hh-dark)' }}>
                  <td style={{ ...tblTd, fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.8125rem', color: 'var(--hh-ice)', borderBottom: 'none' }}>Total Pagado</td>
                  <td style={{ ...tblTd, textAlign: 'right', fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: '0.875rem', color: 'var(--hh-ice)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', borderBottom: 'none' }}>{formatCOPFull(totalPagado)}</td>
                  <td colSpan={5} style={{ ...tblTd, borderBottom: 'none' }} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Card 5: Cuentas por Pagar ── */}
      <SectionCard title={`Cuentas por Pagar${!txLoading ? ` (${cpp.length})` : ''}`}>
        {txLoading ? <SkeletonFields /> : cpp.length === 0 ? (
          <p style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontStyle: 'italic', fontSize: '0.9375rem', color: 'var(--hh-haze)', margin: 0 }}>
            Sin facturas pendientes
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(122,145,165,0.2)' }}>
                  {['Fecha Op','Importe','No. Factura','Fecha Factura','Concepto','Centro de Costo','Empresa','Vencimiento','Aprobado'].map(h => <th key={h} style={tblTh}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {cpp.map((c, i) => {
                  const isOverdue = c.fecha_vencimiento != null && c.fecha_vencimiento < today
                  return (
                    <tr key={c.id} style={{ background: i % 2 === 1 ? 'var(--hh-ice)' : 'var(--hh-white)' }}>
                      <td style={tblTd}><span style={{ ...tblVal, whiteSpace: 'nowrap' }}>{fmtDate(c.fecha_operacion)}</span></td>
                      <td style={{ ...tblTd, textAlign: 'right' }}><span style={{ ...tblVal, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatCOPFull(c.importe_cop ?? 0)}</span></td>
                      <td style={tblTd}><span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: c.no_fac ? 'var(--hh-teal)' : 'var(--hh-haze)' }}>{c.no_fac ?? 'N/A'}</span></td>
                      <td style={tblTd}><span style={{ ...tblVal, whiteSpace: 'nowrap' }}>{fmtDate(c.fecha_factura)}</span></td>
                      <td style={{ ...tblTd, maxWidth: 180 }}><span style={{ ...tblVal, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.concepto ?? <span style={{ color: 'var(--hh-haze)' }}>—</span>}</span></td>
                      <td style={tblTd}><span style={tblVal}>{c.centro_costo ?? <span style={{ color: 'var(--hh-haze)' }}>—</span>}</span></td>
                      <td style={tblTd}><EmpresaPill empresa={c.empresa} /></td>
                      <td style={tblTd}><span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: isOverdue ? 500 : 400, color: isOverdue ? '#dc3545' : 'var(--hh-dark)', whiteSpace: 'nowrap' }}>{fmtDate(c.fecha_vencimiento)}</span></td>
                      <td style={tblTd}>
                        <span style={{
                          display: 'inline-block', padding: '2px 8px', borderRadius: 99,
                          fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.75rem',
                          background: c.aprobado === 'SI' ? 'rgba(74,155,142,0.12)' : 'rgba(220,53,69,0.1)',
                          color: c.aprobado === 'SI' ? 'var(--hh-teal)' : '#dc3545',
                        }}>
                          {c.aprobado === 'SI' ? 'Sí' : 'No'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* ── Historial de Gasto ── */}
      {histLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
          {[100, 140, 80].map((w, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ ...shimmerStyle, width: 36, height: 22, borderRadius: 99 }} />
              <span style={{ ...shimmerStyle, width: w, height: 22, borderRadius: 6 }} />
              <span style={{ ...shimmerStyle, width: w - 20, height: 22, borderRadius: 6 }} />
            </div>
          ))}
        </div>
      ) : entities.length === 0 ? null : (
        <div style={{ background: 'var(--hh-white)', border: '1px solid rgba(122,145,165,0.2)', borderRadius: 8, padding: '24px 28px' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: '1.0625rem', color: 'var(--hh-dark)', margin: '0 0 20px' }}>
            Historial de Gasto
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: `40px repeat(${entities[0]?.years.length ?? 1}, 120px)`, gap: '12px 8px', alignItems: 'start' }}>
            {entities.map(({ entity, years }) => {
              const color = ENTITY_COLORS[entity] ?? { bg: 'var(--hh-haze)', text: '#fff' }
              const expandedYear = years.find(y => expanded.has(`${entity}|${y.year}`))
              return (
                <Fragment key={entity}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '3px 10px', borderRadius: 99, background: color.bg, color: color.text, fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.6875rem', letterSpacing: '0.05em', marginTop: 3 }}>
                    {entity}
                  </span>
                  {years.map(({ year, total }) => {
                    const key = `${entity}|${year}`
                    const isOpen = expanded.has(key)
                    const isEmpty = total === 0
                    return (
                      <button key={year} onClick={() => toggleYear(entity, year)} style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '0.75rem', background: isOpen ? 'var(--hh-dark)' : 'var(--hh-ice)', color: isOpen ? 'var(--hh-ice)' : isEmpty ? 'var(--hh-haze)' : 'var(--hh-dark)', border: `1px solid ${isOpen ? 'var(--hh-dark)' : isEmpty ? 'rgba(122,145,165,0.3)' : 'var(--hh-haze)'}`, borderRadius: 6, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s', width: '100%', textAlign: 'center' }}>
                        {year} · {isEmpty ? '—' : formatCOPShort(total)}
                      </button>
                    )
                  })}
                  {expandedYear && (
                    <div style={{ gridColumn: '1 / -1', marginTop: 2, background: 'var(--hh-white)', border: '1px solid rgba(122,145,165,0.15)', borderRadius: 6, padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '4px 8px' }}>
                      {MONTH_LABELS.map((label, i) => {
                        const amount = expandedYear.months[i]
                        return (
                          <div key={label} style={{ textAlign: 'right' }}>
                            <p style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '0.6875rem', color: 'var(--hh-haze)', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                            <p style={{ fontFamily: 'var(--font-body)', fontWeight: amount > 0 ? 400 : 300, fontSize: '0.75rem', color: amount > 0 ? 'var(--hh-dark)' : 'var(--hh-haze)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                              {amount > 0 ? formatCOPFull(amount) : '—'}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>
        </div>
      )}
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

const retThStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  fontSize: '0.6875rem',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--hh-teal)',
  padding: '8px 12px',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const retTdStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid rgba(122,145,165,0.08)',
  verticalAlign: 'middle',
}

const retValStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 400,
  fontSize: '0.875rem',
  color: 'var(--hh-dark)',
}
