import { createClient } from '../node_modules/@supabase/supabase-js/dist/index.mjs'

const SUPABASE_URL = 'https://dqfrqjsbfmwtclkclmvc.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZnJxanNiZm13dGNsa2NsbXZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc3ODQ0NCwiZXhwIjoyMDg5MzU0NDQ0fQ.u-1NmaO1UY58enzyXJBpd9qKYttZLOM2DDp1cwyhaVw'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const TABLES = {
  accounts_suppliers: [
    'razon_social','nombre_operativo','nit','documento_tipo','tipo_persona',
    'email','telefono','categoria','status','notes','trade_type','acuerdo',
    'whatsapp_group','ciudad','pais','hh_contacto','bic_survey_score',
    'bic_ubicacion','bic_categoria','bic_physical_goods','bic_independent',
    'bic_underserved','bic_small_company','bic_minoria','bic_ciudad','bic_pais',
  ],
  suppliers_banking: [
    'nombre_beneficiario','banco','tipo_cuenta','numero_cuenta',
    'tipo_documento_bancolombia','verificacion_notas',
  ],
}

async function main() {
  let grandTotal = 0

  for (const [table, cols] of Object.entries(TABLES)) {
    console.log(`\n--- ${table} ---`)
    for (const col of cols) {
      // Count first
      const { count } = await supabase
        .from(table).select('id', { count: 'exact', head: true }).like(col, '#%')

      if (!count || count === 0) continue

      // Null out
      const { error } = await supabase
        .from(table).update({ [col]: null }).like(col, '#%')

      if (error) {
        console.log(`  ${col}: ERROR — ${error.message}`)
      } else {
        console.log(`  ${col}: cleared ${count} rows`)
        grandTotal += count
      }
    }
  }

  console.log(`\nTotal cells cleared: ${grandTotal}`)
}

main().catch(err => { console.error(err); process.exit(1) })
