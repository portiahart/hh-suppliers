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

async function getGoogleAccessToken(
  credentials: ServiceAccountCredentials,
  scope = 'https://www.googleapis.com/auth/spreadsheets.readonly',
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: credentials.client_email,
    scope,
    aud: credentials.token_uri,
    iat: now,
    exp: now + 3600,
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

/* ─── Sheets helpers ─────────────────────────────────────────────────────── */

const SPREADSHEET_ID = '1sTJ6a5o91XmqSPq8kkkUZWsyldEL0xtPa0TNHZLFDQI'
const RANGE_NAME     = 'xPP'

async function getNamedRangeStartRow(accessToken: string): Promise<number> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=namedRanges`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Sheets metadata error (${res.status}): ${await res.text()}`)
  const data = await res.json()
  // deno-lint-ignore no-explicit-any
  const nr = (data.namedRanges as any[])?.find((n) => n.name === RANGE_NAME)
  if (!nr) throw new Error(`Named range '${RANGE_NAME}' not found`)
  return nr.range.startRowIndex as number // 0-based
}

async function fetchRange(accessToken: string): Promise<unknown[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(RANGE_NAME)}?valueRenderOption=UNFORMATTED_VALUE`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) throw new Error(`Sheets fetch error (${res.status}): ${await res.text()}`)
  const data = await res.json()
  return (data.values ?? []) as unknown[][]
}

/* ─── Column positions (from import script, 0-based) ────────────────────── */

const C = {
  fecha_pago:       0,
  proveedor_a:      1,
  dcto:             3,
  valor_total:      6,
  metodo_pago:      8,
  no_factura:       9,
  fecha_factura:   10,
  monto_base:      11,
  iva_19:          12,
  ipc:             13,
  tasa_retefuente: 14,
  retefuente:      15,
  tasa_reteica:    16,
  reteica:         17,
  proveedor:       18,
  nit:             19,
  concepto:        20,
  tipo_egreso:     21,
  centro_costo:    22,
  tipo_documento:  23,
  empresa:         24,
  fecha_vencimiento: 25,
  pagado:          26,
  aprobado:        27,
  orden_prioridad: 28,
  doc_url:         29,
  comprobante_url: 30,
  iva_5:           31,
  otros_exentos:   32,
  bot_email:       33,
  supabase_id:     34,
  sheet_uuid:      35,
} as const

/* ─── Parsing helpers ────────────────────────────────────────────────────── */

function cellStr(row: unknown[], i: number): string {
  if (i < 0 || i >= row.length) return ''
  const v = row[i]
  return v == null ? '' : String(v).trim()
}

function cellRaw(row: unknown[], i: number): unknown {
  if (i < 0 || i >= row.length) return null
  return row[i] ?? null
}

// UNFORMATTED_VALUE returns serial numbers for date cells
function parseSheetDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  const num = typeof value === 'number' ? value : (typeof value === 'string' ? parseFloat(value) : NaN)
  if (!isNaN(num) && num > 1000) {
    const d = new Date(Date.UTC(1899, 11, 30) + num * 86400000)
    if (isNaN(d.getTime())) return null
    const y = d.getUTCFullYear()
    if (y < 1990 || y > 2100) return null
    return d.toISOString().slice(0, 10)
  }
  if (typeof value === 'string') {
    const s = value.trim()
    const dmy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
    if (dmy) return new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1])).toISOString().slice(0, 10)
    const ymd = s.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/)
    if (ymd) return new Date(Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3])).toISOString().slice(0, 10)
    // "30-Oct-2024" format from legacy CSV
    const MONTHS: Record<string, number> = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 }
    const mon = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/)
    if (mon && MONTHS[mon[2]]) {
      return `${mon[3]}-${String(MONTHS[mon[2]]).padStart(2,'0')}-${mon[1].padStart(2,'0')}`
    }
  }
  return null
}

function parseNumber(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return val
  const cleaned = String(val).replace(/[^0-9,.\-]/g, '')
  if (!cleaned) return 0
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot   = cleaned.lastIndexOf('.')
  const dots = (cleaned.match(/\./g) || []).length
  const commas = (cleaned.match(/,/g) || []).length
  if (dots > 1 && commas === 0) return parseFloat(cleaned.replace(/\./g, '')) || 0
  if (lastComma > -1 && lastDot > -1)
    return lastComma > lastDot
      ? parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
      : parseFloat(cleaned.replace(/,/g, '')) || 0
  if (commas > 0 && dots === 0) {
    if (commas === 1 && cleaned.split(',')[1].length <= 2) return parseFloat(cleaned.replace(',', '.')) || 0
    return parseFloat(cleaned.replace(/,/g, '')) || 0
  }
  if (dots === 1 && commas === 0 && cleaned.split('.')[1]?.length === 3)
    return parseFloat(cleaned.replace('.', '')) || 0
  return parseFloat(cleaned) || 0
}

function parseAprobado(raw: string): string {
  const v = raw.toUpperCase()
  return v === 'TRUE' || v === 'SI' || v === 'SÍ' ? 'SI' : 'NO'
}

function isUrl(s: string) { return s.startsWith('http://') || s.startsWith('https://') }

/* ─── Row builder ────────────────────────────────────────────────────────── */

function buildRecord(row: unknown[], sheetRowNum: number) {
  const proveedor  = cellStr(row, C.proveedor) || cellStr(row, C.proveedor_a) || null
  const valorTotal = Math.abs(parseNumber(cellRaw(row, C.valor_total)))
  if (!proveedor && valorTotal === 0) return null

  const docUrl  = cellStr(row, C.doc_url)
  const cmpUrl  = cellStr(row, C.comprobante_url)

  return {
    proveedor,
    nit:              (() => { const v = cellStr(row, C.nit); return v && /^\d/.test(v) ? v : null })(),
    no_factura:       cellStr(row, C.no_factura) || null,
    concepto:         cellStr(row, C.concepto) || null,
    tipo_documento:   cellStr(row, C.tipo_documento) || null,
    tipo_egreso:      cellStr(row, C.tipo_egreso) || null,
    fecha_factura:    parseSheetDate(cellRaw(row, C.fecha_factura)),
    fecha_vencimiento: parseSheetDate(cellRaw(row, C.fecha_vencimiento)),
    fecha_pago:       parseSheetDate(cellRaw(row, C.fecha_pago)),
    valor_total:      valorTotal || null,
    monto_base:       parseNumber(cellRaw(row, C.monto_base)) || null,
    dcto:             parseNumber(cellRaw(row, C.dcto)) || null,
    iva_19:           parseNumber(cellRaw(row, C.iva_19)) || null,
    ipc:              parseNumber(cellRaw(row, C.ipc)) || null,
    iva_5:            parseNumber(cellRaw(row, C.iva_5)) || null,
    otros_exentos:    parseNumber(cellRaw(row, C.otros_exentos)) || null,
    tasa_retefuente:  parseNumber(cellRaw(row, C.tasa_retefuente)) || null,
    retefuente:       parseNumber(cellRaw(row, C.retefuente)) || null,
    tasa_reteica:     parseNumber(cellRaw(row, C.tasa_reteica)) || null,
    reteica:          parseNumber(cellRaw(row, C.reteica)) || null,
    empresa:          cellStr(row, C.empresa) || null,
    centro_costo:     cellStr(row, C.centro_costo) || null,
    metodo_pago:      cellStr(row, C.metodo_pago) || null,
    pagado:           cellStr(row, C.pagado) || null,
    aprobado:         parseAprobado(cellStr(row, C.aprobado)),
    orden_prioridad:  cellStr(row, C.orden_prioridad) || null,
    doc_url:          isUrl(docUrl) ? docUrl : null,
    comprobante_url:  isUrl(cmpUrl) ? cmpUrl : null,
    sheet_uuid:       cellStr(row, C.sheet_uuid) || null,
    supabase_id:      cellStr(row, C.supabase_id) || null,
    bot_email:        cellStr(row, C.bot_email) || null,
    sheet_row_num:    sheetRowNum,
  }
}

/* ─── Handler ────────────────────────────────────────────────────────────── */

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders(req) })

  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    const credJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!credJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not configured')
    const credentials: ServiceAccountCredentials = JSON.parse(credJson)
    const accessToken = await getGoogleAccessToken(credentials)

    // Fetch metadata and data in parallel
    const [startRowIndex, rows] = await Promise.all([
      getNamedRangeStartRow(accessToken),
      fetchRange(accessToken),
    ])

    if (rows.length < 2) {
      return new Response(JSON.stringify({ synced: 0, message: 'No data rows in range' }), { headers })
    }

    // startRowIndex is 0-based. Sheet row num for data row i (0-based):
    //   startRowIndex + 1 (to 1-based) + 1 (skip header) + i = startRowIndex + 2 + i
    const records = rows.slice(1)
      .map((row, i) => buildRecord(row, startRowIndex + 2 + i))
      .filter((r): r is NonNullable<typeof r> => r !== null)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Full reload — delete all then insert fresh
    const { error: delErr } = await supabase.from('cxp_facturas').delete().not('id', 'is', null)
    if (delErr) throw new Error(`DELETE failed: ${delErr.message}`)

    const BATCH = 200
    let inserted = 0
    const errors: string[] = []
    for (let i = 0; i < records.length; i += BATCH) {
      const { error } = await supabase.from('cxp_facturas').insert(records.slice(i, i + BATCH))
      if (error) { errors.push(`Batch ${Math.floor(i / BATCH)}: ${error.message}`); break }
      inserted += Math.min(BATCH, records.length - i)
    }

    return new Response(JSON.stringify({ synced: inserted, total: records.length, errors }), { headers })

  } catch (err) {
    console.error('sync-cxp error:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers },
    )
  }
})
