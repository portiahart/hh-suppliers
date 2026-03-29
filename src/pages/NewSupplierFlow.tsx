import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeftIcon } from '@radix-ui/react-icons'
import { supabase, suppliersQuery } from '../lib/supabase'

const CATEGORIAS = [
  'Alimentos y Bebidas',
  'Servicios Profesionales',
  'Tecnología',
  'Transporte',
  'Mantenimiento',
  'Marketing',
  'Otro',
]

type NitState = 'idle' | 'checking' | 'available' | 'taken'

export function NewSupplierFlow() {
  const navigate = useNavigate()

  // Step 1
  const [nit, setNit] = useState('')
  const [nitState, setNitState] = useState<NitState>('idle')
  const [existingId, setExistingId] = useState<string | null>(null)

  // Step 2
  const [razonSocial, setRazonSocial] = useState('')
  const [nombreOperativo, setNombreOperativo] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [categoria, setCategoria] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const checkNit = async () => {
    if (!nit.trim()) return
    setNitState('checking')
    const { data } = await suppliersQuery()
      .select('id')
      .eq('nit', nit.trim())
      .maybeSingle()
    if (data) {
      setExistingId((data as { id: string }).id)
      setNitState('taken')
    } else {
      setExistingId(null)
      setNitState('available')
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaveError(null)
    setSaving(true)
    const { data, error } = await supabase
      .from('accounts_suppliers')
      .insert({
        name: razonSocial.trim(),
        razon_social: razonSocial.trim(),
        nit: nit.trim(),
        nombre_operativo: nombreOperativo.trim() || null,
        email: email.trim() || null,
        telefono: telefono.trim() || null,
        categoria: categoria || null,
        status: 'ACTIVE',
      })
      .select()
      .single()
    setSaving(false)
    if (error) {
      setSaveError('No se pudo crear el proveedor. Intenta de nuevo.')
    } else {
      navigate(`/suppliers/${(data as { id: string }).id}`, { replace: true })
    }
  }

  return (
    <div>
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
          marginBottom: 32,
        }}
      >
        <ArrowLeftIcon width={16} height={16} />
        Proveedores
      </button>

      <div style={{ maxWidth: 480 }}>
        <div style={{
          background: 'var(--hh-white)',
          border: '1px solid rgba(122,145,165,0.2)',
          borderRadius: 10,
          padding: '36px 40px',
        }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 300,
            fontSize: '1.5rem',
            color: 'var(--hh-dark)',
            margin: '0 0 28px',
          }}>
            Nuevo Proveedor
          </h1>

          {/* ── Step 1: NIT ────────────────────────────── */}
          <div style={{ marginBottom: nitState === 'available' ? 28 : 0 }}>
            <label style={labelStyle}>NIT</label>
            <p style={{ fontSize: '0.75rem', color: 'var(--hh-haze)', margin: '0 0 8px', fontWeight: 300 }}>
              9 dígitos, sin puntos ni dígito de verificación
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                type="text"
                value={nit}
                onChange={e => {
                  setNit(e.target.value.replace(/\D/g, '').slice(0, 9))
                  setNitState('idle')
                }}
                placeholder="000000000"
                maxLength={9}
                style={{ ...inputStyle, flex: 1 }}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
              />
              <button
                type="button"
                onClick={() => void checkNit()}
                disabled={nit.length < 9 || nitState === 'checking'}
                style={{
                  background: nit.length < 9 ? 'rgba(74,155,142,0.4)' : 'var(--hh-teal)',
                  color: '#fff',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  fontSize: '0.8125rem',
                  border: 'none',
                  borderRadius: 6,
                  padding: '0 16px',
                  cursor: nit.length < 9 ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {nitState === 'checking' ? 'Buscando…' : 'Buscar en DIAN →'}
              </button>
            </div>

            {/* NIT feedback */}
            {nitState === 'taken' && (
              <p style={{ margin: '10px 0 0', fontSize: '0.8125rem', color: 'var(--hh-mango)', fontWeight: 400 }}>
                Este proveedor ya existe.{' '}
                <Link
                  to={`/suppliers/${existingId}`}
                  style={{ color: 'var(--hh-teal)', textDecoration: 'underline', textUnderlineOffset: 2 }}
                >
                  Ver perfil →
                </Link>
              </p>
            )}
            {nitState === 'available' && (
              <p style={{ margin: '10px 0 0', fontSize: '0.8125rem', color: 'var(--hh-teal)', fontWeight: 400 }}>
                NIT disponible ✓
              </p>
            )}
          </div>

          {/* ── Step 2: Basic details ───────────────────── */}
          {nitState === 'available' && (
            <form onSubmit={e => void handleCreate(e)} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ height: 1, background: 'rgba(122,145,165,0.15)', margin: '0 0 4px' }} />

              <div>
                <label style={labelStyle}>Razón Social</label>
                <input
                  type="text"
                  value={razonSocial}
                  onChange={e => setRazonSocial(e.target.value)}
                  required
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Nombre Operativo{' '}
                  <span style={{ fontWeight: 300, textTransform: 'none', letterSpacing: 0, color: 'var(--hh-haze)' }}>
                    (opcional)
                  </span>
                </label>
                <input
                  type="text"
                  value={nombreOperativo}
                  onChange={e => setNombreOperativo(e.target.value)}
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
                />
              </div>

              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
                />
              </div>

              <div>
                <label style={labelStyle}>
                  Teléfono{' '}
                  <span style={{ fontWeight: 300, textTransform: 'none', letterSpacing: 0, color: 'var(--hh-haze)' }}>
                    (opcional)
                  </span>
                </label>
                <input
                  type="text"
                  value={telefono}
                  onChange={e => setTelefono(e.target.value)}
                  style={inputStyle}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
                />
              </div>

              <div>
                <label style={labelStyle}>Categoría</label>
                <select
                  value={categoria}
                  onChange={e => setCategoria(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
                >
                  <option value="">— Seleccionar —</option>
                  {CATEGORIAS.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {saveError && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--hh-mango)', margin: 0 }}>
                  {saveError}
                </p>
              )}

              <button
                type="submit"
                disabled={saving || !razonSocial.trim()}
                style={{
                  marginTop: 4,
                  background: saving || !razonSocial.trim() ? 'rgba(74,155,142,0.5)' : 'var(--hh-teal)',
                  color: '#fff',
                  fontFamily: 'var(--font-body)',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  border: 'none',
                  borderRadius: 6,
                  padding: '11px 20px',
                  cursor: saving || !razonSocial.trim() ? 'not-allowed' : 'pointer',
                  width: '100%',
                }}
              >
                {saving ? 'Creando…' : 'Crear Proveedor'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  fontSize: '0.6875rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--hh-teal)',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontFamily: 'var(--font-body)',
  fontWeight: 300,
  fontSize: '0.875rem',
  color: 'var(--hh-dark)',
  background: 'var(--hh-ice)',
  border: '1px solid rgba(122,145,165,0.4)',
  borderRadius: 6,
  padding: '9px 12px',
  outline: 'none',
  boxSizing: 'border-box',
}
