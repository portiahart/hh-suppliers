import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from '@radix-ui/react-icons'

export function NewSupplierFlow() {
  const navigate = useNavigate()

  return (
    <div>
      <button
        onClick={() => navigate('/')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'transparent',
          border: 'none',
          color: 'var(--hh-haze)',
          fontFamily: 'var(--font-body)',
          fontSize: '0.875rem',
          cursor: 'pointer',
          padding: 0,
          marginBottom: 32,
        }}
      >
        <ArrowLeftIcon width={16} height={16} />
        Volver
      </button>

      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 300,
          fontStyle: 'italic',
          fontSize: '1.5rem',
          color: 'var(--hh-haze)',
        }}
      >
        Coming soon
      </p>
      <p style={{ color: 'var(--hh-haze)', fontSize: '0.8125rem' }}>Nuevo Proveedor</p>
    </div>
  )
}
