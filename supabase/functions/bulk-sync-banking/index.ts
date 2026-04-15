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

    // Only need MAIN — NIT is at column index 1, banking data at O-S (14-18)
    const mainRows = await fetchNamedRange('MAIN', accessToken)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Fetch all suppliers that have a NIT, paginated
    type DbSupplier = { id: string; nit: string }
    const allSuppliers: DbSupplier[] = []
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('accounts_suppliers')
        .select('id, nit')
        .not('nit', 'is', null)
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`Failed to fetch suppliers: ${error.message}`)
      if (!data || data.length === 0) break
      allSuppliers.push(...(data as DbSupplier[]))
      if (data.length < PAGE) break
    }

    // Build NIT→banking-data map directly from MAIN col 1 (skip header row 0)
    const cell = (row: unknown[], i: number): string | null => {
      const v = row[i]
      return typeof v === 'string' && v.trim() ? v.trim() : (typeof v === 'number' ? String(v) : null)
    }

    const nitToData = new Map<string, Record<string, string | null>>()
    for (let i = 1; i < mainRows.length; i++) {
      const row = mainRows[i] as unknown[]
      const nit = normalizeNit(row[1])
      if (!nit) continue
      // Only record first occurrence per NIT
      if (!nitToData.has(nit)) {
        nitToData.set(nit, {
          nombre_beneficiario:        cell(row, 14),
          numero_cuenta:              cell(row, 15),
          tipo_cuenta:                normTipoCuenta(cell(row, 16)),
          banco:                      cell(row, 17),
          tipo_documento_bancolombia: cell(row, 18),
        })
      }
    }

    // Build inserts for matched suppliers
    const inserts: Record<string, unknown>[] = []
    let matched = 0, unmatched = 0

    for (const supplier of allSuppliers) {
      const n = normalizeNit(supplier.nit)
      const bankData = nitToData.get(n)
      if (!bankData) { unmatched++; continue }
      matched++
      inserts.push({
        supplier_id: supplier.id,
        ...bankData,
        updated_at: new Date().toISOString(),
      })
    }

    // Delete all existing rows then re-insert (avoids unique-constraint dependency)
    const supplierIds = inserts.map(r => r.supplier_id as string)
    if (supplierIds.length > 0) {
      // Delete in chunks to stay within URL length limits
      const DEL_CHUNK = 500
      for (let i = 0; i < supplierIds.length; i += DEL_CHUNK) {
        const chunk = supplierIds.slice(i, i + DEL_CHUNK)
        const { error } = await supabase
          .from('suppliers_banking')
          .delete()
          .in('supplier_id', chunk)
        if (error) throw new Error(`Delete error: ${error.message}`)
      }
    }

    // Insert in batches
    const BATCH = 200
    let inserted = 0
    for (let i = 0; i < inserts.length; i += BATCH) {
      const batch = inserts.slice(i, i + BATCH)
      const { error } = await supabase
        .from('suppliers_banking')
        .insert(batch)
      if (error) throw new Error(`Insert error: ${error.message}`)
      inserted += batch.length
    }

    return new Response(
      JSON.stringify({ success: true, matched, unmatched, inserted }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
