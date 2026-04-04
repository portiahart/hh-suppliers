import { useState, useEffect, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, Pencil1Icon, EyeOpenIcon, EyeClosedIcon, CheckCircledIcon } from '@radix-ui/react-icons'
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

/* ─── Gasto Tab ───────────────────────────────────────��───── */

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
        yearMap.get(row.year)![row.month - 1] = Number(row.amount_cop)
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

      // Normalise all entities to the same set of years, always including the current year
      const currentYear = new Date().getFullYear()
      const yearSet = new Set<number>([currentYear])
      result.forEach(e => e.years.forEach(y => yearSet.add(y.year)))
      const allYears = [...yearSet].sort((a, b) => a - b)

      const normalized: EntityData[] = result.map(e => ({
        ...e,
        years: allYears.map(yr => {
          const existing = e.years.find(y => y.year === yr)
          return existing ?? { year: yr, months: Array(12).fill(0), total: 0 }
        }),
      }))

      setEntities(normalized)
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

      <div style={{
        display: 'grid',
        gridTemplateColumns: `40px repeat(${entities[0]?.years.length ?? 1}, 120px)`,
        gap: '12px 8px',
        alignItems: 'start',
      }}>
        {entities.map(({ entity, years }) => {
          const color = ENTITY_COLORS[entity] ?? { bg: 'var(--hh-haze)', text: '#fff' }

          // Find which year (if any) is currently expanded for this entity
          const expandedYear = years.find(y => expanded.has(`${entity}|${y.year}`))

          return (
            <Fragment key={entity}>
              {/* Entity pill */}
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '3px 10px',
                borderRadius: 99,
                background: color.bg,
                color: color.text,
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
                fontSize: '0.6875rem',
                letterSpacing: '0.05em',
                marginTop: 3,
              }}>
                {entity}
              </span>

              {/* Year pills — one per grid column */}
              {years.map(({ year, total }) => {
                const key = `${entity}|${year}`
                const isOpen = expanded.has(key)
                const isEmpty = total === 0
                return (
                  <button
                    key={year}
                    onClick={() => toggleYear(entity, year)}
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontWeight: 400,
                      fontSize: '0.75rem',
                      background: isOpen ? 'var(--hh-dark)' : 'var(--hh-ice)',
                      color: isOpen ? 'var(--hh-ice)' : isEmpty ? 'var(--hh-haze)' : 'var(--hh-dark)',
                      border: `1px solid ${isOpen ? 'var(--hh-dark)' : isEmpty ? 'rgba(122,145,165,0.3)' : 'var(--hh-haze)'}`,
                      borderRadius: 6,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                      width: '100%',
                      textAlign: 'center',
                    }}
                  >
                    {year} · {isEmpty ? '—' : formatCOPShort(total)}
                  </button>
                )
              })}

              {/* Expanded month grid — spans all columns */}
              {expandedYear && (
                <div style={{
                  gridColumn: '1 / -1',
                  marginTop: 2,
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
            </Fragment>
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
