import { useState, useEffect } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { PersonIcon, PlusCircledIcon, HomeIcon, BarChartIcon, MixerHorizontalIcon, ArrowDownIcon, ArrowUpIcon } from '@radix-ui/react-icons'
import { supabase } from '../lib/supabase'

interface SidebarProps {
  isMobile?: boolean
  isOpen?: boolean
  onClose?: () => void
}

type Counts = {
  duplicado: number
  'tipo-persona': number
  'razon-social': number
  nit: number
  rut: number
}

export function Sidebar({ isMobile = false, isOpen = false, onClose }: SidebarProps) {
  const [counts, setCounts] = useState<Counts | null>(null)

  useEffect(() => {
    void (async () => {
      // Active supplier IDs: any spend recorded in 2025 or 2026
      const { data: spendRows } = await supabase
        .from('suppliers_spend_monthly')
        .select('supplier_id')
        .in('year', [2025, 2026])
      const activeIds = new Set((spendRows ?? []).map(r => (r as { supplier_id: string }).supplier_id))
      if (activeIds.size === 0) return

      const countActive = (ids: string[]) => ids.filter(id => activeIds.has(id)).length

      const [noTipo, noRazon, noNit, allSupp, rutDocs, allRS] = await Promise.all([
        supabase.from('accounts_suppliers').select('id').is('archived_at', null).is('tipo_persona', null).limit(10000),
        supabase.from('accounts_suppliers').select('id').is('archived_at', null).is('razon_social', null).limit(10000),
        supabase.from('accounts_suppliers').select('id').is('archived_at', null).is('nit', null).limit(10000),
        supabase.from('accounts_suppliers').select('id').is('archived_at', null).limit(10000),
        supabase.from('suppliers_documents').select('supplier_id').eq('document_type', 'RUT'),
        supabase.from('accounts_suppliers').select('id, razon_social').is('archived_at', null).limit(10000),
      ])

      const withRut = new Set((rutDocs.data ?? []).map(d => (d as { supplier_id: string }).supplier_id))
      const noRutIds = (allSupp.data ?? [])
        .map(s => (s as { id: string }).id)
        .filter(id => !withRut.has(id))

      const seen = new Map<string, string[]>()
      for (const s of (allRS.data ?? []) as { id: string; razon_social: string | null }[]) {
        const key = (s.razon_social ?? '').trim().toLowerCase()
        if (!key) continue
        if (!seen.has(key)) seen.set(key, [])
        seen.get(key)!.push(s.id)
      }
      const dupeIds: string[] = []
      for (const ids of seen.values()) {
        if (ids.length > 1) dupeIds.push(...ids)
      }

      setCounts({
        duplicado:      countActive(dupeIds),
        'tipo-persona': countActive((noTipo.data ?? []).map(s => (s as { id: string }).id)),
        'razon-social': countActive((noRazon.data ?? []).map(s => (s as { id: string }).id)),
        nit:            countActive((noNit.data ?? []).map(s => (s as { id: string }).id)),
        rut:            countActive(noRutIds),
      })
    })()
  }, [])

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
        overflowY: 'auto',
        transform: isMobile && !isOpen ? 'translateX(-220px)' : 'translateX(0)',
        transition: 'transform 0.25s ease',
      }}
    >
      {/* Logo */}
      <div style={{ padding: '28px 24px 24px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <a
          href="https://corazon.portiahart.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', flex: 1 }}
        >
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
        <NavItem to="/reportes-bic" icon={<BarChartIcon width={20} height={20} />} label="Reportes BIC" onClick={onClose} />

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(122,145,165,0.15)', margin: '12px 24px' }} />

        <SectionHeader icon={<MixerHorizontalIcon width={20} height={20} />} label="Proveedores Activos & Incompletos" />
        <SubNavItem to="/incompletos/duplicado"    label="Duplicado"         count={counts?.duplicado}      onClick={onClose} />
        <SubNavItem to="/incompletos/tipo-persona" label="Tipo de persona"   count={counts?.['tipo-persona']} onClick={onClose} />
        <SubNavItem to="/incompletos/razon-social" label="Razón Social"      count={counts?.['razon-social']} onClick={onClose} />
        <SubNavItem to="/incompletos/nit"          label="NIT / CC"          count={counts?.nit}            onClick={onClose} />
        <SubNavItem to="/incompletos/rut"          label="RUT presente o no" count={counts?.rut}            onClick={onClose} />

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(122,145,165,0.15)', margin: '12px 24px' }} />

        <NavItem to="/cxp" icon={<ArrowDownIcon width={20} height={20} />} label="CxP" onClick={onClose} />

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(122,145,165,0.15)', margin: '12px 24px' }} />

        <SectionHeader icon={<ArrowUpIcon width={20} height={20} />} label="CxC" />
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

function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 24px',
      color: 'var(--hh-haze)', fontFamily: 'var(--font-body)',
      fontWeight: 400, fontSize: '0.875rem',
      borderLeft: '2px solid transparent',
    }}>
      <span style={{ flexShrink: 0 }}>{icon}</span>
      {label}
    </div>
  )
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

function SubNavItem({ to, label, count, onClick }: { to: string; label: string; count?: number; onClick?: () => void }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '7px 24px 7px 32px',
        textDecoration: 'none',
        color: isActive ? 'var(--hh-teal)' : 'rgba(122,145,165,0.75)',
        fontFamily: 'var(--font-body)',
        fontWeight: 400,
        fontSize: '0.8125rem',
        background: isActive ? 'rgba(74,155,142,0.08)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--hh-teal)' : '2px solid transparent',
        transition: 'color 0.15s ease',
      })}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span style={{
          fontSize: '0.6875rem',
          color: 'rgba(122,145,165,0.55)',
          background: 'rgba(122,145,165,0.12)',
          borderRadius: 10,
          padding: '1px 6px',
          marginLeft: 6,
          flexShrink: 0,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {count}
        </span>
      )}
    </NavLink>
  )
}
