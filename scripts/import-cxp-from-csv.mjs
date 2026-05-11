import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

const SUPABASE_URL = 'https://dqfrqjsbfmwtclkclmvc.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZnJxanNiZm13dGNsa2NsbXZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc3ODQ0NCwiZXhwIjoyMDg5MzU0NDQ0fQ.u-1NmaO1UY58enzyXJBpd9qKYttZLOM2DDp1cwyhaVw'
const CSV_PATH = process.argv[2] ?? '/Users/patrona/Downloads/CxP.csv'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// Column indices (0-based)
const C = {
  fecha_pago: 0, proveedor_a: 1, dcto: 3,
  valor_total: 6, metodo_pago: 8, no_factura: 9,
  fecha_factura: 10, monto_base: 11, iva_19: 12, ipc: 13,
  tasa_retefuente: 14, retefuente: 15, tasa_reteica: 16, reteica: 17,
  proveedor: 18, nit: 19, concepto: 20, tipo_egreso: 21,
  centro_costo: 22, tipo_documento: 23, empresa: 24,
  fecha_vencimiento: 25, pagado: 26, aprobado: 27,
  orden_prioridad: 28, doc_url: 29, comprobante_url: 30,
  iva_5: 31, otros_exentos: 32, bot_email: 33, supabase_id: 34, sheet_uuid: 35,
}

const MONTHS = { Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12 }

function parseCSVLine(line) {
  const fields = []; let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++ } else inQ = !inQ }
    else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = '' }
    else cur += ch
  }
  fields.push(cur.trim()); return fields
}

function parseDate(raw) {
  if (!raw) return null
  // Handles: "30-Oct-2024", "31 Dec 2024", "7-May-2025", "31 Jan 2025"
  const m = raw.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/)
  if (!m) return null
  const month = MONTHS[m[2]]
  if (!month) return null
  return `${m[3]}-${String(month).padStart(2,'0')}-${m[1].padStart(2,'0')}`
}

function parseAmount(raw) {
  if (!raw) return null
  const n = parseFloat(raw.replace(/,/g, ''))
  return isNaN(n) ? null : n
}

function parseAprobado(raw) {
  if (!raw) return 'NO'
  const v = raw.trim().toUpperCase()
  if (v === 'TRUE' || v === 'SI' || v === 'SÍ') return 'SI'
  return 'NO'
}

function isBlank(v) { return !v || !v.trim() }

async function readCSV() {
  const rows = []
  const rl = createInterface({ input: createReadStream(CSV_PATH), crlfDelay: Infinity })
  let first = true
  for await (const line of rl) {
    if (first) { first = false; continue }
    if (!line.trim()) continue
    rows.push(parseCSVLine(line))
  }
  return rows
}

async function main() {
  console.log('Reading CSV…')
  const rows = await readCSV()
  console.log(`  ${rows.length} data rows`)

  const records = rows.map(r => ({
    proveedor:        r[C.proveedor]?.trim() || r[C.proveedor_a]?.trim() || null,
    nit:              r[C.nit]?.trim() || null,
    no_factura:       r[C.no_factura]?.trim() || null,
    concepto:         r[C.concepto]?.trim() || null,
    tipo_documento:   r[C.tipo_documento]?.trim() || null,
    tipo_egreso:      r[C.tipo_egreso]?.trim() || null,
    fecha_factura:    parseDate(r[C.fecha_factura]),
    fecha_vencimiento: parseDate(r[C.fecha_vencimiento]),
    fecha_pago:       parseDate(r[C.fecha_pago]),
    valor_total:      parseAmount(r[C.valor_total]),
    monto_base:       parseAmount(r[C.monto_base]),
    dcto:             parseAmount(r[C.dcto]),
    iva_19:           parseAmount(r[C.iva_19]),
    ipc:              parseAmount(r[C.ipc]),
    iva_5:            parseAmount(r[C.iva_5]),
    otros_exentos:    parseAmount(r[C.otros_exentos]),
    tasa_retefuente:  parseAmount(r[C.tasa_retefuente]),
    retefuente:       parseAmount(r[C.retefuente]),
    tasa_reteica:     parseAmount(r[C.tasa_reteica]),
    reteica:          parseAmount(r[C.reteica]),
    empresa:          r[C.empresa]?.trim() || null,
    centro_costo:     r[C.centro_costo]?.trim() || null,
    metodo_pago:      r[C.metodo_pago]?.trim() || null,
    pagado:           r[C.pagado]?.trim() || null,
    aprobado:         parseAprobado(r[C.aprobado]),
    orden_prioridad:  r[C.orden_prioridad]?.trim() || null,
    doc_url:          r[C.doc_url]?.trim() || null,
    comprobante_url:  r[C.comprobante_url]?.trim() || null,
    sheet_uuid:       r[C.sheet_uuid]?.trim() || null,
    supabase_id:      r[C.supabase_id]?.trim() || null,
    bot_email:        r[C.bot_email]?.trim() || null,
  })).filter(r => r.proveedor || r.nit || r.valor_total)

  console.log(`  ${records.length} non-empty records to insert`)

  // Truncate existing data before re-import
  const { error: truncErr } = await supabase.from('cxp_facturas').delete().not('id', 'is', null)
  if (truncErr) { console.error('Truncate error:', truncErr.message); process.exit(1) }

  const BATCH = 100
  let inserted = 0, errors = 0
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH)
    const { error } = await supabase.from('cxp_facturas').insert(batch)
    if (error) {
      errors++
      console.error(`  Batch ${Math.floor(i/BATCH)+1} error: ${error.message}`)
    } else {
      inserted += batch.length
    }
    if ((i + BATCH) % 1000 === 0 || i + BATCH >= records.length) {
      process.stdout.write(`  ${Math.min(i+BATCH, records.length)}/${records.length} inserted\r`)
    }
  }

  console.log(`\nDone.`)
  console.log(`  Inserted: ${inserted}`)
  console.log(`  Batch errors: ${errors}`)
  const pagado = records.filter(r => r.pagado === 'POR PAGAR').length
  console.log(`  POR PAGAR rows: ${pagado} (visible on CxP page)`)
}

main().catch(err => { console.error(err); process.exit(1) })
