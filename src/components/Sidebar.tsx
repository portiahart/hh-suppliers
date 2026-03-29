import { NavLink, useNavigate } from 'react-router-dom'
import { PersonIcon, PlusCircledIcon } from '@radix-ui/react-icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function Sidebar() {
  const navigate = useNavigate()
  const { session } = useAuth()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <aside
      style={{
        width: 220,
        minWidth: 220,
        background: 'var(--hh-dark)',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 10,
      }}
    >
      {/* Wordmark */}
      <div style={{ padding: '28px 24px 24px' }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 200,
            fontSize: '1.125rem',
            color: 'var(--hh-ice)',
            letterSpacing: '0.02em',
            lineHeight: 1.2,
            display: 'block',
          }}
        >
          Hart Hospitality
          <br />
          <span style={{ fontStyle: 'italic', fontWeight: 200, fontSize: '0.85rem', color: 'var(--hh-haze)' }}>
            Group
          </span>
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(122,145,165,0.2)', margin: '0 24px' }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 0' }}>
        <NavItem to="/" icon={<PersonIcon width={20} height={20} />} label="Proveedores" />
        <NavItem to="/new" icon={<PlusCircledIcon width={20} height={20} />} label="Nuevo Proveedor" />
      </nav>

      {/* Footer */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(122,145,165,0.2)' }}>
        {session?.user.email && (
          <p style={{
            fontSize: '0.75rem',
            color: 'var(--hh-haze)',
            margin: '0 0 10px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {session.user.email}
          </p>
        )}
        <button
          onClick={() => void handleSignOut()}
          style={{
            background: 'transparent',
            border: '1px solid rgba(122,145,165,0.3)',
            color: 'var(--hh-haze)',
            fontFamily: 'var(--font-body)',
            fontSize: '0.75rem',
            fontWeight: 500,
            padding: '6px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            width: '100%',
            textAlign: 'left',
          }}
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
}

function NavItem({ to, icon, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 24px',
        textDecoration: 'none',
        color: isActive ? 'var(--hh-teal)' : 'var(--hh-haze)',
        fontFamily: 'var(--font-body)',
        fontWeight: 400,
        fontSize: '0.875rem',
        background: isActive ? 'rgba(74,155,142,0.1)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--hh-teal)' : '2px solid transparent',
        transition: 'all 0.15s ease',
      })}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      {label}
    </NavLink>
  )
}
