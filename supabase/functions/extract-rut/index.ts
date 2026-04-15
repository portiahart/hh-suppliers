/**
 * extract-rut
 * Accepts a Supabase Storage signed URL for a RUT or Cámara de Comercio PDF,
 * fetches the file, sends it to Gemini Flash, and returns structured supplier fields.
 *
 * Body: { url: string }  — a signed URL to the PDF
 * Returns: { success: true, fields: ExtractedFields } | { success: false, error: string }
 */

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

interface ExtractedFields {
  razon_social:      string | null
  nit:               string | null
  tipo_persona:      'JURIDICA' | 'NATURAL' | null
  codigo_tributario: string | null
  ciiu:              string | null
  direccion:         string | null
  ciudad:            string | null
  pais:              string | null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) })
  }

  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    const googleKey = Deno.env.get('GOOGLE_AI_API_KEY')
    if (!googleKey) throw new Error('GOOGLE_AI_API_KEY not configured')

    const { url } = await req.json() as { url: string }
    if (!url) throw new Error('Missing url in request body')

    // Fetch the PDF from storage
    const pdfRes = await fetch(url)
    if (!pdfRes.ok) throw new Error(`Failed to fetch PDF: ${pdfRes.status}`)
    const pdfBuffer = await pdfRes.arrayBuffer()
    const uint8 = new Uint8Array(pdfBuffer)
    let binary = ''
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
    const base64 = btoa(binary)
    const mimeType = pdfRes.headers.get('content-type') ?? 'application/pdf'

    const prompt = `You are extracting supplier registration data from a Colombian RUT (Registro Único Tributario) or Cámara de Comercio document.

Extract the following fields and return ONLY a valid JSON object with these exact keys (use null for any field not found):

{
  "razon_social": "Full legal company or person name as registered",
  "nit": "NIT number digits only, no dashes or check digit",
  "tipo_persona": "JURIDICA or NATURAL only",
  "codigo_tributario": "Tax regime / responsabilidades tributarias (e.g. 05, 11-04, etc.)",
  "ciiu": "CIIU economic activity code (numeric only)",
  "direccion": "Full street address",
  "ciudad": "City name only",
  "pais": "Country name (usually Colombia)"
}

Return only the JSON object, no explanation or markdown.`

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${googleKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0, maxOutputTokens: 512 },
        }),
      },
    )

    if (!geminiRes.ok) {
      const body = await geminiRes.text()
      throw new Error(`Gemini API error (${geminiRes.status}): ${body}`)
    }

    const geminiData = await geminiRes.json()
    const rawText: string = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    // Strip any markdown code fences if present
    const jsonText = rawText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(jsonText) as Record<string, string | null>

    const fields: ExtractedFields = {
      razon_social:      parsed.razon_social ?? null,
      nit:               parsed.nit ? String(parsed.nit).replace(/\D/g, '') || null : null,
      tipo_persona:      (parsed.tipo_persona === 'JURIDICA' || parsed.tipo_persona === 'NATURAL')
                           ? parsed.tipo_persona : null,
      codigo_tributario: parsed.codigo_tributario ?? null,
      ciiu:              parsed.ciiu ?? null,
      direccion:         parsed.direccion ?? null,
      ciudad:            parsed.ciudad ?? null,
      pais:              parsed.pais ?? null,
    }

    return new Response(JSON.stringify({ success: true, fields }), { headers })
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 200, headers },
    )
  }
})
