/**
 * upload-document
 * Accepts a multipart/form-data upload, stores the file in the
 * supplier-documents bucket and inserts a record into suppliers_documents.
 *
 * Form fields:
 *   file          — the file blob
 *   supplierId    — UUID of the supplier
 *   documentType  — e.g. "RUT", "Cámara de Comercio"
 *   uploadedBy    — email of the uploading user (optional)
 */

import { createClient } from 'npm:@supabase/supabase-js@2'

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

const ACCEPTED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 10 * 1024 * 1024

function slugify(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) })
  }

  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    const form = await req.formData()
    const file         = form.get('file') as File | null
    const supplierId   = form.get('supplierId') as string | null
    const documentType = form.get('documentType') as string | null
    const uploadedBy   = form.get('uploadedBy') as string | null

    if (!file || !supplierId || !documentType) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), { status: 400, headers })
    }
    if (!ACCEPTED_MIME.has(file.type)) {
      return new Response(JSON.stringify({ success: false, error: 'Tipo de archivo no permitido' }), { status: 400, headers })
    }
    if (file.size > MAX_BYTES) {
      return new Response(JSON.stringify({ success: false, error: 'El archivo supera el límite de 10 MB' }), { status: 400, headers })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const storagePath = `${supplierId}/${slugify(documentType)}/${slugify(file.name)}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: storageErr } = await supabase.storage
      .from('supplier-documents')
      .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true })

    if (storageErr) throw new Error(`Storage error: ${storageErr.message}`)

    const { data: doc, error: dbErr } = await supabase
      .from('suppliers_documents')
      .insert({
        supplier_id:      supplierId,
        document_type:    documentType,
        storage_path:     storagePath,
        file_name:        file.name,
        file_size_bytes:  file.size,
        mime_type:        file.type,
        uploaded_by:      uploadedBy ?? null,
      })
      .select()
      .single()

    if (dbErr) throw new Error(`DB error: ${dbErr.message}`)

    return new Response(JSON.stringify({ success: true, doc }), { headers })
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers },
    )
  }
})
