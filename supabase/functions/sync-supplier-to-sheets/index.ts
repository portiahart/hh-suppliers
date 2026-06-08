/**
 * sync-supplier-to-sheets
 *
 * Called by a Supabase database webhook on every INSERT / UPDATE of
 * accounts_suppliers. Mirrors the row to the "supabase-masterlist" tab
 * in the configured Google Sheet.
 *
 * Also accepts { type: "FULL_SYNC" } to reseed the whole sheet.
 *
 * Required env secrets (already present on this project):
 *   GOOGLE_SERVICE_ACCOUNT_JSON — service account JSON (needs Sheets write scope)
 *   SUPABASE_URL                — injected automatically by Supabase
 *   SUPABASE_SERVICE_ROLE_KEY   — injected automatically by Supabase
 *
 * The service account must be shared as Editor on the spreadsheet.
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

/* ─── Sheet config ───────────────────────────────────────────────────────── */

const SPREADSHEET_ID = '1AFhvJXBJsfwbCVxyirJAJDIlRQDncPywfknkYl1h6O4'
const SHEET_NAME     = 'supabase-masterlist'

// Column order written to the sheet. Any keys in the DB row that are NOT in
// this list are appended alphabetically so no data is silently dropped.
const KNOWN_COLS = [
  'id',
  'razon_social',
  'nombre_operativo',
  'nit',
  'documento_tipo',
  'tipo_persona',
  'email',
  'telefono',
  'categoria',
  'status',
  'created_at',
  'updated_at',
]

/* ─── Google auth (write scope) ──────────────────────────────────────────── */

async function getGoogleAccessToken(): Promise<string> {
  const credsJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
  if (!credsJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set')
  const creds = JSON.parse(credsJson) as {
    client_email: string
    private_key: string
    token_uri: string
  }

  const now  = Math.floor(Date.now() / 1000)
  const enc  = (o: object) =>
    btoa(JSON.stringify(o)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const signInput = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss:   creds.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   creds.token_uri,
    iat:   now,
    exp:   now + 3600,
  })}`

  const pemContent = creds.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '')

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    Uint8Array.from(atob(pemContent), c => c.charCodeAt(0)),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signInput),
  )
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const tokenRes = await fetch(creds.token_uri, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signInput}.${sigB64}`,
  })
  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) throw new Error(`Google auth failed: ${JSON.stringify(tokenData)}`)
  return tokenData.access_token as string
}

/* ─── Header derivation ──────────────────────────────────────────────────── */

function deriveHeaders(sampleRow: Record<string, unknown>): string[] {
  const all   = Object.keys(sampleRow)
  const known = KNOWN_COLS.filter(c => all.includes(c))
  const extra = all.filter(c => !KNOWN_COLS.includes(c)).sort()
  return [...known, ...extra]
}


function rowValues(headers: string[], row: Record<string, unknown>): string[] {
  return headers.map(h => {
    const v = row[h]
    return v == null ? '' : String(v)
  })
}

/* ─── Sheets helpers ─────────────────────────────────────────────────────── */

const sheetsBase = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`

async function sheetsGet(range: string, token: string): Promise<string[][]> {
  const res = await fetch(
    `${sheetsBase}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`Sheets GET ${range}: ${await res.text()}`)
  return ((await res.json()).values ?? []) as string[][]
}

async function sheetsPut(range: string, values: string[][], token: string): Promise<void> {
  const res = await fetch(
    `${sheetsBase}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    {
      method:  'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ values }),
    },
  )
  if (!res.ok) throw new Error(`Sheets PUT ${range}: ${await res.text()}`)
}

async function sheetsAppend(values: string[][], token: string): Promise<void> {
  const res = await fetch(
    `${sheetsBase}/values/${encodeURIComponent(`${SHEET_NAME}!A1`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ values }),
    },
  )
  if (!res.ok) throw new Error(`Sheets append: ${await res.text()}`)
}

async function sheetsClear(range: string, token: string): Promise<void> {
  const res = await fetch(
    `${sheetsBase}/values/${encodeURIComponent(range)}:clear`,
    {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    },
  )
  if (!res.ok) throw new Error(`Sheets clear ${range}: ${await res.text()}`)
}

/* ─── Header / row-lookup helpers ────────────────────────────────────────── */

// Returns current headers from row 1, or empty array if sheet is blank.
async function readHeaders(token: string): Promise<string[]> {
  const vals = await sheetsGet(`${SHEET_NAME}!1:1`, token)
  return (vals[0] ?? []).map(String)
}

// Returns 1-based row number of the row whose column-A value matches `id`,
// or null if not found.
async function findRowById(id: string, token: string): Promise<number | null> {
  const vals = await sheetsGet(`${SHEET_NAME}!A:A`, token)
  for (let i = 1; i < vals.length; i++) {  // skip header row (i=0)
    if (vals[i]?.[0] === id) return i + 1  // 1-indexed
  }
  return null
}

/* ─── Handlers ───────────────────────────────────────────────────────────── */

async function handleFullSync(token: string): Promise<{ synced: number }> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Paginate in batches of 1000 to bypass Supabase's default row limit
  const PAGE = 1000
  const allData: Record<string, unknown>[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('accounts_suppliers')
      .select('*')
      .not('razon_social', 'ilike', 'X -%')
      .is('archived_at', null)
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw new Error(`Supabase error: ${error.message}`)
    if (!data || data.length === 0) break
    allData.push(...(data as Record<string, unknown>[]))
    if (data.length < PAGE) break
    from += PAGE
  }

  const data = allData

  const existingHeaders = await readHeaders(token)
  const headers = existingHeaders.length > 0
    ? existingHeaders
    : deriveHeaders(data[0] as Record<string, unknown>)

  // Only write headers when the sheet is blank (first-time setup).
  // Row 1 may be protected — managing headers is the owner's responsibility.
  if (existingHeaders.length === 0) {
    await sheetsPut(`${SHEET_NAME}!A1`, [headers], token)
  }

  // Pad every row to PAD_COLS wide so that extra columns written by previous
  // syncs are overwritten with empty strings rather than left behind.
  // Avoids sheetsClear which may conflict with sheet protection settings.
  const PAD_COLS = Math.max(headers.length + 20, 50)
  const rows = data.map(r => {
    const vals = rowValues(headers, r as Record<string, unknown>)
    while (vals.length < PAD_COLS) vals.push('')
    return vals
  })

  if (allData.length === 0) return { synced: 0 }

  await sheetsPut(`${SHEET_NAME}!A2`, rows, token)

  return { synced: rows.length }
}

async function handleInsert(record: Record<string, unknown>, token: string): Promise<void> {
  const existingHeaders = await readHeaders(token)

  if (existingHeaders.length === 0) {
    // Sheet is blank — write header + row
    const headers = deriveHeaders(record)
    await sheetsPut(`${SHEET_NAME}!A1`, [headers], token)
    await sheetsAppend([rowValues(headers, record)], token)
    return
  }

  await sheetsAppend([rowValues(existingHeaders, record)], token)
}

async function handleUpdate(record: Record<string, unknown>, token: string): Promise<void> {
  const existingHeaders = await readHeaders(token)

  if (existingHeaders.length === 0) {
    // No headers yet — treat as insert
    await handleInsert(record, token)
    return
  }

  const id  = String(record['id'] ?? '')
  const row = await findRowById(id, token)

  if (row) {
    await sheetsPut(`${SHEET_NAME}!A${row}`, [rowValues(existingHeaders, record)], token)
  } else {
    await sheetsAppend([rowValues(existingHeaders, record)], token)
  }
}

/* ─── Entry point ────────────────────────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    const payload = await req.json() as {
      type:       string
      record?:    Record<string, unknown>
      old_record?: Record<string, unknown>
    }

    const token = await getGoogleAccessToken()

    if (payload.type === 'FULL_SYNC') {
      const result = await handleFullSync(token)
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!payload.record) {
      return new Response(JSON.stringify({ error: 'No record in payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (payload.type === 'INSERT') {
      await handleInsert(payload.record, token)
    } else if (payload.type === 'UPDATE') {
      await handleUpdate(payload.record, token)
    }

    return new Response(JSON.stringify({ ok: true, type: payload.type }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('sync-supplier-to-sheets error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status:  500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
