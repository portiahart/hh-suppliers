import { useState, useEffect, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, Pencil1Icon, DownloadIcon } from '@radix-ui/react-icons'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Supplier } from '../types/supplier'
import { computeRetenciones } from '../lib/retencionesEngine'
import type { RetencionRecomendada, RUTData } from '../lib/rutTypes'
import { CIIU_LABELS, RESPONSABILIDADES_LABELS } from '../lib/rutLookups'

const TABS = ['General', 'Bancario', 'Evaluación', 'B Corp', 'Gasto'] as const
type Tab = typeof TABS[number]

export function SupplierProfile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('General')

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
      {activeTab === 'General' ? (
        <GeneralTab supplier={supplier} loading={loading} onUpdate={setSupplier} supplierId={id ?? null} />
      ) : activeTab === 'Bancario' ? (
        <BancarioTab supplierId={id ?? null} nit={supplier?.nit ?? null} />
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

/* ─── Shared extracted-fields type ───────────────────────── */

interface ExtractedFields {
  tipo_persona:        'JURIDICA' | 'NATURAL' | null
  codigo_tributario:   string | null
  ciiu:                string | null
  direccion:           string | null
  ciudad:              string | null
  pais:                string | null
  email:               string | null
  telefono:            string | null
  rep_legal_nombre:    string | null
  rep_legal_documento: string | null
}

/* ─── Acceso Card ─────────────────────────────────────────── */

function AccesoCard({ supplier }: { supplier: Supplier | null }) {
  const [toast, setToast] = useState<string | null>(null)
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500) }
  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28,
          background: 'var(--hh-dark)', color: 'var(--hh-ice)',
          fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
          padding: '12px 20px', borderRadius: 6, zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>{toast}</div>
      )}
      <SectionCard title="Acceso del proveedor">
        <div style={{ maxWidth: 360 }}>
          <p style={labelStyle}>Email del proveedor</p>
          <p style={{ ...valueStyle, marginBottom: 20 }}>
            {supplier?.email ?? <Muted>Sin email registrado</Muted>}
          </p>
          <button
            onClick={() => showToast('Funcionalidad próximamente')}
            style={{ ...primaryBtnStyle, width: '100%', justifyContent: 'center', padding: '11px 20px', fontSize: '0.875rem' }}
          >
            Enviar enlace de acceso
          </button>
          <p style={{ marginTop: 10, fontSize: '0.75rem', color: 'var(--hh-haze)', fontWeight: 300, lineHeight: 1.5 }}>
            El proveedor recibirá un enlace mágico para acceder a su perfil.
          </p>
        </div>
      </SectionCard>
    </>
  )
}

/* ─── Smart prefill helpers ──────────────────────────────── */

// Normalise a string: lowercase, collapse punctuation/spaces
function normStr(s: string | null | undefined): string {
  if (!s) return ''
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Title-case an ALL-CAPS string from a RUT document
function titleCase(s: string | null | undefined): string | null {
  if (!s) return null
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

// Generic: keep existing if non-empty and normalised values match; otherwise use extracted
function smartFill(existing: string | null | undefined, extracted: string | null | undefined, raw = false): string | null {
  if (!extracted) return existing ?? null
  if (!existing)  return raw ? extracted : titleCase(extracted)
  return normStr(existing) === normStr(extracted) ? existing : (raw ? extracted : titleCase(extracted))
}

// Phone: strip to digits, compare last 10 (ignore +57 prefix differences)
function smartFillPhone(existing: string | null | undefined, extracted: string | null | undefined): string | null {
  if (!extracted) return existing ?? null
  if (!existing)  return extracted
  const digits = (s: string) => s.replace(/\D/g, '').slice(-10)
  return digits(existing) === digits(extracted) ? existing : extracted
}

// Address: token-overlap ≥ 70% → treat as same (RUT addresses are notoriously inconsistent)
function smartFillAddress(existing: string | null | undefined, extracted: string | null | undefined): string | null {
  if (!extracted) return existing ?? null
  if (!existing)  return titleCase(extracted)
  const tokens = (s: string) => new Set(normStr(s).split(' ').filter(t => t.length > 1))
  const a = tokens(existing), b = tokens(extracted)
  const overlap = [...a].filter(t => b.has(t)).length
  const similarity = overlap / Math.max(a.size, b.size, 1)
  return similarity >= 0.7 ? existing : titleCase(extracted)
}

/* ─── IdentidadLegal Card (merged) ───────────────────────── */

interface IdentidadLegalDraft {
  razon_social: string
  nombre_operativo: string
  nit: string
  documento_tipo: string
  tipo_persona: string
  email: string
  telefono: string
  status: Supplier['status']
  codigo_tributario: string | null
  ciiu: string | null
  direccion: string | null
  ciudad: string | null
  pais: string | null
  proximity_zone: string | null
  rep_legal_nombre: string | null
  rep_legal_documento: string | null
}

function IdentidadLegalCard({ supplier, loading, supplierId, onUpdate, prefill, onPrefillConsumed }: {
  supplier: Supplier | null
  loading: boolean
  supplierId: string | null
  onUpdate: (s: Supplier) => void
  prefill?: ExtractedFields | null
  onPrefillConsumed?: () => void
}) {
  const [legalData, setLegalData] = useState<LegalData | null>(null)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [draft, setDraft] = useState<IdentidadLegalDraft>({
    razon_social: '', nombre_operativo: '', nit: '', documento_tipo: '',
    tipo_persona: '', email: '', telefono: '', status: 'ACTIVE',
    codigo_tributario: null, ciiu: null, direccion: null, ciudad: null,
    pais: 'Colombia', proximity_zone: null,
    rep_legal_nombre: null, rep_legal_documento: null,
  })

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500) }

  useEffect(() => {
    if (!supplierId) return
    void (async () => {
      const { data } = await supabase
        .from('suppliers_legal')
        .select('*')
        .eq('supplier_id', supplierId)
        .maybeSingle()
      setLegalData((data as LegalData) ?? null)
    })()
  }, [supplierId])

  useEffect(() => {
    if (!prefill || !supplier) return
    // Always seed from supplier + legalData so fields not touched by prefill are never blank
    const base: IdentidadLegalDraft = {
      razon_social:        supplier.razon_social      ?? '',
      nombre_operativo:    supplier.nombre_operativo  ?? '',
      nit:                 supplier.nit               ?? '',
      documento_tipo:      supplier.documento_tipo     ?? '',
      tipo_persona:        supplier.tipo_persona       ?? '',
      email:               supplier.email              ?? '',
      telefono:            supplier.telefono           ?? '',
      status:              supplier.status,
      codigo_tributario:   legalData?.codigo_tributario ?? null,
      ciiu:                legalData?.ciiu              ?? null,
      direccion:           legalData?.direccion         ?? null,
      ciudad:              legalData?.ciudad            ?? null,
      pais:                legalData?.pais              ?? 'Colombia',
      proximity_zone:      legalData?.proximity_zone    ?? null,
      rep_legal_nombre:    legalData?.rep_legal_nombre    ?? null,
      rep_legal_documento: legalData?.rep_legal_documento ?? null,
    }
    const ciudad = smartFill(base.ciudad, prefill.ciudad)
    setDraft({
      ...base,
      tipo_persona:        smartFill(base.tipo_persona, prefill.tipo_persona)               ?? base.tipo_persona,
      email:               smartFill(base.email, prefill.email?.toLowerCase() ?? null, true) ?? base.email,
      telefono:            smartFillPhone(base.telefono, prefill.telefono)                  ?? base.telefono,
      codigo_tributario:   smartFill(base.codigo_tributario, prefill.codigo_tributario),
      ciiu:                smartFill(base.ciiu, prefill.ciiu),
      direccion:           smartFillAddress(base.direccion, prefill.direccion),
      ciudad,
      pais:                smartFill(base.pais, prefill.pais)                               ?? 'Colombia',
      proximity_zone:      ciudad ? computeZone(ciudad) : base.proximity_zone,
      rep_legal_nombre:    smartFill(base.rep_legal_nombre, prefill.rep_legal_nombre),
      rep_legal_documento: smartFill(base.rep_legal_documento, prefill.rep_legal_documento),
    })
    setEditing(true)
    onPrefillConsumed?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill])

  const startEdit = () => {
    if (!supplier) return
    const ciudad = legalData?.ciudad ?? null
    setDraft({
      razon_social:        supplier.razon_social      ?? '',
      nombre_operativo:    supplier.nombre_operativo  ?? '',
      nit:                 supplier.nit               ?? '',
      documento_tipo:      supplier.documento_tipo     ?? '',
      tipo_persona:        supplier.tipo_persona       ?? '',
      email:               supplier.email              ?? '',
      telefono:            supplier.telefono           ?? '',
      status:              supplier.status,
      codigo_tributario:   legalData?.codigo_tributario ?? null,
      ciiu:                legalData?.ciiu              ?? null,
      direccion:           legalData?.direccion         ?? null,
      ciudad,
      pais:                legalData?.pais              ?? 'Colombia',
      proximity_zone:      legalData?.proximity_zone    ?? null,
      rep_legal_nombre:    legalData?.rep_legal_nombre    ?? null,
      rep_legal_documento: legalData?.rep_legal_documento ?? null,
    })
    setEditing(true)
  }

  const cancelEdit = () => setEditing(false)

  const setField = <K extends keyof IdentidadLegalDraft>(key: K, value: IdentidadLegalDraft[K]) => {
    setDraft(d => {
      const next = { ...d, [key]: value }
      if (key === 'ciudad') next.proximity_zone = computeZone(String(value ?? '')) || null
      return next
    })
  }

  const saveEdit = async () => {
    if (!supplierId || !supplier) return
    setSaving(true)
    const { codigo_tributario, ciiu, direccion, ciudad, pais, proximity_zone,
            rep_legal_nombre, rep_legal_documento,
            razon_social, nombre_operativo, nit, documento_tipo, tipo_persona, email, telefono, status } = draft

    // Save supplier fields
    const { data: updatedSupplier, error: suppErr } = await supabase
      .from('accounts_suppliers')
      .update({ razon_social, nombre_operativo, nit, documento_tipo, tipo_persona, email, telefono, status, updated_at: new Date().toISOString() })
      .eq('id', supplierId)
      .select()
      .single()
    if (suppErr) { setSaving(false); showToast('Error al guardar.'); return }

    // Save legal fields
    const legalPayload = { supplier_id: supplierId, codigo_tributario, ciiu, direccion, ciudad, pais, proximity_zone, rep_legal_nombre, rep_legal_documento, updated_at: new Date().toISOString() }
    if (legalData?.id) {
      const { data: ld, error: lErr } = await supabase.from('suppliers_legal').update(legalPayload).eq('id', legalData.id).select().single()
      if (lErr) { setSaving(false); showToast('Error al guardar datos legales.'); return }
      setLegalData(ld as LegalData)
    } else {
      const { data: ld, error: lErr } = await supabase.from('suppliers_legal').insert(legalPayload).select().single()
      if (lErr) { setSaving(false); showToast('Error al guardar datos legales.'); return }
      setLegalData(ld as LegalData)
    }

    onUpdate(updatedSupplier as Supplier)
    setSaving(false)
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
        }}>{toast}</div>
      )}
      <SectionCard
        title="Identidad y Legal"
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px 32px' }}>
            <Field label="Razón Social"
              value={editing ? draft.razon_social : (supplier?.razon_social ?? null)}
              editing={editing} onChange={v => setField('razon_social', v)} />
            <Field label="Nombre Operativo"
              value={editing ? draft.nombre_operativo : (supplier?.nombre_operativo ?? null)}
              editing={editing} onChange={v => setField('nombre_operativo', v)} />
            <Field label="NIT"
              value={editing ? draft.nit : (supplier?.nit ?? null)}
              editing={editing} onChange={v => setField('nit', v)} />
            <div>
              <p style={labelStyle}>Tipo de Persona</p>
              {editing ? (
                <select value={draft.tipo_persona} onChange={e => setField('tipo_persona', e.target.value)} style={inputStyle}>
                  <option value="">—</option>
                  <option value="JURIDICA">JURIDICA</option>
                  <option value="NATURAL">NATURAL</option>
                </select>
              ) : (
                <p style={valueStyle}>{supplier?.tipo_persona || <Muted>—</Muted>}</p>
              )}
            </div>
            <Field label="Email"
              value={editing ? draft.email : (supplier?.email ?? null)}
              editing={editing} onChange={v => setField('email', v)} />
            <Field label="Teléfono"
              value={editing ? draft.telefono : (supplier?.telefono ?? null)}
              editing={editing} onChange={v => setField('telefono', v)} />
            <div>
              <p style={labelStyle}>Estado</p>
              {editing ? (
                <select value={draft.status ?? ''} onChange={e => setField('status', e.target.value as Supplier['status'])} style={inputStyle}>
                  <option value="">—</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              ) : (
                <p style={valueStyle}>{supplier?.status ? <StatusBadge status={supplier.status} /> : <Muted>—</Muted>}</p>
              )}
            </div>
            <Field label="Código Tributario"
              value={editing ? (draft.codigo_tributario ?? '') : (legalData?.codigo_tributario ?? null)}
              editing={editing} onChange={v => setField('codigo_tributario', v || null)} />
            <Field label="CIIU"
              value={editing ? (draft.ciiu ?? '') : (legalData?.ciiu ?? null)}
              editing={editing} onChange={v => setField('ciiu', v || null)} />
            <Field label="Dirección"
              value={editing ? (draft.direccion ?? '') : (legalData?.direccion ?? null)}
              editing={editing} onChange={v => setField('direccion', v || null)} />
            <div>
              <p style={labelStyle}>Ciudad</p>
              {editing ? (
                <>
                  <input type="text" list="ciudad-datalist"
                    value={draft.ciudad ?? ''} onChange={e => setField('ciudad', e.target.value || null)}
                    placeholder="Ciudad…" style={inputStyle} />
                  <datalist id="ciudad-datalist">
                    {COLOMBIAN_CITIES.map(c => <option key={c} value={c} />)}
                  </datalist>
                </>
              ) : (
                <p style={valueStyle}>{legalData?.ciudad || <Muted>—</Muted>}</p>
              )}
            </div>
            <Field label="País"
              value={editing ? (draft.pais ?? 'Colombia') : (legalData?.pais ?? 'Colombia')}
              editing={editing} onChange={v => setField('pais', v || null)} />
            <Field label="Representante Legal"
              value={editing ? (draft.rep_legal_nombre ?? '') : (legalData?.rep_legal_nombre ?? null)}
              editing={editing} onChange={v => setField('rep_legal_nombre', v || null)} />
            <Field label="Doc. Representante Legal"
              value={editing ? (draft.rep_legal_documento ?? '') : (legalData?.rep_legal_documento ?? null)}
              editing={editing} onChange={v => setField('rep_legal_documento', v || null)} />
            <div>
              <p style={labelStyle}>Zona de Proximidad</p>
              {zone && zoneColor ? (
                <span style={{ display: 'inline-block', padding: '3px 12px', borderRadius: 99,
                  background: zoneColor.bg, color: zoneColor.text,
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.75rem', letterSpacing: '0.04em' }}>
                  {zone}
                </span>
              ) : (
                <p style={valueStyle}><Muted>—</Muted></p>
              )}
            </div>
          </div>
        )}
      </SectionCard>
    </>
  )
}

/* ─── General Tab (Resumen + Legal + Documentos) ─────────── */

function GeneralTab({ supplier, loading, onUpdate, supplierId }: ResumenTabProps & { supplierId: string | null }) {
  const [prefill, setPrefill] = useState<ExtractedFields | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [retencionesKey, setRetencionesKey] = useState(0)
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500) }
  const clearPrefill = () => setPrefill(null)
  const refreshRetenciones = () => setRetencionesKey(k => k + 1)
  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, right: 28,
          background: 'var(--hh-dark)', color: 'var(--hh-ice)',
          fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
          padding: '12px 20px', borderRadius: 6, zIndex: 100,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        }}>{toast}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <IdentidadLegalCard
          supplier={supplier}
          loading={loading}
          supplierId={supplierId}
          onUpdate={onUpdate}
          prefill={prefill}
          onPrefillConsumed={clearPrefill}
        />
        <RetencionesCard key={retencionesKey} supplierId={supplierId} showToast={showToast} />
        <DocumentosTab supplierId={supplierId} onExtract={setPrefill} onRetentionUpdated={refreshRetenciones} />
        <AccesoCard supplier={supplier} />
      </div>
    </>
  )
}

/* ─── ResumenTabProps (used by GeneralTab signature) ─────── */

interface ResumenTabProps {
  supplier: Supplier | null
  loading: boolean
  onUpdate: (s: Supplier) => void
}

/* ─── (ResumenTab and LegalTab removed — merged into IdentidadLegalCard) ── */

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
  rep_legal_nombre: string | null
  rep_legal_documento: string | null
}


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

function buildRUTContext(rut: RUTData): string {
  const allCIIUs = [
    rut.actividad_principal?.codigo,
    rut.actividad_secundaria?.codigo,
    ...(rut.otras_actividades ?? []),
  ].filter(Boolean) as string[]

  const ciiuParts = allCIIUs.map(c => CIIU_LABELS[c] ? `${c} · ${CIIU_LABELS[c]}` : c)
  const respParts = (rut.responsabilidades ?? []).map(r => RESPONSABILIDADES_LABELS[r] ? `[${r}] ${RESPONSABILIDADES_LABELS[r]}` : `[${r}]`)

  const parts: string[] = []
  if (ciiuParts.length) parts.push(`Actividades: ${ciiuParts.join(', ')}`)
  if (respParts.length) parts.push(`Responsabilidades: ${respParts.join(', ')}`)
  return parts.join('. ')
}

function enrichRecommendations(recommendations: RetencionRecomendada[], rut: RUTData): RetencionRecomendada[] {
  const context = buildRUTContext(rut)
  if (!context) return recommendations
  return recommendations.map(rec => ({
    ...rec,
    notas: [rec.notas, context].filter(Boolean).join(' | '),
  }))
}

async function upsertRetenciones(supplierId: string, recommendations: RetencionRecomendada[]): Promise<void> {
  const { data: existing, error: fetchErr } = await supabase
    .from('suppliers_retenciones')
    .select('id, tipo, tarifa_aplicada')
    .eq('supplier_id', supplierId)
  if (fetchErr) throw new Error(`Error al leer retenciones: ${fetchErr.message}`)

  const existingMap = new Map<string, { id: string; tarifa_aplicada: number | null }>()
  for (const row of (existing ?? [])) {
    existingMap.set(row.tipo, { id: row.id, tarifa_aplicada: row.tarifa_aplicada })
  }
  for (const rec of recommendations) {
    const tipo = rec.retencion_tipo
    const payload = {
      concepto: rec.concepto,
      tarifa_recomendada: rec.tarifa_recomendada,
      base_minima: rec.base_minima,
      aplica: rec.aplica,
      notas: rec.notas,
      updated_at: new Date().toISOString(),
    }
    const existingRow = existingMap.get(tipo)
    if (existingRow) {
      const { error } = await supabase.from('suppliers_retenciones').update(payload).eq('id', existingRow.id)
      if (error) throw new Error(`Error al actualizar ${tipo}: ${error.message}`)
    } else {
      const { error } = await supabase.from('suppliers_retenciones').insert({ supplier_id: supplierId, tipo, tarifa_aplicada: null, ...payload })
      if (error) throw new Error(`Error al insertar ${tipo}: ${error.message}`)
    }
  }
}

const ZONE_COLORS: Record<string, { bg: string; text: string }> = {
  Cartagena: { bg: 'var(--hh-teal)',  text: '#fff' },
  Bolivar:   { bg: 'var(--hh-lemon)', text: 'var(--hh-dark)' },
  Colombia:  { bg: 'var(--hh-haze)',  text: '#fff' },
  ROW:       { bg: 'var(--hh-dark)',  text: 'var(--hh-ice)' },
}

/* ─── Retenciones Card ───────────────────────────────────── */

function RetencionesCard({ supplierId, showToast }: { supplierId: string | null; showToast: (m: string) => void }) {
  const [rows, setRows] = useState<Retencion[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftRows, setDraftRows] = useState<Retencion[]>([])
  const [counter, setCounter] = useState(0)
  const [recalculating, setRecalculating] = useState(false)

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

  const handleRecalculate = async () => {
    if (!supplierId) return
    setRecalculating(true)
    try {
      const { data: docs } = await supabase
        .from('suppliers_documents')
        .select('storage_path')
        .eq('supplier_id', supplierId)
        .eq('document_type', 'RUT')
        .order('id', { ascending: false })
        .limit(1)
      if (!docs?.length) throw new Error('No se encontró un RUT subido para este proveedor.')
      const { data: urlData, error: urlErr } = await supabase.storage
        .from('supplier-documents')
        .createSignedUrl(docs[0].storage_path, 120)
      if (urlErr || !urlData?.signedUrl) throw new Error('No se pudo generar enlace para el RUT.')
      const { data: res, error: fnErr } = await supabase.functions.invoke('extract-rut', {
        body: { url: urlData.signedUrl },
      })
      if (fnErr || !res?.success) throw new Error(fnErr?.message ?? res?.error ?? 'Error al analizar RUT.')
      const recommendations = enrichRecommendations(computeRetenciones(res.rut), res.rut as RUTData)
      await upsertRetenciones(supplierId, recommendations)
      const { data } = await supabase
        .from('suppliers_retenciones').select('*')
        .eq('supplier_id', supplierId).order('created_at')
      setRows((data as Retencion[]) ?? [])
      showToast('Retenciones recalculadas.')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al recalcular retenciones.')
    }
    setRecalculating(false)
  }

  const displayRows = editing ? draftRows : rows

  return (
    <SectionCard
      title="Retenciones"
      action={
        !editing ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleRecalculate} disabled={recalculating} style={ghostBtnStyle}>
              {recalculating ? 'Calculando…' : 'Recalcular desde RUT'}
            </button>
            <button onClick={startEdit} style={ghostBtnStyle}>
              <Pencil1Icon width={14} height={14} />
              Editar
            </button>
          </div>
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
                      : r.tarifa_recomendada === null && r.aplica ? (
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, background: 'rgba(255,193,7,0.15)', color: '#856404', fontSize: '0.75rem', fontWeight: 500 }}>
                          Revisar
                        </span>
                      ) : (
                        <span title={r.notas ?? undefined} style={{ ...retValStyle, color: 'var(--hh-haze)', fontFamily: 'var(--font-numeric)', fontVariantNumeric: 'tabular-nums', cursor: r.notas ? 'help' : 'default' }}>
                          {r.tarifa_recomendada != null ? `${r.tarifa_recomendada}${r.tipo === 'ReteICA' ? '‰' : '%'}` : <Muted>—</Muted>}
                        </span>
                      )
                    }
                  </td>
                  <td style={retTdStyle}>
                    {editing
                      ? <input type="number" value={r.base_minima ?? ''} onChange={e => updateRow(r.id, 'base_minima', e.target.value ? Number(e.target.value) : null)} style={{ ...inputStyle, width: 110 }} />
                      : <span style={{ ...retValStyle, fontFamily: 'var(--font-numeric)', fontVariantNumeric: 'tabular-nums' }}>{r.base_minima != null ? `$${Math.round(r.base_minima).toLocaleString('es-CO')}` : <Muted>—</Muted>}</span>}
                  </td>
                  <td style={retTdStyle}>
                    {editing
                      ? <input type="number" value={r.tarifa_aplicada ?? ''} onChange={e => updateRow(r.id, 'tarifa_aplicada', e.target.value ? Number(e.target.value) : null)} style={{ ...inputStyle, width: 72 }} />
                      : (() => {
                          const differs = r.tarifa_aplicada != null && r.tarifa_aplicada !== r.tarifa_recomendada
                          return (
                            <span style={{ ...retValStyle, color: differs ? 'var(--hh-teal)' : undefined, fontFamily: 'var(--font-numeric)', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              {r.tarifa_aplicada != null ? `${r.tarifa_aplicada}${r.tipo === 'ReteICA' ? '‰' : '%'}` : <Muted>—</Muted>}
                              {differs && <Pencil1Icon width={11} height={11} style={{ opacity: 0.7 }} />}
                            </span>
                          )
                        })()
                    }
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

function BancarioTab({ supplierId, nit }: { supplierId: string | null; nit: string | null }) {
  useAuth()
  const [data, setData] = useState<BankingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
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

  const syncFromSheet = async () => {
    if (!nit) { showToast('Sin NIT para buscar en hoja.'); return }
    setSyncing(true)
    try {
      const { data: res, error } = await supabase.functions.invoke('get-reporte-data', {
        body: { ranges: ['NIT', 'MAIN'] },
      })
      if (error || !res?.success) throw new Error(error?.message ?? res?.error ?? 'Error al leer hoja')
      const nitRows: unknown[][] = res.ranges?.NIT ?? []
      const mainRows: unknown[][] = res.ranges?.MAIN ?? []
      // Both ranges are row-aligned; row 0 is header
      const normalizeNit = (v: unknown) => String(v ?? '').replace(/\D/g, '')
      const targetNit = normalizeNit(nit)
      const rowIdx = nitRows.findIndex((row, i) => i > 0 && normalizeNit((row as unknown[])[0]) === targetNit)
      if (rowIdx === -1) { showToast('NIT no encontrado en la hoja.'); setSyncing(false); return }
      const match = mainRows[rowIdx] as unknown[] | undefined
      if (!match) { showToast('Fila de datos bancarios no encontrada.'); setSyncing(false); return }
      const cell = (i: number) => { const v = match[i]; return typeof v === 'string' && v.trim() ? v.trim() : null }
      const normTipoCuenta = (v: string | null): string | null => {
        if (!v) return null
        const u = v.toUpperCase()
        if (u.includes('AHORRO')) return 'Ahorros'
        if (u.includes('CORRIENTE')) return 'Corriente'
        return null
      }
      const sheetDraft: BankingDraft = {
        nombre_beneficiario:        cell(14), // col O
        numero_cuenta:              cell(15), // col P
        tipo_cuenta:                normTipoCuenta(cell(16)), // col Q
        banco:                      cell(17), // col R
        tipo_documento_bancolombia: cell(18), // col S
        verificacion_notas:         data?.verificacion_notas ?? null,
      }
      setDraft(sheetDraft)
      setEditing(true)
      showToast('Datos importados desde la hoja. Revisa y guarda.')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al sincronizar.')
    }
    setSyncing(false)
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
        <SectionCard
          title="Datos Bancarios"
          action={
            !editing ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={syncFromSheet} disabled={syncing} style={ghostBtnStyle}>
                  {syncing ? 'Importando…' : 'Importar desde hoja'}
                </button>
                <button onClick={startEdit} style={ghostBtnStyle}>
                  <Pencil1Icon width={14} height={14} />
                  {data ? 'Editar' : 'Agregar'}
                </button>
              </div>
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

              <Field
                label="Número de Cuenta"
                value={editing ? (draft.numero_cuenta ?? '') : (data?.numero_cuenta ?? null)}
                editing={editing}
                onChange={v => setDraft(d => ({ ...d, numero_cuenta: v || null }))}
              />

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
  'Contrato o Acuerdo',
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
}

function DocumentosTab({ supplierId, onExtract, onRetentionUpdated }: { supplierId: string | null; onExtract?: (f: ExtractedFields) => void; onRetentionUpdated?: () => void }) {
  const { session } = useAuth()
  const [docs, setDocs] = useState<DocRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [uploadType, setUploadType] = useState<string>(DOC_TYPES[0])
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [extractingId, setExtractingId] = useState<string | null>(null)
  const [rutBannerPath, setRutBannerPath] = useState<string | null>(null)
  const [analyzingRUT, setAnalyzingRUT] = useState(false)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3500)
  }

  const fetchDocs = async () => {
    if (!supplierId) return
    const { data, error } = await supabase
      .from('suppliers_documents')
      .select('*')
      .eq('supplier_id', supplierId)
      .order('id', { ascending: false })
    if (error) showToast(`Error al cargar documentos: ${error.message}`)
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
    const slugify = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
    const ts = Date.now()
    const storagePath = `${supplierId}/${slugify(uploadType)}/${ts}_${slugify(uploadFile.name)}`
    const { error: uploadError } = await supabase.storage
      .from('supplier-documents')
      .upload(storagePath, uploadFile)
    if (uploadError) {
      setUploading(false)
      showToast(`Error al subir: ${uploadError.message}`)
      return
    }
    const { error: dbError } = await supabase.from('suppliers_documents').insert({
      supplier_id:     supplierId,
      document_type:   uploadType,
      storage_path:    storagePath,
      file_name:       uploadFile.name,
      file_size_bytes: uploadFile.size,
      mime_type:       uploadFile.type,
      uploaded_by:     session?.user?.id ?? null,
    })
    setUploading(false)
    if (dbError) { showToast(`Error al registrar: ${dbError.message}`); return }
    setUploadFile(null)
    const input = document.getElementById('doc-file-input') as HTMLInputElement | null
    if (input) input.value = ''
    showToast('Documento subido correctamente.')
    if (uploadType === 'RUT') setRutBannerPath(storagePath)
    void fetchDocs()
  }

  const handleExtract = async (doc: DocRow) => {
    if (!onExtract) return
    setExtractingId(doc.id)
    try {
      const { data: urlData, error: urlErr } = await supabase.storage
        .from('supplier-documents')
        .createSignedUrl(doc.storage_path, 120)
      if (urlErr || !urlData?.signedUrl) throw new Error('No se pudo generar enlace para el archivo.')
      const { data: res, error: fnErr } = await supabase.functions.invoke('extract-rut', {
        body: { url: urlData.signedUrl },
      })
      if (fnErr || !res?.success) throw new Error(fnErr?.message ?? res?.error ?? 'Error al extraer datos.')
      onExtract(res.fields as ExtractedFields)
      showToast('Datos extraídos. Revisa y guarda en las secciones de arriba.')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al extraer datos.')
    }
    setExtractingId(null)
  }

  const handleAnalyzeRUT = async () => {
    if (!supplierId || !rutBannerPath) return
    setAnalyzingRUT(true)
    try {
      const { data: urlData, error: urlErr } = await supabase.storage
        .from('supplier-documents')
        .createSignedUrl(rutBannerPath, 120)
      if (urlErr || !urlData?.signedUrl) throw new Error('No se pudo generar enlace para el RUT.')
      const { data: res, error: fnErr } = await supabase.functions.invoke('extract-rut', {
        body: { url: urlData.signedUrl },
      })
      if (fnErr || !res?.success) throw new Error(fnErr?.message ?? res?.error ?? 'Error al analizar RUT.')
      const recommendations = enrichRecommendations(computeRetenciones(res.rut), res.rut as RUTData)
      await upsertRetenciones(supplierId, recommendations)
      setRutBannerPath(null)
      onRetentionUpdated?.()
      showToast('Retenciones calculadas — revisa la sección de Retenciones.')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Error al analizar el RUT.')
    }
    setAnalyzingRUT(false)
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

      {rutBannerPath && (
        <div style={{
          background: 'rgba(74,155,142,0.08)',
          border: '1px solid rgba(74,155,142,0.3)',
          borderRadius: 8,
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-dark)' }}>
            RUT subido — ¿Calcular recomendaciones de retenciones automáticamente?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setRutBannerPath(null)} style={ghostBtnStyle}>
              Omitir
            </button>
            <button
              onClick={handleAnalyzeRUT}
              disabled={analyzingRUT}
              style={{ ...ghostBtnStyle, color: 'var(--hh-teal)', borderColor: 'var(--hh-teal)' }}
            >
              {analyzingRUT ? 'Analizando…' : 'Analizar RUT'}
            </button>
          </div>
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
                        {doc.file_size_bytes ? formatBytes(doc.file_size_bytes) : ''}
                        {' · '}
                        {doc.uploaded_by ?? 'Proveedor'}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {onExtract && (doc.document_type === 'RUT' || doc.document_type === 'Cámara de Comercio') && (
                        <button
                          onClick={() => handleExtract(doc)}
                          disabled={extractingId === doc.id}
                          style={{ ...ghostBtnStyle, color: 'var(--hh-teal)', borderColor: 'var(--hh-teal)' }}
                        >
                          {extractingId === doc.id ? 'Extrayendo…' : 'Extraer datos'}
                        </button>
                      )}
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
                  fontFamily: 'var(--font-numeric)', fontWeight: 300,
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
                    fontFamily: 'var(--font-numeric)', fontWeight: 300, fontSize: '1.5rem',
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
  doc_url: string | null
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
  doc_url: string | null
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
  const { session } = useAuth()
  const [txns, setTxns] = useState<TxRow[]>([])
  const [cpp, setCpp] = useState<CppRow[]>([])
  const [txLoading, setTxLoading] = useState(true)
  const [entities, setEntities] = useState<EntityData[]>([])
  const [histLoading, setHistLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<string | null>(null)
  const [userRole, setUserRole] = useState('general_manager')
  const [rowIndexMap, setRowIndexMap] = useState<Map<string, number>>(new Map())
  const [approvingId, setApprovingId] = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3500) }

  // User role
  useEffect(() => {
    if (!session?.user?.id) return
    void (async () => {
      const { data } = await supabase.from('crm_users').select('is_super_admin').eq('id', session.user.id).single()
      if (data?.is_super_admin) setUserRole('super_admin')
    })()
  }, [session])

  // Financial data by NIT
  useEffect(() => {
    if (!nit) { setTxLoading(false); return }
    void (async () => {
      const [{ data: txData }, { data: cppData }] = await Promise.all([
        supabase.from('transactions_cache').select('*').eq('nit', nit).order('fecha_operacion', { ascending: false }),
        supabase.from('cuentas_por_pagar_cache').select('*').eq('nit', nit).order('fecha_operacion', { ascending: false }),
      ])
      setTxns((txData as TxRow[]) ?? [])
      const cppRows = (cppData as CppRow[]) ?? []
      setCpp(cppRows)
      setTxLoading(false)

      // Build sheet row index map for unapproved CPP rows
      const unapproved = cppRows.filter(r => r.aprobado !== 'SI')
      if (unapproved.length === 0) return
      try {
        const { data: sheetData } = await supabase.functions.invoke('get-reporte-data', {
          body: { ranges: ['xPP'] },
        })
        if (!sheetData?.success) return
        const xppRows: unknown[][] = sheetData.ranges?.['xPP'] ?? []
        const xppStartRow: number = sheetData.xppStartRow || 1
        const map = new Map<string, number>()
        xppRows.forEach((row, i) => {
          const r = row as unknown[]
          const sheetCell = (idx: number) => { const v = r[idx]; return v == null ? '' : String(v).trim() }
          // Parse fecha_vencimiento (col 25) — may be a Sheets serial number or ISO string
          const rawVenc = r[25]
          let fechaVenc = ''
          if (typeof rawVenc === 'number') {
            const d = new Date((rawVenc - 25569) * 86400 * 1000)
            if (!isNaN(d.getTime())) fechaVenc = d.toISOString().slice(0, 10)
          } else if (typeof rawVenc === 'string' && rawVenc.trim()) {
            const d = new Date(rawVenc.trim())
            if (!isNaN(d.getTime())) fechaVenc = d.toISOString().slice(0, 10)
          }
          // Parse importe (col 6)
          const rawAmt = r[6]
          const importe = typeof rawAmt === 'number'
            ? rawAmt
            : parseFloat(String(rawAmt ?? '').replace(/[^0-9.-]/g, '')) || 0
          const key = `${Math.round(importe)}|${fechaVenc}|${sheetCell(24)}`
          map.set(key, xppStartRow + i)
        })
        setRowIndexMap(map)
      } catch {
        // silently fail — approve buttons won't appear
      }
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

  // ─── Approve CPP row ───
  const handleApproveCpp = async (c: CppRow) => {
    if (!session?.user?.id) return
    const key = `${Math.round(c.importe_cop ?? 0)}|${c.fecha_vencimiento ?? ''}|${c.empresa ?? ''}`
    const rowIndex = rowIndexMap.get(key)
    if (!rowIndex) { showToast('No se encontró la fila en la hoja. Recarga e intenta de nuevo.'); return }
    setApprovingId(c.id)
    try {
      const { data, error } = await supabase.functions.invoke('update-xpp', {
        body: { action: 'approve', rowIndex, value: true, userId: session.user.id, userRole },
      })
      if (error || !data?.success) throw new Error(data?.error || 'Error')
      setCpp(prev => prev.map(r => r.id === c.id ? { ...r, aprobado: 'SI' } : r))
      showToast('Factura aprobada.')
    } catch {
      showToast('Error al aprobar — intenta de nuevo.')
    } finally {
      setApprovingId(null)
    }
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
                <p style={{ fontFamily: 'var(--font-numeric)', fontWeight: 300, fontSize: '1.25rem', color: 'var(--hh-dark)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
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
                      <td style={{ ...tblTd, fontFamily: 'var(--font-numeric)', fontVariantNumeric: 'tabular-nums', fontSize: '0.875rem', color: r.total > 0 ? 'var(--hh-dark)' : 'var(--hh-haze)' }}>
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
                    <td style={{ ...tblTd, textAlign: 'right' }}><span style={{ fontFamily: 'var(--font-numeric)', fontVariantNumeric: 'tabular-nums', fontWeight: 500, fontSize: '0.875rem', color: 'var(--hh-mango)', whiteSpace: 'nowrap' }}>{formatCOPFull(t.importe_cop ?? 0)}</span></td>
                    <td style={tblTd}><EmpresaPill empresa={t.empresa} /></td>
                    <td style={tblTd}><span style={tblVal}>{t.source === 'CASHAPP' ? 'Cash App' : 'Banco'}</span></td>
                    <td style={tblTd}>{t.doc_url && t.no_fac ? <a href={t.doc_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 400, color: 'var(--hh-teal)', textDecoration: 'underline' }}>{t.no_fac}</a> : <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', fontWeight: 400, color: t.no_fac ? 'var(--hh-teal)' : 'var(--hh-haze)' }}>{t.no_fac ?? 'N/A'}</span>}</td>
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
                    <td style={{ ...tblTd, textAlign: 'right' }}><span style={{ ...tblVal, fontFamily: 'var(--font-numeric)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatCOPFull(t.importe_cop ?? 0)}</span></td>
                    <td style={tblTd}>{t.doc_url && t.no_fac ? <a href={t.doc_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-teal)', textDecoration: 'underline' }}>{t.no_fac}</a> : <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: t.no_fac ? 'var(--hh-teal)' : 'var(--hh-haze)' }}>{t.no_fac ?? 'N/A'}</span>}</td>
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
                  <td style={{ ...tblTd, textAlign: 'right', fontFamily: 'var(--font-numeric)', fontVariantNumeric: 'tabular-nums', fontWeight: 600, fontSize: '0.875rem', color: 'var(--hh-ice)', whiteSpace: 'nowrap', borderBottom: 'none' }}>{formatCOPFull(totalPagado)}</td>
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
                  {['Fecha Op','Importe','No. Factura','Fecha Factura','Concepto','Centro de Costo','Empresa','Vencimiento','Aprobado',''].map(h => <th key={h} style={tblTh}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {cpp.map((c, i) => {
                  const isOverdue = c.fecha_vencimiento != null && c.fecha_vencimiento < today
                  return (
                    <tr key={c.id} style={{ background: i % 2 === 1 ? 'var(--hh-ice)' : 'var(--hh-white)' }}>
                      <td style={tblTd}><span style={{ ...tblVal, whiteSpace: 'nowrap' }}>{fmtDate(c.fecha_operacion)}</span></td>
                      <td style={{ ...tblTd, textAlign: 'right' }}><span style={{ ...tblVal, fontFamily: 'var(--font-numeric)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatCOPFull(c.importe_cop ?? 0)}</span></td>
                      <td style={tblTd}>{c.doc_url && c.no_fac ? <a href={c.doc_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-teal)', textDecoration: 'underline' }}>{c.no_fac}</a> : <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: c.no_fac ? 'var(--hh-teal)' : 'var(--hh-haze)' }}>{c.no_fac ?? 'N/A'}</span>}</td>
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
                      <td style={{ ...tblTd, whiteSpace: 'nowrap' }}>
                        {c.aprobado !== 'SI' && rowIndexMap.has(`${Math.round(c.importe_cop ?? 0)}|${c.fecha_vencimiento ?? ''}|${c.empresa ?? ''}`) && (
                          <button
                            onClick={() => handleApproveCpp(c)}
                            disabled={approvingId === c.id}
                            style={{ ...primaryBtnStyle, fontSize: '0.75rem', padding: '4px 10px', opacity: approvingId === c.id ? 0.6 : 1 }}
                          >
                            {approvingId === c.id ? 'Aprobando…' : 'Aprobar'}
                          </button>
                        )}
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
                            <p style={{ fontFamily: 'var(--font-numeric)', fontVariantNumeric: 'tabular-nums', fontWeight: amount > 0 ? 400 : 300, fontSize: '0.75rem', color: amount > 0 ? 'var(--hh-dark)' : 'var(--hh-haze)', margin: 0 }}>
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
