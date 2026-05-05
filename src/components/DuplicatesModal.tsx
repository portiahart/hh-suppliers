import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cross2Icon } from '@radix-ui/react-icons'
import { supabase } from '../lib/supabase'

export interface DuplicateSupplier {
  id: string
  razon_social: string | null
  nombre_operativo: string | null
  nit: string | null
  status: string | null
  created_at: string
}

export interface DuplicateGroup {
  key: string
  suppliers: DuplicateSupplier[]
}

interface Props {
  groups: DuplicateGroup[]
  onClose: () => void
  onMerged: (survivorId: string, absorbedId: string) => void
}

export function DuplicatesModal({ groups, onClose, onMerged }: Props) {
  const navigate = useNavigate()
  const [merging, setMerging] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleMerge = async (group: DuplicateGroup) => {
    setError(null)
    setMerging(group.key)

    // Pick winner: prefer the one with a NIT; if tied, prefer the older record
    const [a, b] = group.suppliers
    const winner = (a.nit && !b.nit)
      ? a
      : (!a.nit && b.nit)
        ? b
        : new Date(a.created_at) <= new Date(b.created_at) ? a : b
    const loser  = winner.id === a.id ? b : a

    // 1. Reassign transactions from loser → winner
    const { error: txErr } = await supabase
      .from('accounts_transactions')
      .update({ supplier_id: winner.id })
      .eq('supplier_id', loser.id)
    if (txErr) { setError(`Error al reasignar transacciones: ${txErr.message}`); setMerging(null); return }

    // 2. Archive the loser
    const { error: archErr } = await supabase
      .from('accounts_suppliers')
      .update({ archived_at: new Date().toISOString() })
      .eq('id', loser.id)
    if (archErr) { setError(`Error al archivar duplicado: ${archErr.message}`); setMerging(null); return }

    setMerging(null)
    onMerged(winner.id, loser.id)
  }

  return (
    <div style={{
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
        width: '100%', maxWidth: 640,
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
              Duplicados detectados
            </h2>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--hh-haze)', margin: '4px 0 0' }}>
              {groups.length} {groups.length === 1 ? 'grupo' : 'grupos'} · Al fusionar se conserva el registro con NIT; el otro se archiva.
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--hh-haze)', padding: 4 }}>
            <Cross2Icon width={18} height={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '16px 24px 24px', flex: 1 }}>
          {error && (
            <div style={{
              marginBottom: 16, padding: '10px 14px', borderRadius: 6,
              background: 'rgba(185,72,78,0.08)', border: '1px solid rgba(185,72,78,0.25)',
              fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: '#B9484E',
            }}>{error}</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {groups.map(group => (
              <div key={group.key} style={{
                border: '1px solid rgba(122,145,165,0.2)',
                borderRadius: 8,
                overflow: 'hidden',
              }}>
                {/* Group header */}
                <div style={{
                  background: 'rgba(122,145,165,0.06)',
                  padding: '10px 16px',
                  borderBottom: '1px solid rgba(122,145,165,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.875rem', color: 'var(--hh-dark)' }}>
                    {group.suppliers[0].razon_social}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleMerge(group)}
                      disabled={merging === group.key}
                      style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.75rem', fontWeight: 500,
                        padding: '5px 12px', borderRadius: 4, cursor: merging === group.key ? 'default' : 'pointer',
                        background: 'var(--hh-teal)', color: '#fff', border: 'none',
                        opacity: merging === group.key ? 0.6 : 1,
                      }}
                    >
                      {merging === group.key ? 'Fusionando…' : 'Fusionar'}
                    </button>
                  </div>
                </div>

                {/* Supplier rows */}
                {group.suppliers.map((s, i) => (
                  <div key={s.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px',
                    borderTop: i > 0 ? '1px solid rgba(122,145,165,0.1)' : undefined,
                  }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8125rem', color: 'var(--hh-dark)', fontWeight: 400 }}>
                          {s.nombre_operativo ? `${s.razon_social} (${s.nombre_operativo})` : s.razon_social}
                        </div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--hh-haze)', marginTop: 2 }}>
                          {s.nit ? `NIT ${s.nit}` : 'Sin NIT'} · {s.status ?? '—'} · creado {new Date(s.created_at).toLocaleDateString('es-CO')}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => { onClose(); navigate(`/suppliers/${s.id}`) }}
                      style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--hh-teal)',
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap',
                      }}
                    >
                      Ver perfil →
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
