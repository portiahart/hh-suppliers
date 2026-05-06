import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cross2Icon } from '@radix-ui/react-icons'

export interface NoNitSupplier {
  id: string
  razon_social: string | null
  nombre_operativo: string | null
  status: string | null
  created_at: string
}

interface Props {
  suppliers: NoNitSupplier[]
  onClose: () => void
}

export function NoNitModal({ suppliers, onClose }: Props) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? suppliers.filter(s =>
        (s.razon_social ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (s.nombre_operativo ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : suppliers

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--hh-white)',
        borderRadius: 10,
        width: '100%', maxWidth: 600,
        maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: '1px solid rgba(122,145,165,0.2)',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: '1.25rem', color: 'var(--hh-dark)', margin: 0 }}>
              Proveedores sin NIT
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--hh-haze)', margin: '4px 0 0' }}>
              {suppliers.length} {suppliers.length === 1 ? 'proveedor' : 'proveedores'} sin NIT registrado
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--hh-haze)', padding: 4 }}>
            <Cross2Icon width={18} height={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 24px 0', flexShrink: 0 }}>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar por nombre…"
            style={{
              width: '100%',
              padding: '9px 12px',
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              color: 'var(--hh-dark)',
              background: 'var(--hh-ice)',
              border: '1px solid rgba(122,145,165,0.25)',
              borderRadius: 6,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* List */}
        <div style={{ overflowY: 'auto', padding: '12px 24px 24px', flex: 1 }}>
          {filtered.length === 0 ? (
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-haze)', textAlign: 'center', marginTop: 24 }}>
              Sin resultados
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map((s, i) => (
                <div
                  key={s.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: i < filtered.length - 1 ? '1px solid rgba(122,145,165,0.1)' : undefined,
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--hh-dark)', fontWeight: 400 }}>
                      {s.nombre_operativo
                        ? `${s.razon_social} (${s.nombre_operativo})`
                        : s.razon_social ?? '—'}
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--hh-haze)', marginTop: 2 }}>
                      {s.status ?? '—'} · creado {new Date(s.created_at).toLocaleDateString('es-CO')}
                    </div>
                  </div>
                  <button
                    onClick={() => { onClose(); navigate(`/suppliers/${s.id}`) }}
                    style={{
                      fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--hh-teal)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap',
                      marginLeft: 16, flexShrink: 0,
                    }}
                  >
                    Ver perfil →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
