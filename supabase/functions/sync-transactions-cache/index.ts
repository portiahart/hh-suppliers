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

/* ─── Google auth — copied exactly from sync-supplier-spend-2025 ─────────── */

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

const SPREADSHEET_ID = '1sTJ6a5o91XmqSPq8kkkUZWsyldEL0xtPa0TNHZLFDQI'

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

/* ─── Column detection — mirrored from useReporteData.ts ─────────────────── */

interface ColMap {
  fechaOperacion:  number
  fechaFactura:    number
  fechaVencimiento:number
  noFac:           number
  importeCop:      number
  montoBase:       number
  totalIva:        number
  totalIpc:        number
  tasaReteFuente:  number
  reteFuente:      number
  tasaReteIca:     number
  reteIca:         number
  proveedor:       number
  nit:             number
  concepto:        number
  tipoEgreso:      number
  centroCosto:     number
  tipoDocumento:   number
  empresa:         number
  pagado:          number
  aprobado:        number
  ordenPrioridad:  number
  moneda:          number
  docUrl:          number
}

// Pattern order matters — first match wins per field, used-set prevents double-assignment.
const HEADER_PATTERNS: [keyof ColMap, string[]][] = [
  ['fechaOperacion',   ['fecha de operacion', 'fecha de operación']],
  ['fechaFactura',     ['fecha de factura', 'causaci']],
  ['fechaVencimiento', ['vencimiento']],
  ['noFac',            ['no. fac', 'doc equiv']],
  ['importeCop',       ['importe', 'valor']],
  ['montoBase',        ['monto base']],
  ['totalIva',         ['impuesto (iva)', 'impuesto(iva)', 'iva']],
  ['totalIpc',         ['impuesto', 'ipc']],
  ['tasaReteFuente',   ['taza rete fuente', 'tasa rete fuente', 'rete fuente %']],
  ['reteFuente',       ['rete fuente $', 'rete fuente']],
  ['tasaReteIca',      ['taza rete ica', 'tasa rete ica', 'rete ica %']],
  ['reteIca',          ['rete ica $', 'rete ica']],
  ['nit',              ['nit']],
  ['concepto',         ['concepto nuestro', 'concepto']],
  ['tipoEgreso',       ['tipo de egreso', 'egreso ordinario', 'extraordinario']],
  ['centroCosto',      ['centro de costo']],
  ['tipoDocumento',    ['tipo de documento']],
  ['empresa',          ['empresa']],
  ['pagado',           ['pagado']],
  ['aprobado',         ['aprobado']],
  ['ordenPrioridad',   ['orden de prioridad']],
  ['moneda',           ['moneda', 'currency', 'divisa']],
  ['docUrl',           ['doc_url', 'doc url']],
  ['proveedor',        []], // resolved separately below
]

function detectColumns(headerRow: unknown[]): ColMap {
  const headers = headerRow.map(h =>
    (h === null || h === undefined) ? '' : String(h).toLowerCase().trim()
  )

  const map: Partial<ColMap> = {}
  const used = new Set<number>()

  for (const [field, patterns] of HEADER_PATTERNS) {
    if (field === 'proveedor' || patterns.length === 0) continue
    for (const pattern of patterns) {
      const idx = headers.findIndex((h, i) => !used.has(i) && h.includes(pattern))
      if (idx !== -1) {
        map[field] = idx
        used.add(idx)
        break
      }
    }
  }

  // Disambiguate IVA vs IPC — the one with "iva" in header is totalIva
  if (map.totalIva !== undefined && map.totalIpc !== undefined) {
    const ivaH = headers[map.totalIva]
    const ipcH = headers[map.totalIpc]
    if (!ivaH.includes('iva') && ipcH.includes('iva')) {
      ;[map.totalIva, map.totalIpc] = [map.totalIpc, map.totalIva]
    }
  }

  // Disambiguate rete% columns — the one with "%" in header is the tasa (rate), not the amount
  if (map.tasaReteFuente !== undefined && map.reteFuente !== undefined) {
    const [tH, vH] = [headers[map.tasaReteFuente], headers[map.reteFuente]]
    if (vH.includes('%') && !tH.includes('%')) {
      ;[map.tasaReteFuente, map.reteFuente] = [map.reteFuente, map.tasaReteFuente]
    }
  }
  if (map.tasaReteIca !== undefined && map.reteIca !== undefined) {
    const [tH, vH] = [headers[map.tasaReteIca], headers[map.reteIca]]
    if (vH.includes('%') && !tH.includes('%')) {
      ;[map.tasaReteIca, map.reteIca] = [map.reteIca, map.tasaReteIca]
    }
  }

  // Proveedor: unlabeled column between reteIca and nit (col 18 fallback)
  if (map.reteIca !== undefined && map.nit !== undefined) {
    const between = map.reteIca + 1
    if (between < map.nit && !used.has(between)) {
      map.proveedor = between
    }
  }
  if (map.proveedor === undefined && headers.length > 18 && !used.has(18)) {
    map.proveedor = 18
  }

  // docUrl: check last column as fallback
  if (map.docUrl === undefined) {
    const last = headers.length - 1
    if (last >= 0 && (headers[last].includes('doc_url') || headers[last].includes('doc url'))) {
      map.docUrl = last
    } else {
      map.docUrl = -1
    }
  }

  // Defaults matching the known sheet layout
  const defaults: ColMap = {
    fechaOperacion:   0,
    fechaFactura:     10,
    fechaVencimiento: 25,
    noFac:            9,
    importeCop:       6,
    montoBase:        11,
    totalIva:         12,
    totalIpc:         13,
    tasaReteFuente:   14,
    reteFuente:       15,
    tasaReteIca:      16,
    reteIca:          17,
    proveedor:        18,
    nit:              19,
    concepto:         20,
    tipoEgreso:       21,
    centroCosto:      22,
    tipoDocumento:    23,
    empresa:          24,
    pagado:           26,
    aprobado:         27,
    ordenPrioridad:   28,
    moneda:           -1,
    docUrl:           -1,
  }

  return { ...defaults, ...map } as ColMap
}

/* ─── Date parsing ───────────────────────────────────────────────────────── */
// Returns ISO date string YYYY-MM-DD or null.
// Handles Google Sheets serial numbers (UNFORMATTED_VALUE returns them as numbers)
// plus DD/MM/YYYY and YYYY-MM-DD string formats.

function parseSheetDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null

  const num = typeof value === 'number'
    ? value
    : typeof value === 'string' ? parseFloat(value) : NaN

  if (!isNaN(num) && num > 1000) {
    // Google Sheets epoch: days since 30 Dec 1899
    const d = new Date(Date.UTC(1899, 11, 30) + num * 86400000)
    if (isNaN(d.getTime())) return null
    const year = d.getUTCFullYear()
    if (year < 1990 || year > 2100) return null
    return d.toISOString().slice(0, 10)
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const s = value.trim()
    const dmy = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
    if (dmy) {
      const d = new Date(Date.UTC(+dmy[3], +dmy[2] - 1, +dmy[1]))
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
    }
    const ymd = s.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/)
    if (ymd) {
      const d = new Date(Date.UTC(+ymd[1], +ymd[2] - 1, +ymd[3]))
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
    }
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }

  return null
}

/* ─── Number parsing — copied from useReporteData.ts ────────────────────── */

function parseNumber(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return val
  const str = String(val)
  const cleaned = str.replace(/[^0-9,.\-]/g, '')
  if (!cleaned) return 0

  const lastComma  = cleaned.lastIndexOf(',')
  const lastDot    = cleaned.lastIndexOf('.')
  const dotCount   = (cleaned.match(/\./g) || []).length
  const commaCount = (cleaned.match(/,/g) || []).length

  if (dotCount > 1 && commaCount === 0)  return parseFloat(cleaned.replace(/\./g, '')) || 0
  if (lastComma > -1 && lastDot > -1) {
    return lastComma > lastDot
      ? parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
      : parseFloat(cleaned.replace(/,/g, '')) || 0
  }
  if (commaCount > 0 && dotCount === 0) {
    if (commaCount === 1 && cleaned.split(',')[1].length <= 2) {
      return parseFloat(cleaned.replace(',', '.')) || 0
    }
    return parseFloat(cleaned.replace(/,/g, '')) || 0
  }
  if (dotCount === 1 && commaCount === 0 && cleaned.split('.')[1].length === 3) {
    return parseFloat(cleaned.replace('.', '')) || 0
  }
  return parseFloat(cleaned) || 0
}

/* ─── Cell helpers ───────────────────────────────────────────────────────── */

function cell(row: unknown[], idx: number): string {
  if (idx < 0 || idx >= row.length) return ''
  const v = row[idx]
  return (v === null || v === undefined) ? '' : String(v).trim()
}

function cellRaw(row: unknown[], idx: number): unknown {
  if (idx < 0 || idx >= row.length) return null
  return row[idx] ?? null
}

/* ─── Company splits — copied from useReporteData.ts ────────────────────── */

const COMPANY_SPLITS: Record<string, { code: string; pct: number }[]> = {
  BATH:      [{ code: 'BA', pct: 0.5 },  { code: 'TH', pct: 0.5 }],
  Compartido:[{ code: 'BA', pct: 0.5 },  { code: 'TH', pct: 0.5 }],
  BATHPM:    [{ code: 'BA', pct: 0.4 },  { code: 'TH', pct: 0.4 }, { code: 'PM', pct: 0.2 }],
  BATHPMMA:  [{ code: 'BA', pct: 0.35 }, { code: 'TH', pct: 0.35 }, { code: 'PM', pct: 0.2 }, { code: 'MA', pct: 0.1 }],
}

/* ─── Row builder ────────────────────────────────────────────────────────── */

interface TxRecord {
  source:            string
  fecha_operacion:   string | null
  fecha_factura:     string | null
  fecha_vencimiento: string | null
  proveedor:         string | null
  nit:               string | null
  importe_cop:       number | null
  monto_base:        number | null
  total_iva:         number | null
  total_ipc:         number | null
  rete_fuente:       number | null
  rete_ica:          number | null
  concepto:          string | null
  tipo_egreso:       string | null
  centro_costo:      string | null
  tipo_documento:    string | null
  empresa_raw:       string | null
  empresa:           string | null
  empresa_split:     unknown
  no_fac:            string | null
  moneda:            string | null
  pagado:            string | null
  aprobado:          string | null
  orden_prioridad:   string | null
  doc_url:           string | null
}

function buildRecord(
  row: unknown[],
  colMap: ColMap,
  source: string,
  isCpp: boolean,
): TxRecord | null {
  const proveedor  = cell(row, colMap.proveedor)
  const importeCop = Math.abs(parseNumber(cellRaw(row, colMap.importeCop)))

  // Skip blank / internal rows
  if (!proveedor && importeCop === 0) return null
  if (proveedor.startsWith('X -')) return null

  const empresaRaw = cell(row, colMap.empresa)
  const splits     = COMPANY_SPLITS[empresaRaw]

  const docUrlVal = colMap.docUrl >= 0 ? cell(row, colMap.docUrl) : ''
  const docUrl = (docUrlVal.startsWith('http://') || docUrlVal.startsWith('https://'))
    ? docUrlVal : null

  return {
    source,
    fecha_operacion:   parseSheetDate(cellRaw(row, colMap.fechaOperacion)),
    fecha_factura:     parseSheetDate(cellRaw(row, colMap.fechaFactura)),
    fecha_vencimiento: parseSheetDate(cellRaw(row, colMap.fechaVencimiento)),
    proveedor:         proveedor || null,
    nit:               (() => { const v = cell(row, colMap.nit); return (v && /^\d/.test(v)) ? v : null })(),
    importe_cop:       importeCop || null,
    monto_base:        parseNumber(cellRaw(row, colMap.montoBase)) || null,
    total_iva:         parseNumber(cellRaw(row, colMap.totalIva)) || null,
    total_ipc:         parseNumber(cellRaw(row, colMap.totalIpc)) || null,
    rete_fuente:       parseNumber(cellRaw(row, colMap.reteFuente)) || null,
    rete_ica:          parseNumber(cellRaw(row, colMap.reteIca)) || null,
    concepto:          cell(row, colMap.concepto) || null,
    tipo_egreso:       cell(row, colMap.tipoEgreso) || null,
    centro_costo:      cell(row, colMap.centroCosto) || null,
    tipo_documento:    cell(row, colMap.tipoDocumento) || null,
    empresa_raw:       empresaRaw || null,
    empresa:           splits ? null : (empresaRaw || null),
    empresa_split:     splits
      ? splits.map(({ code, pct }) => ({
          code,
          pct,
          importe_cop_allocated: Math.round(importeCop * pct * 100) / 100,
        }))
      : null,
    no_fac:          cell(row, colMap.noFac) || null,
    moneda:          colMap.moneda >= 0 ? (cell(row, colMap.moneda).toUpperCase() || null) : null,
    pagado:          isCpp ? null : (() => { const v = cell(row, colMap.pagado).toUpperCase(); return v === 'TRUE' || v === 'SI' ? 'SI' : v === 'FALSE' || v === 'NO' ? 'NO' : v || null })(),
    aprobado:        (() => { const v = cell(row, colMap.aprobado).toUpperCase(); return v === 'TRUE' || v === 'SI' ? 'SI' : v === 'FALSE' || v === 'NO' ? 'NO' : v || null })(),
    orden_prioridad: cell(row, colMap.ordenPrioridad) || null,
    doc_url:         docUrl,
  }
}

/* ─── Batch upsert helper ────────────────────────────────────────────────── */

async function insertBatch(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  table: string,
  records: object[],
  errors: string[],
  source: string,
): Promise<number> {
  const BATCH = 500
  let inserted = 0
  for (let i = 0; i < records.length; i += BATCH) {
    const { error } = await supabase.from(table).insert(records.slice(i, i + BATCH))
    if (error) {
      errors.push(`INSERT ${source} into ${table} (batch ${i}): ${error.message}`)
      break
    }
    inserted += Math.min(BATCH, records.length - i)
  }
  return inserted
}

/* ─── Main handler ───────────────────────────────────────────────────────── */

const EXPENSE_SOURCES = ['BANCOS', 'CASHAPP', 'TARSCOL', 'EXTRA'] as const

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) })
  }

  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    /* 1. Google auth */
    const googleCredentialsJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON')
    if (!googleCredentialsJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON secret not configured')
    const credentials: ServiceAccountCredentials = JSON.parse(googleCredentialsJson)
    const accessToken = await getGoogleAccessToken(credentials)

    /* 2. Fetch all five ranges in parallel */
    const [bancosData, cashappData, tarscolData, extraData, cppData] = await Promise.all([
      fetchNamedRange('BANCOS',  accessToken),
      fetchNamedRange('CASHAPP', accessToken),
      fetchNamedRange('TARSCOL', accessToken),
      fetchNamedRange('EXTRA',   accessToken),
      fetchNamedRange('CPP',     accessToken),
    ])

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const synced: Record<string, number> = { BANCOS: 0, CASHAPP: 0, TARSCOL: 0, EXTRA: 0, CPP: 0 }
    const errors: string[] = []

    /* 3. Expense sources → transactions_cache */
    const rangeData: Record<string, unknown[][]> = {
      BANCOS:  bancosData,
      CASHAPP: cashappData,
      TARSCOL: tarscolData,
      EXTRA:   extraData,
    }

    for (const source of EXPENSE_SOURCES) {
      const rows = rangeData[source]
      if (rows.length < 2) continue // no data rows

      const colMap  = detectColumns(rows[0])
      const records = rows.slice(1)
        .map(r => buildRecord(r, colMap, source, false))
        .filter((r): r is TxRecord => r !== null)

      // Full reload: delete existing rows for this source then insert fresh
      const { error: delErr } = await supabase
        .from('transactions_cache')
        .delete()
        .eq('source', source)

      if (delErr) {
        errors.push(`DELETE ${source}: ${delErr.message}`)
        continue
      }

      synced[source] = await insertBatch(supabase, 'transactions_cache', records, errors, source)
    }

    /* 4. CPP → cuentas_por_pagar_cache (no pagado/aprobado columns) */
    if (cppData.length >= 2) {
      const colMap  = detectColumns(cppData[0])
      const rawRecords = cppData.slice(1)
        .map(r => buildRecord(r, colMap, 'CPP', true))
        .filter((r): r is TxRecord => r !== null)

      // Strip pagado only — cuentas_por_pagar_cache has aprobado but not pagado
      const cppRecords = rawRecords.map(({ pagado: _p, ...rest }) => rest)

      const { error: delErr } = await supabase
        .from('cuentas_por_pagar_cache')
        .delete()
        .eq('source', 'CPP')

      if (delErr) {
        errors.push(`DELETE CPP: ${delErr.message}`)
      } else {
        synced['CPP'] = await insertBatch(supabase, 'cuentas_por_pagar_cache', cppRecords, errors, 'CPP')
      }
    }

    return new Response(JSON.stringify({ synced, errors }), { headers })

  } catch (err) {
    console.error('sync-transactions-cache error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers })
  }
})
