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

/* ─── Google auth (full read/write scope) ────────────────────────────────── */

interface ServiceAccountCredentials {
  client_email: string
  private_key: string
  token_uri: string
}

async function getGoogleAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header  = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss:   credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets', // full write scope
    aud:   credentials.token_uri,
    iat:   now,
    exp:   now + 3600,
  }

  const encoder = new TextEncoder()
  const b64 = (s: string) => btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const headerB64  = b64(JSON.stringify(header))
  const payloadB64 = b64(JSON.stringify(payload))
  const sigInput   = `${headerB64}.${payloadB64}`

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
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(sigInput))
  const jwt = `${sigInput}.${b64(String.fromCharCode(...new Uint8Array(sig)))}`

  const tokenRes = await fetch(credentials.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) throw new Error(`Google auth failed: ${JSON.stringify(tokenData)}`)
  return tokenData.access_token as string
}

/* ─── Sheet write-back ───────────────────────────────────────────────────── */

const SPREADSHEET_ID = '1sTJ6a5o91XmqSPq8kkkUZWsyldEL0xtPa0TNHZLFDQI'

async function writeAprobadoToSheet(accessToken: string, sheetRowNum: number): Promise<void> {
  // Column AB = column 28 (1-based). Range: 'CxP'!AB{row}
  const range = encodeURIComponent(`CxP!AB${sheetRowNum}`)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?valueInputOption=USER_ENTERED`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [['SI']] }),
  })
  if (!res.ok) throw new Error(`Sheets write error (${res.status}): ${await res.text()}`)
}

/* ─── Handler ────────────────────────────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) })

  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    const body = await req.json()
    const { id } = body as { id?: string }
    if (!id) {
      return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch the row to get sheet_row_num before updating
    const { data: row, error: fetchErr } = await supabase
      .from('cxp_facturas')
      .select('sheet_row_num')
      .eq('id', id)
      .single()

    if (fetchErr || !row) {
      return new Response(JSON.stringify({ error: 'Row not found' }), { status: 404, headers })
    }

    // Update Supabase
    const { error: updateErr } = await supabase
      .from('cxp_facturas')
      .update({ aprobado: 'SI' })
      .eq('id', id)

    if (updateErr) throw new Error(`Supabase update failed: ${updateErr.message}`)

    // Write back to sheet if we have a row number
    if (row.sheet_row_num) {
      const credJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
      if (credJson) {
        const credentials: ServiceAccountCredentials = JSON.parse(credJson)
        const accessToken = await getGoogleAccessToken(credentials)
        await writeAprobadoToSheet(accessToken, row.sheet_row_num)
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers })

  } catch (err) {
    console.error('approve-cxp error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers },
    )
  }
})
