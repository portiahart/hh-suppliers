import { useState, useEffect, useRef } from 'react'
import { CheckIcon, Cross2Icon } from '@radix-ui/react-icons'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

/* ─── Date helpers ───────────────────────────────────────── */

function parseSheetDate(val: unknown): Date | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number') {
    // Google Sheets serial: days since Dec 30, 1899
    const d = new Date((val - 25569) * 86400 * 1000)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof val === 'string' && val.trim()) {
    const d = new Date(val.trim())
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/* ─── Number parser ──────────────────────────────────────── */

function parseNum(val: unknown): number {
  if (typeof val === 'number') return val
  if (!val) return 0
  const cleaned = String(val).replace(/[^0-9,.\-]/g, '')
  if (!cleaned) return 0
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  const dotCount = (cleaned.match(/\./g) || []).length
  const commaCount = (cleaned.match(/,/g) || []).length
  if (dotCount > 1) return parseFloat(cleaned.replace(/\./g, '')) || 0
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
    return parseFloat(cleaned.replace(/,/g, '')) || 0
  }
  if (commaCount === 1 && dotCount === 0) {
    const parts = cleaned.split(',')
    if (parts[1].length <= 2) return parseFloat(cleaned.replace(',', '.')) || 0
  }
  return parseFloat(cleaned) || 0
}

function cell(row: unknown[], idx: number): string {
  const v = row[idx]
  return v === null || v === undefined ? '' : String(v).trim()
}

/* ─── Types ──────────────────────────────────────────────── */

interface PendingRow {
  proveedor: string
  empresa: string
  concepto: string
  centroCosto: string
  fechaVencimiento: string
  fechaVencDate: Date | null
  importe: number
  absoluteRowIndex: number
  highlight: 'red' | 'amber' | null
}

interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error'
}

interface Props {
  onClose: () => void
  onApproved: () => void
}

/* ─── Modal ──────────────────────────────────────────────── */

export function PendingApprovalsModal({ onClose, onApproved }: Props) {
  const { session } = useAuth()
  const backdropRef = useRef<HTMLDivElement>(null)

  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const [rows, setRows] = useState<PendingRow[]>([])
  const [removedRows, setRemovedRows] = useState<Set<number>>(new Set())
  const [processing, setProcessing] = useState<number | null>(null)
  const [rejectRow, setRejectRow] = useState<PendingRow | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [userRole, setUserRole] = useState('general_manager')

  /* ── Close on Escape ─── */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !rejectRow) onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose, rejectRow])

  /* ── Fetch user role ─── */
  useEffect(() => {
    if (!session?.user?.id) return
    void (async () => {
      const { data } = await supabase
        .from('crm_users')
        .select('is_super_admin')
        .eq('id', session.user.id)
        .single()
      if (data?.is_super_admin) setUserRole('super_admin')
    })()
  }, [session])

  /* ── Fetch xPP data ─── */
  useEffect(() => {
    void (async () => {
      setLoading(true)
      setFetchError(false)
      try {
        const { data, error } = await supabase.functions.invoke('get-reporte-data', {
          body: { ranges: ['xPP'] },
        })
        if (error || !data?.success) throw new Error(data?.error || 'Error')

        const xppRows: unknown[][] = data.ranges?.['xPP'] || []
        const xppStartRow: number = data.xppStartRow || 1

        const now = new Date()
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

        const result: PendingRow[] = []
        xppRows.forEach((row, i) => {
          if (cell(row, 26) !== 'POR PAGAR') return

          const fechaVencDate = parseSheetDate(row[25])
          if (!fechaVencDate || fechaVencDate > endOfMonth) return

          let highlight: 'red' | 'amber' | null = null
          if (fechaVencDate < now) highlight = 'red'
          else if (fechaVencDate <= sevenDaysOut) highlight = 'amber'

          result.push({
            proveedor: cell(row, 1),
            empresa: cell(row, 24),
            concepto: cell(row, 20),
            centroCosto: cell(row, 22),
            fechaVencimiento: fmtDate(fechaVencDate),
            fechaVencDate,
            importe: parseNum(row[6]),
            absoluteRowIndex: xppStartRow + i,
            highlight,
          })
        })

        result.sort((a, b) => {
          if (!a.fechaVencDate) return 1
          if (!b.fechaVencDate) return -1
          return a.fechaVencDate.getTime() - b.fechaVencDate.getTime()
        })

        setRows(result)
      } catch {
        setFetchError(true)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  /* ── Toast helper ─── */
  const toast = (message: string, type: 'success' | 'error') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }

  /* ── Approve ─── */
  const handleApprove = async (row: PendingRow) => {
    if (!session?.user?.id) return
    setProcessing(row.absoluteRowIndex)
    try {
      const { data, error } = await supabase.functions.invoke('update-xpp', {
        body: {
          action: 'approve',
          rowIndex: row.absoluteRowIndex,
          value: true,
          userId: session.user.id,
          userRole,
        },
      })
      if (error || !data?.success) throw new Error(data?.error || 'Error')
      setRemovedRows(prev => new Set(prev).add(row.absoluteRowIndex))
      toast('Factura aprobada', 'success')
      onApproved()
    } catch {
      toast('Error al aprobar — intenta de nuevo', 'error')
    } finally {
      setProcessing(null)
    }
  }

  /* ── Reject ─── */
  const handleReject = async () => {
    if (!rejectRow || !session?.user?.id || !rejectReason.trim()) return
    setProcessing(rejectRow.absoluteRowIndex)
    try {
      const { data, error } = await supabase.functions.invoke('update-xpp', {
        body: {
          action: 'reject',
          rowIndex: rejectRow.absoluteRowIndex,
          reason: rejectReason.trim(),
          userId: session.user.id,
          userRole,
        },
      })
      if (error || !data?.success) throw new Error(data?.error || 'Error')
      setRemovedRows(prev => new Set(prev).add(rejectRow.absoluteRowIndex))
      toast('Factura rechazada', 'success')
      setRejectRow(null)
      setRejectReason('')
      onApproved()
    } catch {
      toast('Error al rechazar — intenta de nuevo', 'error')
    } finally {
      setProcessing(null)
    }
  }

  const visible = rows.filter(r => !removedRows.has(r.absoluteRowIndex))
  const grandTotal = visible.reduce((s, r) => s + r.importe, 0)
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-CO')

  return (
    <>
      {/* ── Main modal backdrop ── */}
      <div
        ref={backdropRef}
        onClick={e => { if (e.target === backdropRef.current) onClose() }}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,25,40,0.55)',
          zIndex: 200,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '48px 24px',
          overflowY: 'auto',
        }}
      >
        <div style={{
          background: 'var(--hh-white)',
          borderRadius: 10,
          width: '100%',
          maxWidth: 960,
          boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 96px)',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px 16px',
            borderBottom: '1px solid rgba(122,145,165,0.15)',
            flexShrink: 0,
          }}>
            <div>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 300,
                fontSize: '1.0625rem', color: 'var(--hh-dark)', margin: 0,
              }}>
                Facturas Pendiente Aprobación
              </h2>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 300,
                fontSize: '0.8125rem', color: 'var(--hh-haze)', margin: '3px 0 0',
              }}>
                {loading ? 'Cargando…' : fetchError ? 'Error al cargar' : `${visible.length} facturas · ${fmt(grandTotal)}`}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--hh-haze)', padding: 4, borderRadius: 4, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--hh-dark)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--hh-haze)' }}
            >
              <Cross2Icon width={18} height={18} />
            </button>
          </div>

          {/* Body */}
          <div style={{ overflowY: 'auto', flexGrow: 1 }}>
            {loading ? (
              <div style={emptyStyle}>Cargando facturas…</div>
            ) : fetchError ? (
              <div style={emptyStyle}>No se pudo cargar la información.</div>
            ) : visible.length === 0 ? (
              <div style={emptyStyle}>No hay facturas pendientes para este mes.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--hh-white)', zIndex: 1 }}>
                  <tr style={{ borderBottom: '1px solid rgba(122,145,165,0.2)' }}>
                    <Th>Proveedor</Th>
                    <Th>Empresa</Th>
                    <Th>Concepto</Th>
                    <Th>Centro de costo</Th>
                    <Th right>Vencimiento</Th>
                    <Th right>Importe</Th>
                    <Th center>Acciones</Th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row, idx) => (
                    <tr
                      key={row.absoluteRowIndex}
                      style={{
                        background: idx % 2 === 1 ? 'var(--hh-ice)' : 'var(--hh-white)',
                        borderLeft: row.highlight === 'red'
                          ? '3px solid var(--hh-mango)'
                          : row.highlight === 'amber'
                            ? '3px solid var(--hh-lemon)'
                            : 'none',
                      }}
                    >
                      <Td>{row.proveedor || '—'}</Td>
                      <Td>{row.empresa || '—'}</Td>
                      <Td truncate>{row.concepto || '—'}</Td>
                      <Td truncate>{row.centroCosto || '—'}</Td>
                      <Td right overdue={row.highlight === 'red'}>{row.fechaVencimiento}</Td>
                      <Td right mono>{fmt(row.importe)}</Td>
                      <Td center>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <ActionBtn
                            onClick={() => void handleApprove(row)}
                            disabled={processing === row.absoluteRowIndex}
                            color="teal"
                            title="Aprobar"
                          >
                            <CheckIcon width={13} height={13} />
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => { setRejectRow(row); setRejectReason('') }}
                            disabled={processing === row.absoluteRowIndex}
                            color="mango"
                            title="Rechazar"
                          >
                            <Cross2Icon width={13} height={13} />
                          </ActionBtn>
                        </div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Reject sub-modal ── */}
      {rejectRow && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,25,40,0.7)',
          zIndex: 300,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: 'var(--hh-white)',
            borderRadius: 10,
            padding: 28,
            width: '100%',
            maxWidth: 440,
            boxShadow: '0 16px 48px rgba(0,0,0,0.28)',
          }}>
            <h3 style={{
              fontFamily: 'var(--font-display)', fontWeight: 300,
              fontSize: '1.0625rem', color: 'var(--hh-dark)', margin: '0 0 6px',
            }}>
              Rechazar factura
            </h3>
            <p style={{
              fontFamily: 'var(--font-body)', fontWeight: 300,
              fontSize: '0.8125rem', color: 'var(--hh-haze)', margin: '0 0 20px',
            }}>
              {rejectRow.proveedor} — {fmt(rejectRow.importe)}
            </p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="Motivo del rechazo"
              rows={4}
              style={{
                width: '100%',
                padding: '10px 14px',
                fontFamily: 'var(--font-body)',
                fontWeight: 300,
                fontSize: '0.875rem',
                color: 'var(--hh-dark)',
                border: '1px solid rgba(122,145,165,0.4)',
                borderRadius: 6,
                outline: 'none',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'var(--hh-teal)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(122,145,165,0.4)' }}
            />
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                onClick={() => setRejectRow(null)}
                disabled={processing !== null}
                style={{
                  fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '0.875rem',
                  padding: '8px 18px', borderRadius: 6,
                  background: 'transparent', border: '1px solid rgba(122,145,165,0.4)',
                  color: 'var(--hh-haze)', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleReject()}
                disabled={!rejectReason.trim() || processing !== null}
                style={{
                  fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '0.875rem',
                  padding: '8px 18px', borderRadius: 6,
                  background: 'var(--hh-mango)', border: 'none',
                  color: 'white', cursor: 'pointer',
                  opacity: !rejectReason.trim() || processing !== null ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                Confirmar rechazo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toasts ── */}
      <div style={{
        position: 'fixed', bottom: 24, right: 24,
        zIndex: 400,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            padding: '11px 20px',
            borderRadius: 8,
            background: t.type === 'success' ? 'var(--hh-teal)' : 'var(--hh-mango)',
            color: 'white',
            fontFamily: 'var(--font-body)',
            fontWeight: 400,
            fontSize: '0.875rem',
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          }}>
            {t.message}
          </div>
        ))}
      </div>
    </>
  )
}

/* ─── Table sub-components ───────────────────────────────── */

const thBase: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 500,
  fontSize: '0.6875rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--hh-haze)',
  padding: '11px 16px',
  whiteSpace: 'nowrap',
}

function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return (
    <th style={{ ...thBase, textAlign: center ? 'center' : right ? 'right' : 'left' }}>
      {children}
    </th>
  )
}

const tdBase: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontWeight: 400,
  fontSize: '0.875rem',
  color: 'var(--hh-dark)',
  padding: '10px 16px',
  borderBottom: '1px solid rgba(122,145,165,0.08)',
}

function Td({ children, right, center, truncate, mono, overdue }: {
  children: React.ReactNode
  right?: boolean
  center?: boolean
  truncate?: boolean
  mono?: boolean
  overdue?: boolean
}) {
  return (
    <td style={{
      ...tdBase,
      textAlign: center ? 'center' : right ? 'right' : 'left',
      whiteSpace: (right || mono) ? 'nowrap' : undefined,
      maxWidth: truncate ? 180 : undefined,
      overflow: truncate ? 'hidden' : undefined,
      textOverflow: truncate ? 'ellipsis' : undefined,
      fontVariantNumeric: mono ? 'tabular-nums' : undefined,
      color: overdue ? 'var(--hh-mango)' : tdBase.color,
    }}>
      {children}
    </td>
  )
}

function ActionBtn({ children, onClick, disabled, color, title }: {
  children: React.ReactNode
  onClick: () => void
  disabled: boolean
  color: 'teal' | 'mango'
  title: string
}) {
  const isTeal = color === 'teal'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        background: isTeal ? 'rgba(74,155,142,0.1)' : 'rgba(252,0,131,0.07)',
        border: `1px solid ${isTeal ? 'rgba(74,155,142,0.3)' : 'rgba(252,0,131,0.25)'}`,
        color: isTeal ? 'var(--hh-teal)' : 'var(--hh-mango)',
        borderRadius: 4,
        padding: '4px 8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        opacity: disabled ? 0.45 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {children}
    </button>
  )
}

const emptyStyle: React.CSSProperties = {
  padding: '48px 24px',
  textAlign: 'center',
  fontFamily: 'var(--font-display)',
  fontWeight: 300,
  fontStyle: 'italic',
  fontSize: '1rem',
  color: 'var(--hh-haze)',
}
