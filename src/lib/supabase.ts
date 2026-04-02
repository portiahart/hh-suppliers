import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Targeted fetch wrapper — adds a timeout ONLY to Supabase Auth requests.
// Without this, an expired token + slow/unreachable auth server causes
// _initialize() to hang indefinitely, blocking all Supabase operations.
const AUTH_TIMEOUT_MS = 5_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input
    : input instanceof URL ? input.href
    : (input as Request).url;

  if (!url.includes('/auth/v1/')) {
    return fetch(input as RequestInfo, init);
  }

  let ourTimerFired = false;
  const controller = new AbortController();
  const id = setTimeout(() => { ourTimerFired = true; controller.abort(); }, AUTH_TIMEOUT_MS);
  const existingSignal = init?.signal as AbortSignal | undefined;
  if (existingSignal) {
    if (existingSignal.aborted) {
      controller.abort();
    } else {
      existingSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  return fetch(input as RequestInfo, { ...init, signal: controller.signal })
    .catch(err => {
      if (ourTimerFired && err.name === 'AbortError') {
        return new Response('{"message":"Auth request timed out"}', {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw err;
    })
    .finally(() => clearTimeout(id));
}

console.log('[supabase-client] sb-* cookies:', document.cookie.split(';').filter(c => c.trim().startsWith('sb-')).map(c => c.trim().split('=')[0]));

export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  cookieOptions: {
    domain: '.portiahart.com',
    path: '/',
    sameSite: 'lax',
    secure: true,
  },
  global: {
    fetch: fetchWithTimeout,
  },
})

// Initialization watchdog — if INITIAL_SESSION never fires within 10s,
// clear stale cookies and reload so the user sees a fresh login page.
const WATCHDOG_MS = 10_000;
const _initWatchdog = setTimeout(() => {
  console.warn('[supabase-client] watchdog fired — clearing cookies and reloading');
  try {
    document.cookie.split(';').forEach(c => {
      const key = c.trim().split('=')[0];
      if (key.startsWith('sb-')) {
        document.cookie = `${key}=; Domain=.portiahart.com; Path=/; Max-Age=0; Secure; SameSite=Lax`;
        document.cookie = `${key}=; Path=/; Max-Age=0`;
      }
    });
    localStorage.removeItem('hh-user');
  } catch { /* ignore */ }
  window.location.reload();
}, WATCHDOG_MS);

supabase.auth.onAuthStateChange((event) => {
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
    clearTimeout(_initWatchdog);
  }
})

// Pre-filtered query builder for accounts_suppliers.
// Excludes internal staff entries whose name starts with "X -".
export function suppliersQuery(select = '*') {
  return supabase
    .from('accounts_suppliers')
    .select(select)
    .not('name', 'ilike', 'X -%')
}
