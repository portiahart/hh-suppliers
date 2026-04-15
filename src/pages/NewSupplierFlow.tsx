import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { ArrowLeftIcon } from '@radix-ui/react-icons'
import { supabase, suppliersQuery } from '../lib/supabase'

export function NewSupplierFlow() {
  const navigate = useNavigate()

  const [razonSocial, setRazonSocial] = useState('')
  const [nit, setNit] = useState('')
  const [nombreOperativo, setNombreOperativo] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setDuplicateId(null)

    // Check for duplicate NIT
    if (nit.trim()) {
      const { data: existing } = await suppliersQuery('id').eq('nit', nit.trim()).maybeSingle()
      if (existing) {
        setDuplicateId((existing as unknown as { id: string }).id)
        setError('Ya existe un proveedor con este NIT.')
        return
      }
    }

    setSaving(true)
    const { data, error: insertError } = await supabase
      .from('accounts_suppliers')
      .insert({
        name:             razonSocial.trim(),
        razon_social:     razonSocial.trim(),
        nit:              nit.trim() || null,
        nombre_operativo: nombreOperativo.trim() || null,
        email:            email.trim() || null,
        telefono:         telefono.trim() || null,
        status:           'ACTIVE',
      })
      .select()
      .single()
    setSaving(false)

    if (insertError) {
      setError('No se pudo crear el proveedor. Intenta de nuevo.')
    } else {
      navigate(`/suppliers/${(data as { id: string }).id}`, { replace: true })
    }
  }

  const canSave = razonSocial.trim().length > 0 && !saving

  return (
    <div>
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none',
          color: 'var(--hh-haze)', fontFamily: 'var(--font-body)',
          fontSize: '0.8125rem', cursor: 'pointer', padding: 0, marginBottom: 32,
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
            fontFamily: 'var(--font-display)', fontWeight: 300,
            fontSize: '1.5rem', color: 'var(--hh-dark)', margin: '0 0 28px',
          }}>
            Nuevo Proveedor
          </h1>

          <form onSubmit={e => void handleCreate(e)} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <label style={labelStyle}>
                Razón Social <span style={requiredStyle}>*</span>
              </label>
              <input
                type="text"
                value={razonSocial}
                onChange={e => setRazonSocial(e.target.value)}
                required
                autoFocus
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
              />
            </div>

            <div>
              <label style={labelStyle}>NIT</label>
              <input
                type="text"
                value={nit}
                onChange={e => { setNit(e.target.value.replace(/\D/g, '').slice(0, 10)); setDuplicateId(null); setError(null) }}
                placeholder="Sin puntos ni dígito de verificación"
                style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
              />
            </div>

            <div>
              <label style={labelStyle}>
                Nombre Operativo{' '}
                <span style={optionalStyle}>(opcional)</span>
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
              <label style={labelStyle}>
                Email{' '}
                <span style={optionalStyle}>(opcional)</span>
              </label>
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
                <span style={optionalStyle}>(opcional)</span>
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

            {error && (
              <div style={{ fontSize: '0.8125rem', color: 'var(--hh-mango)', margin: 0 }}>
                {error}
                {duplicateId && (
                  <>
                    {' '}
                    <Link to={`/suppliers/${duplicateId}`} style={{ color: 'var(--hh-teal)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                      Ver perfil →
                    </Link>
                  </>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSave}
              style={{
                marginTop: 4,
                background: canSave ? 'var(--hh-teal)' : 'rgba(74,155,142,0.5)',
                color: '#fff',
                fontFamily: 'var(--font-body)', fontWeight: 500,
                fontSize: '0.875rem', border: 'none', borderRadius: 6,
                padding: '11px 20px',
                cursor: canSave ? 'pointer' : 'not-allowed',
                width: '100%',
              }}
            >
              {saving ? 'Creando…' : 'Crear Proveedor'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontFamily: 'var(--font-body)', fontWeight: 500,
  fontSize: '0.6875rem', textTransform: 'uppercase',
  letterSpacing: '0.12em', color: 'var(--hh-teal)', marginBottom: 6,
}

const requiredStyle: React.CSSProperties = {
  color: 'var(--hh-mango)', fontWeight: 400,
}

const optionalStyle: React.CSSProperties = {
  fontWeight: 300, textTransform: 'none', letterSpacing: 0, color: 'var(--hh-haze)',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  fontFamily: 'var(--font-body)', fontWeight: 300,
  fontSize: '0.875rem', color: 'var(--hh-dark)',
  background: 'var(--hh-ice)',
  border: '1px solid rgba(122,145,165,0.4)',
  borderRadius: 6, padding: '9px 12px',
  outline: 'none', boxSizing: 'border-box',
}
