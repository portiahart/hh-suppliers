import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { SearchPage } from './pages/SearchPage'
import { SupplierProfile } from './pages/SupplierProfile'
import { NewSupplierFlow } from './pages/NewSupplierFlow'
import { SettingsPage } from './pages/SettingsPage'
import { ReportesBICPage } from './pages/ReportesBICPage'
import { IncompletosPage } from './pages/IncompletosPage'
import { CxPPage } from './pages/CxPPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<SearchPage />} />
            <Route path="/suppliers/:id" element={<SupplierProfile />} />
            <Route path="/new" element={<NewSupplierFlow />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/reportes-bic" element={<ReportesBICPage />} />
            <Route path="/incompletos/:category" element={<IncompletosPage />} />
            <Route path="/cxp" element={<CxPPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
