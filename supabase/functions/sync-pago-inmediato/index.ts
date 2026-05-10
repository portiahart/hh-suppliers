import { createClient } from 'npm:@supabase/supabase-js@2'

/* ─── CORS ───────────────────────────────────────────────────────────────── */

const ALLOWED_ORIGINS = new Set([
  'https://prov.portiahart.com',
  'http://localhost:5173',
])

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : '',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

/* ─── Google auth ────────────────────────────────────────────────────────── */

interface ServiceAccountCredentials {
  client_email: string
  private_key: string
  token_uri: string
}

async function getGoogleAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const expiry = now + 3600

  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: credentials.token_uri,
    iat: now,
    exp: expiry,
  }

  const encoder = new TextEncoder()
  const headerB64  = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const signatureInput = `${headerB64}.${payloadB64}`

  const pemContent = credentials.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')
  const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  )

  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(signatureInput))
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${signatureInput}.${signatureB64}`

  const tokenResponse = await fetch(credentials.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenResponse.json()
  if (!tokenData.access_token) throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`)
  return tokenData.access_token as string
}

/* ─── Sheets fetch ───────────────────────────────────────────────────────── */

const SPREADSHEET_ID = '1AFhvJXBJsfwbCVxyirJAJDIlRQDncPywfknkYl1h6O4'

async function fetchNamedRange(rangeName: string, accessToken: string): Promise<unknown[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(rangeName)}?valueRenderOption=UNFORMATTED_VALUE`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Sheets API error for ${rangeName} (${res.status}): ${body}`)
  }
  const data = await res.json()
  return (data.values ?? []) as unknown[][]
}

/* ─── Value helpers ──────────────────────────────────────────────────────── */

// Strip non-digits so "900.123.456-7" and "9001234567" both normalise to digits only.
function normalizeNit(raw: string | null): string | null {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  return digits.length >= 6 ? digits : null
}

// DATABASEOLD column indices (0-based, A=0)
// Col  1 (B)  : NIT
// Col 13 (N)  : Pago Inmediato (vs Por Pagar en transferencia o PSE)
//               Google Sheets checkbox → boolean true/false with UNFORMATTED_VALUE
//               May also appear as "SI", "X", "1", "TRUE", "YES"
const COL_NIT           = 1
const COL_PAGO_INMEDIATO = 13

function toBool(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw !== 0
  if (typeof raw === 'string') {
    const s = raw.trim().toUpperCase()
    return s === 'SI' || s === 'X' || s === '1' || s === 'TRUE' || s === 'YES'
  }
  return false
}

/* ─── Main handler ───────────────────────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) })

  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    const googleCredentialsJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!googleCredentialsJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON secret not configured')
    const credentials: ServiceAccountCredentials = JSON.parse(googleCredentialsJson)
    const accessToken = await getGoogleAccessToken(credentials)

    const rows = await fetchNamedRange('DATABASEOLD', accessToken)

    const records: { nit: string; pago_inmediato: boolean }[] = []

    for (const row of rows) {
      const rawNit = row[COL_NIT]
      const nit = normalizeNit(rawNit !== null && rawNit !== undefined ? String(rawNit) : null)
      if (!nit) continue  // skip header or rows without a valid NIT

      const rawVal = row[COL_PAGO_INMEDIATO]
      // Skip rows where the column is entirely absent (no data ever entered)
      if (rawVal === null || rawVal === undefined || String(rawVal).trim() === '') continue

      records.push({ nit, pago_inmediato: toBool(rawVal) })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let updated = 0
    let skipped = 0
    const errors: string[] = []

    for (const { nit, pago_inmediato } of records) {
      // Match both NIT-with-DV and NIT-without-DV stored in DB
      const nitFilters = [`nit.eq.${nit}`]
      if (nit.length === 9)  nitFilters.push(`nit.like.${nit}_`)
      if (nit.length === 10) nitFilters.push(`nit.eq.${nit.slice(0, 9)}`)

      const { data: matchData, error: matchErr } = await supabase
        .from('accounts_suppliers')
        .update({ pago_inmediato })
        .or(nitFilters.join(','))
        .select('id')

      if (matchErr) {
        errors.push(`NIT ${nit}: ${matchErr.message}`)
      } else if (!matchData || matchData.length === 0) {
        skipped++
      } else {
        updated += matchData.length
      }
    }

    return new Response(
      JSON.stringify({ success: true, total: records.length, updated, skipped, errors }),
      { headers },
    )
  } catch (err) {
    console.error('sync-pago-inmediato error:', err)
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers },
    )
  }
})
