import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

const SUPABASE_URL = 'https://dqfrqjsbfmwtclkclmvc.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZnJxanNiZm13dGNsa2NsbXZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc3ODQ0NCwiZXhwIjoyMDg5MzU0NDQ0fQ.u-1NmaO1UY58enzyXJBpd9qKYttZLOM2DDp1cwyhaVw'
const CSV_PATH = process.argv[2] ?? '/Users/patrona/Downloads/_Masterlist Proveedores HH - Cuentas BMP.csv'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// CSV columns (0-based)
const COL = { cuenta: 0, tipo_cuenta: 1, nombre: 2, banco: 3, doc_num: 4, doc_tipo: 5, validado: 6 }

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
  return fields.map(f => f.trim())
}

function normalizeTipoCuenta(raw) {
  const v = raw.toLowerCase()
  if (v.includes('ahorro') || v.includes('depósito') || v.includes('deposito')) return 'Ahorros'
  if (v.includes('corriente')) return 'Corriente'
  return null
}

function normalizeTipoDoc(raw) {
  const v = raw.toLowerCase()
  if (v === 'nit') return 'NIT'
  if (v.includes('ciudadan')) return 'CC'
  if (v.includes('extranjería') || v.includes('extranjeria')) return 'CE'
  return null
}

function normalizeBanco(raw) {
  const v = raw.toLowerCase()
  if (v.includes('bancolombia')) return 'Bancolombia'
  if (v.includes('nequi')) return 'Nequi'
  if (v.includes('daviplata')) return 'Daviplata'
  if (v.includes('davivienda') || v === 'davibank s.a') return 'Davivienda'
  if (v.includes('bogot')) return 'Banco de Bogotá'
  if (v.includes('bbva')) return 'BBVA'
  if (v.includes('agrario')) return 'Banco Agrario'
  if (v.includes('caja social') || v.includes('bcsc')) return 'Caja Social'
  if (v.includes('falabella')) return 'Banco Falabella'
  if (v.includes('popular')) return 'Banco Popular'
  if (v.includes('colpatria') || v.includes('scotiabank')) return 'Scotiabank Colpatria'
  if (v.includes('helm')) return 'Helm Bank'
  return raw  // keep original for unknown banks
}

function isBlank(v) {
  if (v === null || v === undefined || v === '') return true
  const s = String(v)
  return s.startsWith('#') || s.trim() === ''
}

function mergeField(existing, incoming) {
  return isBlank(existing) && !isBlank(incoming) ? incoming : existing
}

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
  console.log('Reading CSV...')
  const rows = await readCSV()
  console.log(`  ${rows.length} data rows`)

  let inserted = 0, updated = 0, notFound = 0, skipped = 0, errors = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const docNum  = row[COL.doc_num]
    const docTipo = row[COL.doc_tipo]
    const cuenta  = row[COL.cuenta]
    const nombre  = row[COL.nombre]
    const banco   = row[COL.banco]

    if (!docNum || !/^\d+$/.test(docNum)) { skipped++; continue }
    if (!cuenta && !nombre && !banco) { skipped++; continue }

    // Find matching supplier in accounts_suppliers
    const isNit = docTipo === 'NIT'
    const filter = isNit
      ? `nit.eq.${docNum},nit.like.${docNum}_`
      : `nit.eq.${docNum}`

    const { data: suppliers, error: supErr } = await supabase
      .from('accounts_suppliers')
      .select('id, nit')
      .or(filter)
      .limit(5)

    if (supErr) { errors++; continue }
    if (!suppliers || suppliers.length === 0) { notFound++; continue }

    const supplierId = suppliers[0].id

    // Get existing suppliers_banking row
    const { data: existing } = await supabase
      .from('suppliers_banking')
      .select('*')
      .eq('supplier_id', supplierId)
      .maybeSingle()

    const incoming = {
      nombre_beneficiario:       nombre || null,
      banco:                     normalizeBanco(banco),
      tipo_cuenta:               normalizeTipoCuenta(row[COL.tipo_cuenta]),
      numero_cuenta:             cuenta || null,
      tipo_documento_bancolombia: normalizeTipoDoc(docTipo),
    }

    if (!existing) {
      // Insert new row
      const { error } = await supabase
        .from('suppliers_banking')
        .insert({ ...incoming, supplier_id: supplierId, verificacion_notas: null })
      if (error) { errors++; console.error(`  INSERT error supplier ${supplierId}: ${error.message}`) }
      else inserted++
    } else {
      // Only update fields that are currently blank
      const patch = {}
      for (const [k, v] of Object.entries(incoming)) {
        const merged = mergeField(existing[k], v)
        if (merged !== existing[k]) patch[k] = merged
      }
      if (Object.keys(patch).length === 0) { skipped++; continue }
      const { error } = await supabase
        .from('suppliers_banking')
        .update(patch)
        .eq('id', existing.id)
      if (error) { errors++; console.error(`  UPDATE error supplier ${supplierId}: ${error.message}`) }
      else updated++
    }

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`  ${i + 1}/${rows.length} (inserted=${inserted}, updated=${updated}, notFound=${notFound}, skipped=${skipped}, errors=${errors})\r`)
    }
  }

  console.log(`\nDone.`)
  console.log(`  Inserted: ${inserted}`)
  console.log(`  Updated (filled blanks): ${updated}`)
  console.log(`  Not found in Supabase: ${notFound}`)
  console.log(`  Skipped (no data or no NIT): ${skipped}`)
  console.log(`  Errors: ${errors}`)
}

main().catch(err => { console.error(err); process.exit(1) })
