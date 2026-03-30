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
      fetchNamedRange('MAIN', accessToken),
      ...ENTITY_RANGES.map(e => fetchNamedRange(e.range, accessToken)),
    ])

    // Normalise a name for matching:
    // - lowercase, collapse whitespace
    // - strip dots from legal suffixes so "S.A.S." == "SAS", "LTDA." == "LTDA", etc.
    const normName = (s: string) =>
      s.trim().toLowerCase()
        .replace(/\s+/g, ' ')           // collapse whitespace
        .replace(/\b(s\.a\.s|s\.a|ltda|e\.u|s\.a\.s\.)\b\.?/g, m => m.replace(/\./g, ''))
        .replace(/\./g, '')             // strip any remaining dots (handles variations)
        .replace(/\s+/g, ' ')           // re-collapse after dot removal
        .trim()

    // MAIN column indices
    // 0  PROVEEDOR (name)
    // 1  NIT (9 digits)
    // 2  documento_tipo (NIT/CC/CE/…)
    // 3  nombre_operativo
    // 4  tipo_persona (JURIDICA / NATURAL)
    // 11 email
    // 12 telefono
    // 19 ACTIVE / INACTIVE
    // 40 categoria
    const strCell = (row: unknown[], idx: number): string | null => {
      const v = row[idx]
      if (v === null || v === undefined || String(v).trim() === '') return null
      return String(v).trim()
    }

    interface SupplierSheetRow {
      name: string
      nit: string | null
      documento_tipo: string | null
      nombre_operativo: string | null
      tipo_persona: string | null
      email: string | null
      telefono: string | null
      status: 'ACTIVE' | 'INACTIVE' | null
      categoria: string | null
    }

    const supplierRows: Array<SupplierSheetRow | null> = suppliersData.map(row => {
      const val = row[0]
      if (val === null || val === undefined || String(val).trim() === '') return null
      const rawNit = row[1]
      const nit = (rawNit !== null && rawNit !== undefined && String(rawNit).trim() !== '')
        ? String(rawNit).replace(/\D/g, '').trim() || null
        : null
      const VALID_DOC = new Set(['NIT','CC','CE','TI','TE','RC','PS','DE','NIT-E','NUIP'])
      const rawDoc = strCell(row, 2)?.toUpperCase() ?? ''
      const documento_tipo = VALID_DOC.has(rawDoc) ? rawDoc : null

      const rawTipo = strCell(row, 4)?.toUpperCase() ?? ''
      const tipo_persona: 'JURIDICA' | 'NATURAL' | null =
        rawTipo.includes('JURIDICA') || rawTipo === 'J' ? 'JURIDICA'
        : rawTipo.includes('NATURAL') || rawTipo === 'N' ? 'NATURAL'
        : null

      const rawStatus = strCell(row, 19)?.toUpperCase()
      const status: 'ACTIVE' | 'INACTIVE' | null =
        rawStatus === 'ACTIVE' ? 'ACTIVE' : rawStatus === 'INACTIVE' ? 'INACTIVE' : null

      return {
        name: String(val).trim(),
        nit,
        documento_tipo,
        nombre_operativo: strCell(row, 3),
        tipo_persona,
        email: strCell(row, 11),
        telefono: strCell(row, 12),
        status,
        categoria: strCell(row, 40),
      }
    })
    // Keep backward-compat alias used in the spend loop below
    const supplierNames = supplierRows.map(r => r?.name ?? null)

    /* ── 3. Bulk fetch accounts_suppliers → name→id map ─── */
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Paginate to get all rows (PostgREST max_rows caps single requests at 1000)
    type DbSupplier = { id: string; name: string; nit: string | null }
    const allSuppliers: DbSupplier[] = []
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('accounts_suppliers')
        .select('id, name, nit')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`Failed to fetch suppliers (page ${from}): ${error.message}`)
      if (!data || data.length === 0) break
      allSuppliers.push(...(data as DbSupplier[]))
      if (data.length < PAGE) break
    }
    const dbSuppliers = allSuppliers

    // Key: normName(name) → uuid
    const supplierMap = new Map<string, string>(
      dbSuppliers.map(s => [normName(s.name), s.id])
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

          const supplierId = supplierMap.get(normName(rawName))
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

    /* ── 4b. Sync accounts_suppliers fields from MAIN (sheet is master) ── */
    // Build de-duped map: normName → first matching SupplierSheetRow
    const sheetRowByName = new Map<string, SupplierSheetRow>()
    for (const row of supplierRows) {
      if (!row) continue
      const key = normName(row.name)
      if (!sheetRowByName.has(key)) sheetRowByName.set(key, row)
    }
    // Collect update payloads for every matched supplier
    const supplierUpdates: Array<Record<string, unknown>> = []
    const nitUpdateMap = new Map<string, string>() // supplierId → nit
    for (const [key, sheetRow] of sheetRowByName) {
      const supplierId = supplierMap.get(key)
      if (!supplierId) continue
      const payload: Record<string, unknown> = {
        id: supplierId,
        name: sheetRow.name,
        razon_social: sheetRow.name,
        documento_tipo: sheetRow.documento_tipo,
        nombre_operativo: sheetRow.nombre_operativo,
        tipo_persona: sheetRow.tipo_persona,
        email: sheetRow.email,
        telefono: sheetRow.telefono,
        categoria: sheetRow.categoria,
      }
      // Only include status when sheet explicitly sets it (NOT NULL constraint in DB)
      if (sheetRow.status !== null) payload.status = sheetRow.status
      supplierUpdates.push(payload)
      // NIT is handled separately (unique constraint — must detect conflicts)
      if (sheetRow.nit) nitUpdateMap.set(supplierId, sheetRow.nit)
    }
    // Update non-NIT fields in parallel batches
    const UPDATE_CONCURRENCY = 10
    for (let i = 0; i < supplierUpdates.length; i += UPDATE_CONCURRENCY) {
      const results = await Promise.all(
        supplierUpdates.slice(i, i + UPDATE_CONCURRENCY).map(({ id, ...fields }) =>
          supabase.from('accounts_suppliers').update(fields).eq('id', id as string)
        )
      )
      const failed = results.find(r => r.error)
      if (failed?.error) throw new Error(`Supplier update error: ${failed.error.message}`)
    }

    // Update NITs in parallel batches — catch unique constraint conflicts per-item
    const nitEntries = Array.from(nitUpdateMap.entries())
    const nitConflicts: string[] = []
    for (let i = 0; i < nitEntries.length; i += UPDATE_CONCURRENCY) {
      const results = await Promise.all(
        nitEntries.slice(i, i + UPDATE_CONCURRENCY).map(([supplierId, nit]) =>
          supabase.from('accounts_suppliers').update({ nit }).eq('id', supplierId)
            .then(r => ({ supplierId, nit, error: r.error }))
        )
      )
      for (const r of results) {
        if (r.error) nitConflicts.push(`${r.supplierId}: ${r.nit} — ${r.error.message}`)
      }
    }

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
        suppliersUpdated: supplierUpdates.length,
        nitConflicts,
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
