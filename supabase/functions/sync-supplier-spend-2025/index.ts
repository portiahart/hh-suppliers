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

/* ─── Google auth — copied exactly from get-reporte-data ─────────────────── */

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
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    encoder.encode(signatureInput),
  )

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${signatureInput}.${signatureB64}`

  const tokenResponse = await fetch(credentials.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenResponse.json()
  if (!tokenData.access_token) {
    throw new Error(`Failed to get access token: ${JSON.stringify(tokenData)}`)
  }
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

/* ─── Value parsing ──────────────────────────────────────────────────────── */

// Parse a cell value: numbers come through as-is (UNFORMATTED_VALUE),
// blanks/errors/strings become 0. Always return a positive amount.
function parseAmount(cell: unknown): number {
  if (cell === null || cell === undefined || cell === '') return 0
  if (typeof cell === 'string') {
    if (cell.startsWith('#') || cell.trim() === '') return 0
    const n = parseFloat(cell)
    return isNaN(n) ? 0 : Math.abs(n)
  }
  if (typeof cell === 'number') return Math.abs(cell)
  return 0
}

/* ─── Upsert helpers ─────────────────────────────────────────────────────── */

interface SpendRow {
  supplier_id: string
  supplier_name_raw: string
  entity: string
  year: number
  month: number
  amount_cop: number
  source: string
}

const BATCH_SIZE = 500

async function upsertBatch(
  supabase: ReturnType<typeof createClient>,
  rows: SpendRow[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabase
      .from('suppliers_spend_monthly')
      .upsert(batch, { onConflict: 'supplier_id,entity,year,month' })
    if (error) throw new Error(`Upsert error: ${error.message}`)
  }
}

/* ─── Main handler ───────────────────────────────────────────────────────── */

const ENTITY_RANGES: Array<{ range: string; entity: string }> = [
  { range: 'BAFIVE', entity: 'BA' },
  { range: 'THFIVE', entity: 'TH' },
  { range: 'GAFIVE', entity: 'GA' },
  { range: 'PMFIVE', entity: 'PM' },
]

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) })
  }

  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    /* ── 1. Google auth ─────────────────────────────────── */
    const googleCredentialsJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!googleCredentialsJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON secret not configured')
    const credentials: ServiceAccountCredentials = JSON.parse(googleCredentialsJson)
    const accessToken = await getGoogleAccessToken(credentials)

    /* ── 2. Fetch Sheets data in parallel ───────────────── */
    const [suppliersData, ...entityData] = await Promise.all([
      fetchNamedRange('PROVNIT', accessToken),
      ...ENTITY_RANGES.map(e => fetchNamedRange(e.range, accessToken)),
    ])

    // SUPPLIERS has col 0 = name, col 1 = NIT
    interface SupplierSheetRow { name: string; nit: string | null }
    const supplierRows: Array<SupplierSheetRow | null> = suppliersData.map(row => {
      const val = row[0]
      if (val === null || val === undefined || String(val).trim() === '') return null
      const rawNit = row[1]
      const nit = (rawNit !== null && rawNit !== undefined && String(rawNit).trim() !== '')
        ? String(rawNit).replace(/\D/g, '').trim() || null
        : null
      return { name: String(val).trim(), nit }
    })
    // Keep backward-compat alias used in the loop below
    const supplierNames = supplierRows.map(r => r?.name ?? null)

    /* ── 3. Bulk fetch accounts_suppliers → name→id map ─── */
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: allSuppliers, error: supplierFetchError } = await supabase
      .from('accounts_suppliers')
      .select('id, name, nit')

    if (supplierFetchError) throw new Error(`Failed to fetch suppliers: ${supplierFetchError.message}`)

    type DbSupplier = { id: string; name: string; nit: string | null }
    const dbSuppliers = allSuppliers as DbSupplier[]

    // Key: lower(trim(name)) → uuid
    const supplierMap = new Map<string, string>(
      dbSuppliers.map(s => [s.name.trim().toLowerCase(), s.id])
    )
    // Track which db rows already have a NIT so we don't overwrite them
    const dbNitById = new Map<string, string | null>(
      dbSuppliers.map(s => [s.id, s.nit])
    )

    /* ── 4. Build upsert rows ───────────────────────────── */
    const toUpsert: SpendRow[] = []
    const unmatchedSet = new Set<string>()
    let skipped = 0

    for (let eIdx = 0; eIdx < ENTITY_RANGES.length; eIdx++) {
      const { entity } = ENTITY_RANGES[eIdx]
      const entityRows = entityData[eIdx]

      for (let rowIdx = 0; rowIdx < supplierNames.length; rowIdx++) {
        const rawName = supplierNames[rowIdx]

        // Skip blank rows and internal (X -) entries
        if (!rawName) { skipped++; continue }
        if (rawName.startsWith('X -')) { skipped++; continue }

        const sheetRow = entityRows[rowIdx] ?? []

        // 12 months — columns 0–11
        for (let col = 0; col < 12; col++) {
          const amount = parseAmount(sheetRow[col])
          if (amount === 0) continue

          const month = col + 1 // 1-indexed

          const supplierId = supplierMap.get(rawName.toLowerCase())
          if (!supplierId) {
            unmatchedSet.add(rawName)
            continue
          }

          toUpsert.push({
            supplier_id: supplierId,
            supplier_name_raw: rawName,
            entity,
            year: 2025,
            month,
            amount_cop: amount,
            source: 'live',
          })
        }
      }
    }

    /* ── 4b. Backfill NIT on accounts_suppliers where null ──── */
    // Build a unique name→nit map from the sheet (first non-null NIT wins)
    const sheetNitByName = new Map<string, string>()
    for (const row of supplierRows) {
      if (!row || !row.nit) continue
      const key = row.name.toLowerCase()
      if (!sheetNitByName.has(key)) sheetNitByName.set(key, row.nit)
    }
    // Collect supplier IDs that have a sheet NIT but no db NIT
    const nitUpdates: Array<{ id: string; nit: string }> = []
    for (const [nameLower, sheetNit] of sheetNitByName) {
      const supplierId = supplierMap.get(nameLower)
      if (!supplierId) continue
      if (dbNitById.get(supplierId)) continue // already has one
      nitUpdates.push({ id: supplierId, nit: sheetNit })
    }
    // Update in parallel (typically small set)
    await Promise.all(
      nitUpdates.map(({ id, nit }) =>
        supabase.from('accounts_suppliers').update({ nit }).eq('id', id).is('nit', null)
      )
    )

    /* ── 5. Deduplicate by (supplier_id, entity, year, month) ─
          The same supplier name can appear on multiple rows in the
          SUPPLIERS sheet. Collapse those into one row by summing. */
    const dedupeMap = new Map<string, SpendRow>()
    for (const row of toUpsert) {
      const key = `${row.supplier_id}|${row.entity}|${row.year}|${row.month}`
      const existing = dedupeMap.get(key)
      if (existing) {
        existing.amount_cop += row.amount_cop
      } else {
        dedupeMap.set(key, { ...row })
      }
    }
    const deduped = Array.from(dedupeMap.values())

    /* ── 6. Upsert in batches ───────────────────────────── */
    await upsertBatch(supabase, deduped)

    return new Response(
      JSON.stringify({
        synced: deduped.length,
        skipped,
        nitsUpdated: nitUpdates.length,
        unmatched: Array.from(unmatchedSet).sort(),
      }),
      { headers },
    )
  } catch (err) {
    console.error('sync-supplier-spend-2025 error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers })
  }
})
