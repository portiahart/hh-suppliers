import { useState, useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { ExitIcon, GearIcon, ArrowLeftIcon, HamburgerMenuIcon, HomeIcon } from '@radix-ui/react-icons'
import { Sidebar } from './Sidebar'
import { supabase } from '../lib/supabase'

export function AppLayout() {
  const navigate = useNavigate()
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const handler = () => {
      const mobile = window.innerWidth <= 768
      setIsMobile(mobile)
      if (!mobile) setSidebarOpen(false)
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const btn = (extraStyle?: React.CSSProperties): React.CSSProperties => ({
    background: 'transparent',
    border: 'none',
    color: 'var(--hh-haze)',
    cursor: 'pointer',
    padding: 6,
    borderRadius: 4,
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.15s ease',
    ...extraStyle,
  })

  const hoverDark = {
    onMouseEnter: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.color = 'var(--hh-dark)' },
    onMouseLeave: (e: React.MouseEvent<HTMLButtonElement>) => { e.currentTarget.style.color = 'var(--hh-haze)' },
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar
        isMobile={isMobile}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Mobile sidebar overlay */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 9,
          }}
        />
      )}

      {/* Main area */}
      <div style={{
        marginLeft: isMobile ? 0 : 220,
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        background: 'var(--hh-ice)',
      }}>
        {/* Top bar — pale background, so icons/logo are dark */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: `12px ${isMobile ? '16px' : '48px'}`,
          borderBottom: '1px solid rgba(122,145,165,0.15)',
          background: 'var(--hh-ice)',
          position: 'sticky',
          top: 0,
          zIndex: 8,
        }}>
          {/* Left: hamburger (mobile) + logo (mobile) + home icon (mobile) + back */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {isMobile && (
              <button
                onClick={() => setSidebarOpen(true)}
                title="Menú"
                style={btn()}
                {...hoverDark}
              >
                <HamburgerMenuIcon width={18} height={18} />
              </button>
            )}

            {isMobile && (
              <>
                <a
                  href="https://corazon.portiahart.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', marginLeft: 4 }}
                >
                  {/* filter: brightness(0) converts white logo to black for pale background */}
                  <img
                    src="https://dqfrqjsbfmwtclkclmvc.supabase.co/storage/v1/object/public/brand/HH_white.png"
                    alt="Hart Hospitality Group"
                    style={{ height: 24, width: 'auto', display: 'block', filter: 'brightness(0)' }}
                  />
                </a>
                <button
                  onClick={() => navigate('/')}
                  title="Inicio"
                  style={btn({ marginLeft: 2 })}
                  {...hoverDark}
                >
                  <HomeIcon width={18} height={18} />
                </button>
              </>
            )}

            <button
              onClick={() => navigate(-1)}
              title="Atrás"
              style={btn({ marginLeft: isMobile ? 4 : 0 })}
              {...hoverDark}
            >
              <ArrowLeftIcon width={18} height={18} />
            </button>
          </div>

          {/* Right: settings + logout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => navigate('/settings')}
              title="Configuración"
              style={btn()}
              {...hoverDark}
            >
              <GearIcon width={18} height={18} />
            </button>
            <button
              onClick={() => void handleSignOut()}
              title="Cerrar sesión"
              style={btn()}
              {...hoverDark}
            >
              <ExitIcon width={18} height={18} />
            </button>
          </div>
        </div>

        <main style={{ flex: 1, padding: isMobile ? '24px 16px' : '40px 48px' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
