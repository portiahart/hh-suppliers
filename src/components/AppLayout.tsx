import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main
        style={{
          marginLeft: 220,
          flex: 1,
          background: 'var(--hh-ice)',
          minHeight: '100vh',
          padding: '40px 48px',
        }}
      >
        <Outlet />
      </main>
    </div>
  )
}
