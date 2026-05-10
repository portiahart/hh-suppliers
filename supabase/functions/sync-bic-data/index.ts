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

function strCell(row: unknown[], idx: number): string | null {
  const v = row[idx]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

// Strip non-digits so "900.123.456-7" and "9001234567" both normalise to digits only.
function normalizeNit(raw: string | null): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  return digits.length >= 6 ? digits : null
}

// DATABASEOLD column indices (0-based, A=0)
// Col  0 (A)  : Proveedor name
// Col  1 (B)  : NIT
// Col 39 (AN) : Internal survey score (Pass > 60%)
// Col 40 (AO) : Ubicacion
// Col 41 (AP) : Producto / Servicio / Categoria
// Col 42 (AQ) : Physical goods
// Col 43 (AR) : Independent Supplier
// Col 44 (AS) : Underserved Supplier
// Col 45 (AT) : Menos de 50 empleados?
// Col 46 (AU) : Empresa de personas minoritarias

const COL_NIT          = 1
const COL_CIUDAD       = 8   // column I
const COL_PAIS         = 10  // column K
const COL_SURVEY_SCORE = 39  // column AN
const COL_UBICACION    = 40  // column AO
const COL_CATEGORIA    = 41  // column AP
const COL_PHYSICAL     = 42  // column AQ
const COL_INDEPENDENT  = 43  // column AR
const COL_UNDERSERVED  = 44  // column AS
const COL_SMALL        = 45  // column AT
const COL_MINORIA      = 46  // column AU

interface BicRecord {
  nit: string
  bic_ciudad: string | null
  bic_pais: string | null
  bic_survey_score: string | null
  bic_ubicacion: string | null
  bic_categoria: string | null
  bic_physical_goods: string | null
  bic_independent: string | null
  bic_underserved: string | null
  bic_small_company: string | null
  bic_minoria: string | null
  bic_synced_at: string
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

    const syncedAt = new Date().toISOString()
    const records: BicRecord[] = []

    for (const row of rows) {
      const rawNit = strCell(row, COL_NIT)
      const nit = normalizeNit(rawNit)
      // Skip header row or rows without a valid NIT
      if (!nit) continue

      records.push({
        nit,
        bic_ciudad:        strCell(row, COL_CIUDAD),
        bic_pais:          strCell(row, COL_PAIS),
        bic_survey_score:  strCell(row, COL_SURVEY_SCORE),
        bic_ubicacion:     strCell(row, COL_UBICACION),
        bic_categoria:     strCell(row, COL_CATEGORIA),
        bic_physical_goods: strCell(row, COL_PHYSICAL),
        bic_independent:   strCell(row, COL_INDEPENDENT),
        bic_underserved:   strCell(row, COL_UNDERSERVED),
        bic_small_company: strCell(row, COL_SMALL),
        bic_minoria:       strCell(row, COL_MINORIA),
        bic_synced_at:     syncedAt,
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    let updated = 0
    let skipped = 0
    const errors: string[] = []

    for (const rec of records) {
      const { nit, ...payload } = rec

      // Colombian NITs: Supabase may store NIT+DV (e.g. "9003462901") while the
      // sheet stores NIT without DV (e.g. "900346290"). Match both formats.
      const nitFilters = [`nit.eq.${nit}`]
      if (nit.length === 9) nitFilters.push(`nit.like.${nit}_`)        // match NIT+anyDV stored in DB
      if (nit.length === 10) nitFilters.push(`nit.eq.${nit.slice(0, 9)}`) // match NIT-without-DV stored in DB

      const { data: matchData, error: matchErr } = await supabase
        .from('accounts_suppliers')
        .update(payload)
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
    console.error('sync-bic-data error:', err)
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers },
    )
  }
})
