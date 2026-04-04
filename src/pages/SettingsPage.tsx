import { useAuth } from '../context/AuthContext'

export function SettingsPage() {
  const { session } = useAuth()

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 300,
        fontSize: '1.75rem',
        color: 'var(--hh-dark)',
        marginBottom: 32,
      }}>
        Configuración
      </h1>

      <div style={{
        background: 'white',
        borderRadius: 12,
        padding: 24,
        border: '1px solid rgba(122,145,165,0.15)',
      }}>
        <div>
          <div style={{
            fontSize: '0.7rem',
            color: 'var(--hh-haze)',
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            Usuario
          </div>
          <div style={{ color: 'var(--hh-dark)', fontWeight: 400 }}>
            {session?.user?.email ?? '—'}
          </div>
        </div>
      </div>
    </div>
  )
}
