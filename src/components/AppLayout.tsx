import { useState, useEffect, useRef } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { ExitIcon, GearIcon, ArrowLeftIcon, HamburgerMenuIcon, HomeIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { Sidebar } from './Sidebar'
import { supabase, suppliersQuery } from '../lib/supabase'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

interface SupplierHit { id: string; name: string | null; razon_social: string | null; nombre_operativo: string | null; nit: string | null }

function supplierDisplayName(s: SupplierHit): string {
  const legal = s.razon_social || s.name || ''
  return s.nombre_operativo && s.nombre_operativo !== legal
    ? `${legal} (${s.nombre_operativo})`
    : legal
}

export function AppLayout() {
  const navigate = useNavigate()
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Global search
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SupplierHit[]>([])
  const [showDrop, setShowDrop] = useState(false)
  const [searching, setSearching] = useState(false)
  const debouncedQuery = useDebounce(query, 250)
  const searchRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!debouncedQuery.trim()) { setHits([]); setShowDrop(false); return }
    setSearching(true)
    void (async () => {
      const term = debouncedQuery.trim()
      const cleanNit = term.replace(/\D/g, '')
      const filters = [
        `name.ilike.%${term}%`,
        `razon_social.ilike.%${term}%`,
        `nombre_operativo.ilike.%${term}%`,
        ...(cleanNit.length > 0 ? [`nit.ilike.%${cleanNit}%`] : []),
      ]
      const { data } = await suppliersQuery('id, name, razon_social, nombre_operativo, nit').or(filters.join(',')).limit(8)
      setHits((data as unknown as SupplierHit[]) ?? [])
      setShowDrop(true)
      setSearching(false)
    })()
  }, [debouncedQuery])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Keyboard shortcut: Cmd+K / Ctrl+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const selectHit = (id: string) => {
    setQuery('')
    setHits([])
    setShowDrop(false)
    navigate(`/suppliers/${id}`)
  }

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

          {/* Center: global search */}
          <div ref={searchRef} style={{ position: 'relative', flex: 1, maxWidth: 360, margin: '0 16px' }}>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <MagnifyingGlassIcon
                width={14} height={14}
                style={{ position: 'absolute', left: 10, color: 'var(--hh-haze)', pointerEvents: 'none', flexShrink: 0 }}
              />
              {searching && (
                <div style={{
                  position: 'absolute', right: 10, width: 12, height: 12,
                  border: '2px solid rgba(122,145,165,0.3)', borderTopColor: 'var(--hh-teal)',
                  borderRadius: '50%', animation: 'spin 0.7s linear infinite',
                }} />
              )}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onFocus={() => { if (hits.length > 0) setShowDrop(true) }}
                placeholder="Buscar proveedor… ⌘K"
                style={{
                  width: '100%',
                  fontFamily: 'var(--font-body)', fontWeight: 300,
                  fontSize: '0.8125rem', color: 'var(--hh-dark)',
                  background: 'rgba(122,145,165,0.08)',
                  border: '1px solid rgba(122,145,165,0.2)',
                  borderRadius: 6, padding: '7px 32px 7px 32px',
                  outline: 'none', boxSizing: 'border-box',
                }}
                onKeyDown={e => {
                  if (e.key === 'Escape') { setQuery(''); setShowDrop(false) }
                  if (e.key === 'Enter' && hits.length > 0) selectHit(hits[0].id)
                }}
              />
            </div>
            {showDrop && hits.length > 0 && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
                background: 'var(--hh-white)', border: '1px solid rgba(122,145,165,0.2)',
                borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                overflow: 'hidden', zIndex: 100,
              }}>
                {hits.map(h => (
                  <button
                    key={h.id}
                    onMouseDown={() => selectHit(h.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      fontFamily: 'var(--font-body)', fontSize: '0.8125rem',
                      color: 'var(--hh-dark)', background: 'transparent',
                      border: 'none', padding: '10px 14px',
                      cursor: 'pointer', borderBottom: '1px solid rgba(122,145,165,0.1)',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--hh-ice)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontWeight: 400 }}>{supplierDisplayName(h)}</span>
                    {h.nit && (
                      <span style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--hh-haze)' }}>
                        {h.nit}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
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
