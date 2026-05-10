import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { DuplicatesModal } from '../components/DuplicatesModal'
import type { DuplicateGroup, DuplicateSupplier } from '../components/DuplicatesModal'

type Category = 'duplicado' | 'tipo-persona' | 'razon-social' | 'nit' | 'rut'

interface IncompleteSupplier {
  id: string
  razon_social: string | null
  nombre_operativo: string | null
  nit: string | null
  tipo_persona: string | null
  status: string | null
  created_at: string
}

const CATEGORY_LABELS: Record<Category, string> = {
  'duplicado':     'Duplicado',
  'tipo-persona':  'Tipo de Persona',
  'razon-social':  'Razón Social',
  'nit':           'NIT / CC',
  'rut':           'RUT presente o no',
}

const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  'duplicado':    'Proveedores con razón social idéntica a otro registro.',
  'tipo-persona': 'Proveedores sin tipo de persona (Jurídica / Natural) registrado.',
  'razon-social': 'Proveedores sin razón social registrada.',
  'nit':          'Proveedores sin NIT o cédula registrada.',
  'rut':          'Proveedores que no tienen un RUT subido en documentos.',
}

export function IncompletosPage() {
  const { category } = useParams<{ category: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<IncompleteSupplier[]>([])
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([])
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [search, setSearch] = useState('')

  const cat = category as Category
  const label = CATEGORY_LABELS[cat] ?? cat
  const description = CATEGORY_DESCRIPTIONS[cat] ?? ''

  useEffect(() => {
    if (!cat) return
    setLoading(true)
    setSuppliers([])
    setDuplicateGroups([])
    setSearch('')
    void load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat])

  async function load() {
    if (cat === 'duplicado') {
      await loadDuplicates()
    } else if (cat === 'tipo-persona') {
      await loadSimple('tipo_persona', true)
    } else if (cat === 'razon-social') {
      await loadSimple('razon_social', true)
    } else if (cat === 'nit') {
      await loadSimple('nit', true)
    } else if (cat === 'rut') {
      await loadMissingRut()
    }
    setLoading(false)
  }

  async function loadSimple(column: string, mustBeNull: boolean) {
    const all: IncompleteSupplier[] = []
    let from = 0
    while (true) {
      const q = supabase
        .from('accounts_suppliers')
        .select('id, razon_social, nombre_operativo, nit, tipo_persona, status, created_at')
        .is('archived_at', null)
        .order('razon_social', { ascending: true })
        .range(from, from + 999)
      const { data: page } = mustBeNull ? await q.is(column, null) : await q.not(column, 'is', null)
      if (!page || page.length === 0) break
      all.push(...(page as IncompleteSupplier[]))
      if (page.length < 1000) break
      from += 1000
    }
    setSuppliers(all)
  }

  async function loadDuplicates() {
    const all: DuplicateSupplier[] = []
    let from = 0
    while (true) {
      const { data: page } = await supabase
        .from('accounts_suppliers')
        .select('id, razon_social, nombre_operativo, nit, status, created_at')
        .is('archived_at', null)
        .range(from, from + 999)
      if (!page || page.length === 0) break
      all.push(...(page as DuplicateSupplier[]))
      if (page.length < 1000) break
      from += 1000
    }
    const seen = new Map<string, DuplicateSupplier[]>()
    for (const s of all) {
      const key = (s.razon_social ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
      if (!key) continue
      if (!seen.has(key)) seen.set(key, [])
      seen.get(key)!.push(s)
    }
    const groups: DuplicateGroup[] = []
    for (const [key, list] of seen) {
      if (list.length > 1) groups.push({ key, suppliers: list })
    }
    groups.sort((a, b) => a.key.localeCompare(b.key, 'es'))
    setDuplicateGroups(groups)
  }

  async function loadMissingRut() {
    // Fetch all non-archived suppliers
    const all: IncompleteSupplier[] = []
    let from = 0
    while (true) {
      const { data: page } = await supabase
        .from('accounts_suppliers')
        .select('id, razon_social, nombre_operativo, nit, tipo_persona, status, created_at')
        .is('archived_at', null)
        .range(from, from + 999)
      if (!page || page.length === 0) break
      all.push(...(page as IncompleteSupplier[]))
      if (page.length < 1000) break
      from += 1000
    }

    // Fetch all supplier_ids that have at least one RUT document
    const { data: docs } = await supabase
      .from('suppliers_documents')
      .select('supplier_id')
      .eq('document_type', 'RUT')
    const withRut = new Set((docs ?? []).map((d: { supplier_id: string }) => d.supplier_id))

    const missing = all
      .filter(s => !withRut.has(s.id))
      .sort((a, b) => (a.razon_social ?? '').localeCompare(b.razon_social ?? '', 'es'))
    setSuppliers(missing)
  }

  const filteredSuppliers = search.trim()
    ? suppliers.filter(s =>
        (s.razon_social ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (s.nombre_operativo ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (s.nit ?? '').includes(search)
      )
    : suppliers

  const filteredGroups = search.trim()
    ? duplicateGroups.filter(g =>
        g.key.includes(search.toLowerCase()) ||
        g.suppliers.some(s =>
          (s.razon_social ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (s.nit ?? '').includes(search)
        )
      )
    : duplicateGroups

  const count = cat === 'duplicado'
    ? duplicateGroups.reduce((n, g) => n + g.suppliers.length, 0)
    : suppliers.length

  const displayName = (s: IncompleteSupplier | DuplicateSupplier) => {
    const rs = s.razon_social ?? '—'
    const op = (s as IncompleteSupplier).nombre_operativo
    return op && op !== rs ? `${rs} (${op})` : rs
  }

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none',
          color: 'var(--hh-haze)', fontFamily: 'var(--font-body)',
          fontSize: '0.8125rem', cursor: 'pointer', padding: 0, marginBottom: 24,
        }}
      >
        ← Atrás
      </button>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 500,
          textTransform: 'uppercase', letterSpacing: '0.12em',
          color: 'var(--hh-haze)', margin: '0 0 6px',
        }}>
          Incompletos
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: '1.75rem',
          color: 'var(--hh-dark)', margin: '0 0 6px', lineHeight: 1.2,
        }}>
          {label}
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '0.875rem',
          color: 'var(--hh-haze)', margin: 0,
        }}>
          {description}
        </p>
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Filtrar por nombre o NIT…"
          style={{
            flex: 1, padding: '9px 12px',
            fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-dark)',
            background: 'var(--hh-ice)', border: '1px solid rgba(122,145,165,0.25)',
            borderRadius: 6, outline: 'none',
          }}
        />
        {!loading && (
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
            color: 'var(--hh-haze)', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {count} {count === 1 ? 'proveedor' : 'proveedores'}
          </span>
        )}
        {cat === 'duplicado' && duplicateGroups.length > 0 && (
          <button
            onClick={() => setShowMergeModal(true)}
            style={{
              fontFamily: 'var(--font-body)', fontSize: '0.8125rem', fontWeight: 500,
              color: 'var(--hh-teal)', background: 'transparent',
              border: '1px solid var(--hh-teal)', borderRadius: 6,
              padding: '7px 16px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Fusionar →
          </button>
        )}
      </div>

      {/* Content */}
      <div style={{
        background: 'var(--hh-white)', borderRadius: 10,
        border: '1px solid rgba(122,145,165,0.15)',
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-haze)' }}>
            Cargando…
          </div>
        ) : cat === 'duplicado' ? (
          filteredGroups.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              {filteredGroups.map((group, gi) => (
                <div key={group.key} style={{ borderBottom: gi < filteredGroups.length - 1 ? '1px solid rgba(122,145,165,0.12)' : undefined }}>
                  <div style={{
                    padding: '10px 20px 6px',
                    fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 500,
                    textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--hh-haze)',
                    background: 'rgba(122,145,165,0.04)',
                  }}>
                    {group.key} · {group.suppliers.length} entradas
                  </div>
                  {group.suppliers.map((s, si) => (
                    <SupplierRow
                      key={s.id}
                      id={s.id}
                      primary={s.razon_social ?? '—'}
                      secondary={`NIT: ${s.nit ?? '—'} · ${s.status ?? '—'}`}
                      isLast={si === group.suppliers.length - 1}
                      indent
                    />
                  ))}
                </div>
              ))}
            </div>
          )
        ) : (
          filteredSuppliers.length === 0 ? (
            <EmptyState />
          ) : (
            <div>
              {filteredSuppliers.map((s, i) => (
                <SupplierRow
                  key={s.id}
                  id={s.id}
                  primary={displayName(s)}
                  secondary={`NIT: ${s.nit ?? '—'} · ${s.tipo_persona ?? '—'} · ${s.status ?? '—'}`}
                  isLast={i === filteredSuppliers.length - 1}
                />
              ))}
            </div>
          )
        )}
      </div>

      {showMergeModal && (
        <DuplicatesModal
          groups={duplicateGroups}
          onClose={() => setShowMergeModal(false)}
          onMerged={(_survivorId, absorbedId) => {
            setDuplicateGroups(prev => prev.filter(g => !g.suppliers.some(s => s.id === absorbedId)))
          }}
        />
      )}
    </div>
  )
}

function SupplierRow({ id, primary, secondary, isLast, indent = false }: {
  id: string
  primary: string
  secondary: string
  isLast: boolean
  indent?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: `10px ${indent ? 28 : 20}px`,
      borderBottom: isLast ? undefined : '1px solid rgba(122,145,165,0.08)',
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-dark)', fontWeight: 400 }}>
          {primary}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--hh-haze)', marginTop: 2 }}>
          {secondary}
        </div>
      </div>
      <Link
        to={`/suppliers/${id}`}
        style={{
          fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--hh-teal)',
          textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: 16, flexShrink: 0,
        }}
      >
        Ver perfil →
      </Link>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-haze)' }}>
      Sin proveedores en esta categoría.
    </div>
  )
}
