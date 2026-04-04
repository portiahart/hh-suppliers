import { createServerClient } from '@supabase/ssr'

export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405 })
  }

  let email: string, password: string
  try {
    const body = await req.json()
    email = body.email
    password = body.password
  } catch {
    return new Response(JSON.stringify({ error: 'invalid body' }), { status: 400 })
  }

  const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = []

  const supabase = createServerClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.VITE_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => [],
        setAll: (list) => list.forEach(c => cookiesToSet.push(c)),
      },
    }
  )

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    console.error('[api/auth/login] signInWithPassword error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const headers = new Headers({ 'Content-Type': 'application/json' })
  for (const { name, value, options } of cookiesToSet) {
    headers.append('Set-Cookie', buildCookie(name, value, {
      ...options,
      domain: '.portiahart.com',
      path: '/',
      sameSite: 'lax',
      secure: true,
    }))
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}

function buildCookie(name: string, value: string, opts: Record<string, unknown>): string {
  let str = `${name}=${encodeURIComponent(value)}`
  if (opts.domain)   str += `; Domain=${opts.domain}`
  if (opts.path)     str += `; Path=${opts.path}`
  if (opts.maxAge !== undefined) str += `; Max-Age=${opts.maxAge}`
  if (opts.httpOnly) str += '; HttpOnly'
  if (opts.secure)   str += '; Secure'
  if (opts.sameSite) {
    const s = String(opts.sameSite)
    str += `; SameSite=${s.charAt(0).toUpperCase() + s.slice(1)}`
  }
  return str
}
