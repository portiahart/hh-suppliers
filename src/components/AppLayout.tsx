import { Outlet, useNavigate } from 'react-router-dom'
import { ExitIcon } from '@radix-ui/react-icons'
import { Sidebar } from './Sidebar'
import { supabase } from '../lib/supabase'

export function AppLayout() {
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--hh-ice)' }}>
        {/* Top bar */}
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '12px 48px',
          borderBottom: '1px solid rgba(122,145,165,0.15)',
        }}>
          <button
            onClick={() => void handleSignOut()}
            title="Cerrar sesión"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--hh-haze)',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.15s ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--hh-dark)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--hh-haze)')}
          >
            <ExitIcon width={18} height={18} />
          </button>
        </div>
        <main style={{ flex: 1, padding: '40px 48px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
