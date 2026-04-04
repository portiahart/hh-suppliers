import { Link, NavLink } from 'react-router-dom'
import { PersonIcon, PlusCircledIcon, HomeIcon } from '@radix-ui/react-icons'

interface SidebarProps {
  isMobile?: boolean
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isMobile = false, isOpen = false, onClose }: SidebarProps) {
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
        transform: isMobile && !isOpen ? 'translateX(-220px)' : 'translateX(0)',
        transition: 'transform 0.25s ease',
      }}
    >
      {/* Logo (→ corazon.portiahart.com) + Home icon */}
      <div style={{ padding: '28px 24px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <a
          href="https://corazon.portiahart.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', flex: 1 }}
        >
          {/* White logo — sidebar has dark background */}
          <img
            src="https://dqfrqjsbfmwtclkclmvc.supabase.co/storage/v1/object/public/brand/HH_white.png"
            alt="Hart Hospitality Group"
            style={{ height: 36, width: 'auto', display: 'block' }}
          />
        </a>
        <Link
          to="/"
          onClick={onClose}
          title="Inicio"
          style={{ display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.45)', flexShrink: 0, transition: 'color 0.15s ease' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'white' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.45)' }}
        >
          <HomeIcon width={18} height={18} />
        </Link>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(122,145,165,0.2)', margin: '0 24px' }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: '16px 0' }}>
        <NavItem to="/" icon={<PersonIcon width={20} height={20} />} label="Proveedores" onClick={onClose} />
        <NavItem to="/new" icon={<PlusCircledIcon width={20} height={20} />} label="Nuevo Proveedor" onClick={onClose} />
      </nav>
    </aside>
  )
}

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
  onClick?: () => void
}

function NavItem({ to, icon, label, onClick }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClick}
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
