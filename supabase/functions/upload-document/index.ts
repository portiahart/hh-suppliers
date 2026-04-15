/**
 * upload-document
 * Accepts a JSON body with a base64-encoded file, stores the file in the
 * supplier-documents bucket and inserts a record into suppliers_documents.
 *
 * Body (JSON):
 *   fileBase64    — base64-encoded file content
 *   fileName      — original file name
 *   mimeType      — MIME type of the file
 *   fileSize      — file size in bytes
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
    const { fileBase64, fileName, mimeType, fileSize, supplierId, documentType, uploadedBy } =
      await req.json() as {
        fileBase64: string
        fileName: string
        mimeType: string
        fileSize: number
        supplierId: string
        documentType: string
        uploadedBy?: string
      }

    if (!fileBase64 || !fileName || !mimeType || !supplierId || !documentType) {
      return new Response(JSON.stringify({ success: false, error: 'Missing required fields' }), { status: 400, headers })
    }
    if (!ACCEPTED_MIME.has(mimeType)) {
      return new Response(JSON.stringify({ success: false, error: 'Tipo de archivo no permitido' }), { status: 400, headers })
    }
    if (fileSize > MAX_BYTES) {
      return new Response(JSON.stringify({ success: false, error: 'El archivo supera el límite de 10 MB' }), { status: 400, headers })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const fileBytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0))
    const storagePath = `${supplierId}/${slugify(documentType)}/${slugify(fileName)}`

    const { error: storageErr } = await supabase.storage
      .from('supplier-documents')
      .upload(storagePath, fileBytes, { contentType: mimeType, upsert: true })

    if (storageErr) throw new Error(`Storage: ${storageErr.message}`)

    const { data: doc, error: dbErr } = await supabase
      .from('suppliers_documents')
      .insert({
        supplier_id:     supplierId,
        document_type:   documentType,
        storage_path:    storagePath,
        file_name:       fileName,
        file_size_bytes: fileSize,
        mime_type:       mimeType,
        uploaded_by:     uploadedBy ?? null,
      })
      .select()
      .single()

    if (dbErr) throw new Error(`DB: ${dbErr.message}`)

    return new Response(JSON.stringify({ success: true, doc }), { headers })
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers },
    )
  }
})
