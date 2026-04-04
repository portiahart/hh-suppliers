import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/LoginPage'
import { SearchPage } from './pages/SearchPage'
import { SupplierProfile } from './pages/SupplierProfile'
import { NewSupplierFlow } from './pages/NewSupplierFlow'
import { SettingsPage } from './pages/SettingsPage'

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
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
