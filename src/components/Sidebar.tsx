import { NavLink } from 'react-router-dom'
import { PersonIcon, PlusCircledIcon } from '@radix-ui/react-icons'

export function Sidebar() {
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
      {/* Logo */}
      <div style={{ padding: '28px 24px 24px' }}>
        <img
          src="https://dqfrqjsbfmwtclkclmvc.supabase.co/storage/v1/object/public/brand/HH_white.png"
          alt="Hart Hospitality Group"
          style={{ height: 36, width: 'auto', display: 'block' }}
        />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(122,145,165,0.2)', margin: '0 24px' }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 0' }}>
        <NavItem to="/" icon={<PersonIcon width={20} height={20} />} label="Proveedores" />
        <NavItem to="/new" icon={<PlusCircledIcon width={20} height={20} />} label="Nuevo Proveedor" />
      </nav>
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
