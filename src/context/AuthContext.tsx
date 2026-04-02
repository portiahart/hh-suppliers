import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthContextValue {
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({ session: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // IMPORTANT: This callback must NOT await any Supabase operation directly.
    //
    // _notifyAllSubscribers() (in auth-js) does `await Promise.all(callbacks)`.
    // If SIGNED_IN fires during _initialize() (e.g. SSO cookie present), calling
    // getSession() or supabase.from() inside the callback deadlocks:
    //
    //   _initialize() → _notifyAllSubscribers('SIGNED_IN')
    //     → awaits this callback
    //       → any supabase call → getSession() → await initializePromise
    //                                                  ↑ waiting for _initialize() → ∞
    //
    // This callback only calls React state setters (synchronous), so it's safe.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthContext] event:', event, '| user:', session?.user?.email ?? null, '| exp:', session?.expires_at ?? null);
      if (event === 'INITIAL_SESSION') {
        setSession(session)
        setLoading(false)
      } else if (event === 'SIGNED_IN') {
        setSession(session)
        setLoading(false)
      } else if (event === 'SIGNED_OUT') {
        setSession(null)
        setLoading(false)
      } else if (event === 'TOKEN_REFRESHED') {
        setSession(session)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider value={{ session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
