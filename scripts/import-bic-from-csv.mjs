import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

const SUPABASE_URL = 'https://dqfrqjsbfmwtclkclmvc.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZnJxanNiZm13dGNsa2NsbXZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc3ODQ0NCwiZXhwIjoyMDg5MzU0NDQ0fQ.u-1NmaO1UY58enzyXJBpd9qKYttZLOM2DDp1cwyhaVw'
const CSV_PATH = '/Users/patrona/Downloads/_Masterlist Proveedores HH - 1. Proveedores.csv'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// Column indices (0-based) verified from CSV header
const COL = {
  proveedor:      0,
  nit:            1,
  ciudad:         8,
  pais:           10,
  pago_inmediato: 13,
  score:          39,
  ubicacion:      40,
  indep:          43,
  under:          44,
  small:          45,
  minoria:        46,
}

function parseCSVLine(line) {
  const fields = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      fields.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur)
  return fields
}

function g(row, idx) {
  const v = row[idx]
  return (v === undefined || v === null) ? '' : v.trim()
}

function nullIfEmpty(s) { return s === '' ? null : s }
function nullIfIncomplete(s) { return (!s || s.toLowerCase() === 'incomplete') ? null : s }

async function readCSV() {
  const rows = []
  const rl = createInterface({ input: createReadStream(CSV_PATH), crlfDelay: Infinity })
  let first = true
  for await (const line of rl) {
    if (first) { first = false; continue } // skip header
    if (!line.trim()) continue
    rows.push(parseCSVLine(line))
  }
  return rows
}

async function main() {
  console.log('Reading CSV...')
  const rows = await readCSV()
  console.log(`  ${rows.length} data rows`)

  // Build update payloads keyed by NIT
  const byNit = new Map()
  for (const row of rows) {
    const nit = g(row, COL.nit)
    if (!nit || !/^\d+$/.test(nit)) continue

    const ubicacionRaw = g(row, COL.ubicacion)
    const ciudad       = nullIfEmpty(g(row, COL.ciudad))
    const pais         = nullIfEmpty(g(row, COL.pais))

    const score          = nullIfIncomplete(g(row, COL.score))
    const ubicacion      = nullIfIncomplete(ubicacionRaw)
    const indep          = nullIfEmpty(g(row, COL.indep))
    const under          = nullIfEmpty(g(row, COL.under))
    const small          = nullIfEmpty(g(row, COL.small))
    const minoria        = nullIfEmpty(g(row, COL.minoria))
    const pagoInmediato  = g(row, COL.pago_inmediato).toLowerCase() === 'inmediato'
    const hasData        = !!(score || ubicacion || ciudad || pais || indep || under || small || minoria)

    byNit.set(nit, {
      bic_survey_score:  score,
      bic_ubicacion:     ubicacion,
      bic_ciudad:        ciudad,
      bic_pais:          pais,
      bic_independent:   indep,
      bic_underserved:   under,
      bic_small_company: small,
      bic_minoria:       minoria,
      bic_synced_at:     hasData ? new Date().toISOString() : null,
      pago_inmediato:    pagoInmediato,
    })
  }

  console.log(`  ${byNit.size} unique NITs to process`)

  let updated = 0
  let notFound = 0
  let errors = 0

  const nits = [...byNit.keys()]
  for (let i = 0; i < nits.length; i++) {
    const nit = nits[i]
    const payload = byNit.get(nit)

    // Match 9-digit NIT or 10-digit NIT+DV (e.g. '900346290' or '9003462901')
    const filter = nit.length === 9
      ? `nit.eq.${nit},nit.like.${nit}_`
      : `nit.eq.${nit},nit.eq.${nit.slice(0, 9)}`

    const { data, error } = await supabase
      .from('accounts_suppliers')
      .update(payload)
      .or(filter)
      .select('id, nit')

    if (error) {
      console.error(`  ERROR nit=${nit}: ${error.message}`)
      errors++
    } else if (!data || data.length === 0) {
      notFound++
    } else {
      updated += data.length
    }

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`  ${i + 1}/${nits.length} processed (updated=${updated}, notFound=${notFound}, errors=${errors})\r`)
    }
  }

  console.log(`\nDone.`)
  console.log(`  Suppliers updated: ${updated}`)
  console.log(`  NITs not in Supabase: ${notFound}`)
  console.log(`  Errors: ${errors}`)
}

main().catch(err => { console.error(err); process.exit(1) })
