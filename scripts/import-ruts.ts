#!/usr/bin/env npx tsx
/**
 * import-ruts.ts
 *
 * Scans the Google Drive Proveedores folder for PDFs with "RUT" in the filename.
 * For each unique NIT, picks the most recently generated document.
 * Uploads the winning file to Supabase and registers it in suppliers_documents.
 *
 * Usage:
 *   npx tsx scripts/import-ruts.ts           # live run
 *   npx tsx scripts/import-ruts.ts --dry-run # preview only, no uploads
 */

import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { createRequire } from 'module'
const _require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdf = _require('pdf-parse') as (buf: Buffer, opts?: Record<string, unknown>) => Promise<{ text: string; numpages: number }>

// ─── Config ──────────────────────────────────────────────────────────────────

const FOLDER = '/Users/patrona/Library/CloudStorage/GoogleDrive-portia@portiahart.com/Shared drives/HH - Compras/4. Proveedores'
const SUPABASE_URL = 'https://dqfrqjsbfmwtclkclmvc.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZnJxanNiZm13dGNsa2NsbXZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc3ODQ0NCwiZXhwIjoyMDg5MzU0NDQ0fQ.u-1NmaO1UY58enzyXJBpd9qKYttZLOM2DDp1cwyhaVw'

const DRY_RUN = process.argv.includes('--dry-run')

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ─── File discovery ───────────────────────────────────────────────────────────

function findRUTFiles(dir: string): string[] {
  const results: string[] = []
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...findRUTFiles(fullPath))
    } else if (
      entry.isFile() &&
      /rut/i.test(entry.name) &&
      /\.pdf$/i.test(entry.name)
    ) {
      results.push(fullPath)
    }
  }
  return results
}

// ─── PDF extraction ───────────────────────────────────────────────────────────

interface Extracted {
  filePath: string
  nit: string | null
  documentDate: Date | null
  rawDate: string | null
}

async function extractFromPDF(filePath: string): Promise<Extracted> {
  let text = ''
  try {
    const buffer = fs.readFileSync(filePath)
    // Timeout after 10s — some PDFs are corrupt, encrypted, or huge
    const data = await Promise.race([
      pdf(buffer, { max: 3 }),  // parse max 3 pages (NIT and date are on page 1)
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000)),
    ])
    text = data.text
  } catch {
    return { filePath, nit: null, documentDate: null, rawDate: null }
  }

  // ── Document date ──────────────────────────────────────────────────────────
  // Format: "Fecha generación documento PDF: 28-01-2026 07:38:28PM"
  let documentDate: Date | null = null
  let rawDate: string | null = null
  const dateMatch = text.match(/Fecha generaci[oó]n[^:]*:\s*(\d{2}-\d{2}-\d{4})/i)
  if (dateMatch) {
    rawDate = dateMatch[1]
    const [day, month, year] = rawDate.split('-').map(Number)
    documentDate = new Date(year, month - 1, day)
  }

  // ── NIT ───────────────────────────────────────────────────────────────────
  // DIAN text-based RUTs print NIT+DV as a compact 10-digit number, e.g. "9010724862"
  // (9-digit NIT concatenated with 1-digit DV, no separator).
  // Formulario numbers (11 digits) and 8-digit dates are excluded by the {9,10} range.
  let nit: string | null = null

  // Find all standalone 9-10 digit numbers (not surrounded by other digits)
  const compactMatches = [...text.matchAll(/(?<!\d)(\d{9,10})(?!\d)/g)]
  for (const m of compactMatches) {
    const num = m[1]
    // 10 digits = NIT (9) + DV (1) concatenated
    // 9 digits = NIT alone (less common in newer PDFs)
    nit = num.length === 10 ? num.slice(0, 9) : num
    break  // first match is the NIT (appears near the top of the form data)
  }

  if (!nit) {
    // Fallback: spaced format "9 0 0 9 7 2 3 4 1" (older or image-based RUTs)
    const spacedMatch = text.match(/(\d(?:\s\d){8})/)
    if (spacedMatch) nit = spacedMatch[1].replace(/\s/g, '')
  }

  return { filePath, nit, documentDate, rawDate }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Scanning: ${FOLDER}`)
  if (DRY_RUN) console.log('DRY RUN — no uploads or DB changes\n')
  else console.log()

  // 1. Find files
  const files = findRUTFiles(FOLDER)
  console.log(`Found ${files.length} PDF files with "RUT" in the name\n`)

  if (files.length === 0) {
    console.log('Nothing to process.')
    return
  }

  // 2. Extract NIT + date from each PDF
  console.log('Extracting NIT and date from each file...')
  const extracted: Extracted[] = []
  for (const filePath of files) {
    const result = await extractFromPDF(filePath)
    const nitStr  = result.nit      ? `NIT ${result.nit}` : 'NIT ??'
    const dateStr = result.rawDate  ? result.rawDate       : 'date ??'
    console.log(`  ${nitStr}  ${dateStr}  ${path.basename(filePath)}`)
    extracted.push(result)
  }

  // 3. Deduplicate: group by NIT, keep most recent document date
  const byNIT = new Map<string, Extracted>()
  const noNIT: Extracted[] = []

  for (const item of extracted) {
    if (!item.nit) {
      noNIT.push(item)
      continue
    }
    const existing = byNIT.get(item.nit)
    if (!existing) {
      byNIT.set(item.nit, item)
    } else {
      // Prefer the one with a date; if both have dates, prefer more recent
      const itemHasDate = item.documentDate !== null
      const existingHasDate = existing.documentDate !== null
      if (itemHasDate && (!existingHasDate || item.documentDate! > existing.documentDate!)) {
        byNIT.set(item.nit, item)
      }
    }
  }

  console.log(`\nDeduplication: ${byNIT.size} unique NIT(s), ${noNIT.length} file(s) with no NIT extracted`)
  if (noNIT.length > 0) {
    console.log('Files with no NIT (handle manually):')
    noNIT.forEach(f => console.log(`  - ${f.filePath}`))
  }

  // 4. Upload winners
  console.log('\nProcessing...\n')
  const stats = { uploaded: 0, replaced: 0, skipped: 0, noSupplier: 0, errors: 0 }

  for (const [nit, item] of byNIT) {
    const fileName = path.basename(item.filePath)
    const prefix   = `NIT ${nit} — ${fileName}`

    // Look up supplier
    const { data: supplier } = await supabase
      .from('accounts_suppliers')
      .select('id, name')
      .eq('nit', nit)
      .maybeSingle()

    if (!supplier) {
      console.log(`  ✗  ${prefix}\n     No supplier found for this NIT\n`)
      stats.noSupplier++
      continue
    }

    // Check for existing RUT document
    const { data: existingDocs } = await supabase
      .from('suppliers_documents')
      .select('id, document_date, file_name, storage_path')
      .eq('supplier_id', supplier.id)
      .eq('document_type', 'RUT')
      .order('document_date', { ascending: false, nullsFirst: false })
      .limit(1)

    const existingDoc = existingDocs?.[0] ?? null

    if (existingDoc?.document_date && item.documentDate) {
      const existingDate = new Date(existingDoc.document_date)
      if (existingDate >= item.documentDate) {
        console.log(`  ↷  ${prefix}\n     ${supplier.name}: existing RUT dated ${existingDoc.document_date.slice(0, 10)} is same/newer — skipping\n`)
        stats.skipped++
        continue
      }
    }

    const isReplacing = existingDoc !== null
    const action = isReplacing ? 'Replacing' : 'Uploading'
    const dateLabel = item.rawDate ? ` (dated ${item.rawDate})` : ''

    if (DRY_RUN) {
      console.log(`  ✓  ${prefix}\n     [DRY RUN] ${action} for ${supplier.name}${dateLabel}\n`)
      isReplacing ? stats.replaced++ : stats.uploaded++
      continue
    }

    try {
      const fileBuffer = fs.readFileSync(item.filePath)
      // Sanitize filename: Supabase storage keys must be ASCII alphanumeric + . - _
      const safeFileName = fileName.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9.\-_]/g, '_').replace(/_+/g, '_').replace(/^_|_(?=\.)/g, '')
      const storagePath = `${supplier.id}/${Date.now()}_${safeFileName}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('supplier-documents')
        .upload(storagePath, fileBuffer, { contentType: 'application/pdf', upsert: false })
      if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`)

      // Delete old document record (keep storage clean-ish — old file stays but record removed)
      if (existingDoc) {
        await supabase.from('suppliers_documents').delete().eq('id', existingDoc.id)
      }

      // Insert new document record
      const { error: insertError } = await supabase.from('suppliers_documents').insert({
        supplier_id:    supplier.id,
        document_type:  'RUT',
        storage_path:   storagePath,
        file_name:      fileName,
        file_size_bytes: fileBuffer.length,
        mime_type:      'application/pdf',
        document_date:  item.documentDate?.toISOString() ?? null,
      })
      if (insertError) throw new Error(`DB insert failed: ${insertError.message}`)

      console.log(`  ✓  ${prefix}\n     ${action} for ${supplier.name}${dateLabel}\n`)
      isReplacing ? stats.replaced++ : stats.uploaded++
    } catch (e) {
      console.log(`  ✗  ${prefix}\n     ${supplier.name}: ${e instanceof Error ? e.message : String(e)}\n`)
      stats.errors++
    }
  }

  // 5. Summary
  console.log('─'.repeat(50))
  console.log(`Uploaded (new):   ${stats.uploaded}`)
  console.log(`Replaced (newer): ${stats.replaced}`)
  console.log(`Skipped (older):  ${stats.skipped}`)
  console.log(`No supplier:      ${stats.noSupplier}`)
  console.log(`Errors:           ${stats.errors}`)
  if (noNIT.length > 0) console.log(`No NIT found:     ${noNIT.length} (listed above)`)
}

main().catch(err => { console.error(err); process.exit(1) })
