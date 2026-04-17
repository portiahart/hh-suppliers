/**
 * extract-rut
 * Accepts a Supabase Storage signed URL for a RUT or Cámara de Comercio PDF,
 * fetches the file, sends it to Claude, and returns structured RUTData plus
 * a legacy `fields` object for backward-compatible prefill.
 *
 * Body: { url: string }
 * Returns: { success: true, rut: RUTData, fields: ExtractedFields } | { success: false, error: string }
 */

const ALLOWED_ORIGINS = new Set([
  'https://prov.portiahart.com',
  'http://localhost:5173',
])

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : '',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

// Mirrors src/lib/rutTypes.ts — kept in sync manually (Deno cannot import from src/)
interface RUTActividad { codigo: string; fecha_inicio?: string | null }
interface RUTEstablecimiento { nombre: string | null; ciiu: string | null; ciudad: string | null; direccion: string | null }
interface RUTData {
  nit: string | null
  dv: string | null
  razon_social: string | null
  nombre_comercial: string | null
  tipo_persona: 'JURIDICA' | 'NATURAL' | null
  ciudad: string | null
  departamento: string | null
  direccion: string | null
  correo: string | null
  responsabilidades: string[]
  autorretenedor: boolean
  regimen_simple: boolean
  declarante_renta: boolean
  responsable_iva: boolean
  actividad_principal: RUTActividad | null
  actividad_secundaria: RUTActividad | null
  otras_actividades: string[]
  establecimientos: RUTEstablecimiento[]
  fecha_inscripcion: string | null
}

// Prefill shape consumed by the frontend IdentidadLegalCard
interface ExtractedFields {
  tipo_persona:        'JURIDICA' | 'NATURAL' | null
  codigo_tributario:   string | null
  ciiu:                string | null
  direccion:           string | null
  ciudad:              string | null
  pais:                string | null
  email:               string | null
  telefono:            string | null
  rep_legal_nombre:    string | null
  rep_legal_documento: string | null
}

const SYSTEM_PROMPT = `You are a precise Colombian tax document parser for DIAN RUT forms (Formulario 001).

CRITICAL READING RULES — follow these exactly or the output will be wrong:

1. ECONOMIC ACTIVITY CODES — there are up to four separate codes on the RUT:
   - Field 46: Actividad principal código (4 digits)
   - Field 48: Actividad secundaria código (4 digits)
   - Field 50: Otras actividades — there may be TWO codes in this row, each 4 digits
   Read all four slots independently. Do not collapse them. Do not repeat the same code.

2. RESPONSABILIDADES GRID — field 53 is a numbered grid (boxes 1–26).
   Each filled box contains a 1 or 2-digit code. Read every filled box.
   Common codes you will see: 05, 06, 07, 09, 10, 11, 12, 14, 15, 16, 22, 24, 26, 32, 33, 35, 38, 42, 43, 45, 47, 48, 52, 53, 55.
   The text labels below the grid (e.g. "05- Impto. renta...") confirm the codes — use both the grid numbers AND the text labels to cross-check.
   Look specifically for code 15 (Autorretenedor) — it is critical and easy to miss.

3. AUTORRETENEDOR — If you see code 15 anywhere in the responsabilidades, or if the text "Autorretenedor" appears in the labels, set autorretenedor: true. Otherwise false.

4. Numbers in the RUT are spaced character by character. "9 0 0 9 7 2 3 4 1" = "900972341". Reassemble them.

5. LEGAL REPRESENTATIVE — In Hoja 3 (Representación), find only the row labelled REPRS LEGAL PRIN (code 18). Ignore REPRS LEGAL SUPL (code 19) entirely.
   Name fields: 104=primer_apellido, 105=segundo_apellido, 106=primer_nombre, 107=otros_nombres.
   Document number: field 101 (digits only).

Return ONLY a valid JSON object with no preamble, no explanation, no markdown fences:`

const USER_TEMPLATE = `
{
  "nit": "digits only, no spaces",
  "dv": "single digit",
  "razon_social": "field 35, exact as written",
  "nombre_comercial": "field 36, or null",
  "tipo_persona": "JURIDICA or NATURAL",
  "ciudad": "field 40",
  "departamento": "field 39",
  "direccion": "field 41",
  "correo": "field 42, lowercase",
  "telefono": "field 44, prefix +57 if Colombian",
  "responsabilidades": ["05","07"],
  "autorretenedor": false,
  "regimen_simple": false,
  "declarante_renta": true,
  "responsable_iva": true,
  "actividad_principal": { "codigo": "5011", "fecha_inicio": "2016-05-16" },
  "actividad_secundaria": { "codigo": "7310", "fecha_inicio": "2025-01-02" },
  "otras_actividades": ["5511", "5611"],
  "rep_primer_apellido": "field 104 REPRS LEGAL PRIN only",
  "rep_segundo_apellido": "field 105 REPRS LEGAL PRIN only, null if blank",
  "rep_primer_nombre": "field 106 REPRS LEGAL PRIN only",
  "rep_otros_nombres": "field 107 REPRS LEGAL PRIN only, null if blank",
  "rep_documento": "field 101 REPRS LEGAL PRIN only, digits only",
  "establecimientos": [
    { "nombre": "THE PINK MANGO", "ciiu": "5611", "ciudad": "Cartagena", "direccion": "CORR TIERRA BOMBA SEC PLAYA LINDA" }
  ],
  "fecha_inscripcion": "2016-05-11"
}

Derivation rules (compute from responsabilidades — do not ask):
- autorretenedor: true if responsabilidades contains "15"
- regimen_simple: true if responsabilidades contains "47"
- declarante_renta: true if responsabilidades contains "05" OR tipo_persona is JURIDICA
- responsable_iva: true if responsabilidades contains "48"`

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders(req) })
  }

  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }

  try {
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured')

    const { url } = await req.json() as { url: string }
    if (!url) throw new Error('Missing url in request body')

    const pdfRes = await fetch(url)
    if (!pdfRes.ok) throw new Error(`Failed to fetch PDF: ${pdfRes.status}`)
    const pdfBuffer = await pdfRes.arrayBuffer()
    const uint8 = new Uint8Array(pdfBuffer)
    let binary = ''
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
    const base64 = btoa(binary)
    const mediaType = pdfRes.headers.get('content-type') ?? 'application/pdf'

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } },
            { type: 'text', text: `Extract all fields from this RUT and return JSON matching this shape:\n${USER_TEMPLATE}` },
          ],
        }],
      }),
    })

    if (!claudeRes.ok) {
      const body = await claudeRes.text()
      throw new Error(`Claude API error (${claudeRes.status}): ${body}`)
    }

    const claudeData = await claudeRes.json()
    const rawText: string = claudeData.content?.[0]?.text ?? ''
    const jsonText = rawText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = JSON.parse(jsonText) as Record<string, any>

    // Build rep legal display name: [primer_nombre] [otros_nombres] [primer_apellido] [segundo_apellido]
    const nameParts = [p.rep_primer_nombre, p.rep_otros_nombres, p.rep_primer_apellido, p.rep_segundo_apellido]
      .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    const rep_legal_nombre = nameParts.length > 0 ? nameParts.join(' ') : null

    const responsabilidades: string[] = Array.isArray(p.responsabilidades)
      ? p.responsabilidades.map(String)
      : []

    const rut: RUTData = {
      nit:               p.nit ? String(p.nit).replace(/\D/g, '') || null : null,
      dv:                p.dv ?? null,
      razon_social:      p.razon_social ?? null,
      nombre_comercial:  p.nombre_comercial ?? null,
      tipo_persona:      (p.tipo_persona === 'JURIDICA' || p.tipo_persona === 'NATURAL') ? p.tipo_persona : null,
      ciudad:            p.ciudad ?? null,
      departamento:      p.departamento ?? null,
      direccion:         p.direccion ?? null,
      correo:            typeof p.correo === 'string' ? p.correo.toLowerCase().trim() : null,
      responsabilidades,
      autorretenedor:    Boolean(p.autorretenedor),
      regimen_simple:    Boolean(p.regimen_simple),
      declarante_renta:  Boolean(p.declarante_renta),
      responsable_iva:   Boolean(p.responsable_iva),
      actividad_principal:   p.actividad_principal ?? null,
      actividad_secundaria:  p.actividad_secundaria ?? null,
      otras_actividades: Array.isArray(p.otras_actividades) ? p.otras_actividades.map(String) : [],
      establecimientos:  Array.isArray(p.establecimientos) ? p.establecimientos : [],
      fecha_inscripcion: p.fecha_inscripcion ?? null,
    }

    // Legacy prefill shape for IdentidadLegalCard
    const fields: ExtractedFields = {
      tipo_persona:        rut.tipo_persona,
      codigo_tributario:   responsabilidades.length > 0 ? responsabilidades.join('-') : null,
      ciiu:                rut.actividad_principal?.codigo ?? null,
      direccion:           rut.direccion,
      ciudad:              rut.ciudad,
      pais:                rut.departamento ? 'Colombia' : null,
      email:               rut.correo,
      telefono:            typeof p.telefono === 'string' ? p.telefono : null,
      rep_legal_nombre,
      rep_legal_documento: p.rep_documento ? String(p.rep_documento).replace(/\D/g, '') || null : null,
    }

    return new Response(JSON.stringify({ success: true, rut, fields }), { headers })
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 200, headers },
    )
  }
})
