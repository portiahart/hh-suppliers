import { createClient } from 'npm:@supabase/supabase-js@2'

/* ─── Google auth ─────────────────────────────────────────────────────────── */

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
    .replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\n/g, '')
  const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
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
  if (!tokenData.access_token) throw new Error(`Failed to get Google token: ${JSON.stringify(tokenData)}`)
  return tokenData.access_token as string
}

/* ─── Sheets fetch ────────────────────────────────────────────────────────── */

const SPREADSHEET_ID = '1AFhvJXBJsfwbCVxyirJAJDIlRQDncPywfknkYl1h6O4'

async function fetchNamedRange(rangeName: string, accessToken: string): Promise<unknown[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(rangeName)}?valueRenderOption=UNFORMATTED_VALUE`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Sheets API error for ${rangeName} (${res.status}): ${await res.text()}`)
  const data = await res.json()
  return (data.values ?? []) as unknown[][]
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

const normalizeNit = (v: unknown) => String(v ?? '').replace(/\D/g, '')

const normTipoCuenta = (v: string | null): string | null => {
  if (!v) return null
  const u = v.toUpperCase()
  if (u.includes('AHORRO')) return 'Ahorros'
  if (u.includes('CORRIENTE')) return 'Corriente'
  return null
}

/* ─── Main ────────────────────────────────────────────────────────────────── */

Deno.serve(async () => {
  try {
    const googleCredentialsJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!googleCredentialsJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')
    const credentials: ServiceAccountCredentials = JSON.parse(googleCredentialsJson)
    const accessToken = await getGoogleAccessToken(credentials)

    const [nitRows, mainRows] = await Promise.all([
      fetchNamedRange('NIT', accessToken),
      fetchNamedRange('MAIN', accessToken),
    ])

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch all suppliers with a NIT
    const { data: suppliers, error: suppErr } = await supabase
      .from('accounts_suppliers')
      .select('id, nit')
      .not('nit', 'is', null)
    if (suppErr) throw new Error(`Failed to fetch suppliers: ${suppErr.message}`)

    // Build NIT→row-index map from the sheet (skip header row 0)
    const nitToRowIdx = new Map<string, number>()
    for (let i = 1; i < nitRows.length; i++) {
      const n = normalizeNit((nitRows[i] as unknown[])[0])
      if (n) nitToRowIdx.set(n, i)
    }

    const cell = (row: unknown[], i: number): string | null => {
      const v = row[i]
      return typeof v === 'string' && v.trim() ? v.trim() : null
    }

    const upserts: Record<string, unknown>[] = []
    let matched = 0, unmatched = 0

    for (const supplier of suppliers ?? []) {
      const n = normalizeNit(supplier.nit)
      const rowIdx = nitToRowIdx.get(n)
      if (rowIdx === undefined) { unmatched++; continue }
      const row = mainRows[rowIdx] as unknown[] | undefined
      if (!row) { unmatched++; continue }
      matched++
      upserts.push({
        supplier_id:                supplier.id,
        nombre_beneficiario:        cell(row, 14), // col O
        numero_cuenta:              cell(row, 15), // col P
        tipo_cuenta:                normTipoCuenta(cell(row, 16)), // col Q
        banco:                      cell(row, 17), // col R
        tipo_documento_bancolombia: cell(row, 18), // col S
        updated_at:                 new Date().toISOString(),
      })
    }

    // Upsert in batches
    const BATCH = 200
    let upserted = 0
    for (let i = 0; i < upserts.length; i += BATCH) {
      const batch = upserts.slice(i, i + BATCH)
      const { error } = await supabase
        .from('suppliers_banking')
        .upsert(batch, { onConflict: 'supplier_id' })
      if (error) throw new Error(`Upsert error: ${error.message}`)
      upserted += batch.length
    }

    return new Response(
      JSON.stringify({ success: true, matched, unmatched, upserted }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
