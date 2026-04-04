import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)

  // If a valid .portiahart.com session cookie already exists (e.g. from another subdomain),
  // skip the login form entirely.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        window.location.replace('/')
      } else {
        setCheckingSession(false)
      }
    })
  }, [])

  if (checkingSession) {
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    setLoading(false)
    if (!res.ok) {
      setError('Correo o contraseña incorrectos.')
    } else {
      // Hard redirect so the browser client re-initialises and reads the new cookie
      window.location.replace('/')
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--hh-dark)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          width: '100%',
          maxWidth: 320,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {/* Logo */}
        <img
          src="https://dqfrqjsbfmwtclkclmvc.supabase.co/storage/v1/object/public/brand/HH_white.png"
          alt="Hart Hospitality Group"
          style={{ width: 80, display: 'block', margin: '0 auto 2rem' }}
        />

        {/* Email */}
        <div>
          <label style={labelStyle}>Correo electrónico</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
          />
        </div>

        {/* Password */}
        <div>
          <label style={labelStyle}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={inputStyle}
            onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
            onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
          />
        </div>

        {/* Error */}
        {error && (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '0.8125rem',
            color: 'var(--hh-mango)',
            margin: 0,
          }}>
            {error}
          </p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 4,
            background: loading ? 'rgba(74,155,142,0.6)' : 'var(--hh-teal)',
            color: '#fff',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: '0.8125rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            border: 'none',
            borderRadius: 6,
            padding: '12px 20px',
            cursor: loading ? 'not-allowed' : 'pointer',
            width: '100%',
            transition: 'background 0.15s',
          }}
        >
          {loading ? 'Iniciando sesión…' : 'Iniciar sesión'}
        </button>
      </form>
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
  color: 'rgba(242,245,248,0.55)',
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
  padding: '10px 12px',
  outline: 'none',
  boxSizing: 'border-box',
}
