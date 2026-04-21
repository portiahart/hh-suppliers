/**
 * extract-banking
 * Accepts a Supabase Storage signed URL for a Certificado Bancario PDF or image,
 * fetches the file, sends it to Claude, and returns structured BankingFields.
 *
 * Body: { url: string }
 * Returns: { success: true, fields: BankingFields } | { success: false, error: string }
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

interface BankingFields {
  nombre_beneficiario: string | null
  banco: string | null
  tipo_cuenta: 'Ahorros' | 'Corriente' | null
  numero_cuenta: string | null
  tipo_documento_bancolombia: 'NIT' | 'CC' | 'CE' | null
}

const COLOMBIAN_BANKS = [
  'Bancolombia', 'Banco de Bogotá', 'Davivienda', 'BBVA', 'Banco Popular',
  'Banco Agrario', 'Colpatria', 'Helm Bank', 'Scotiabank Colpatria',
  'Caja Social', 'Banco Falabella', 'Nequi', 'Daviplata',
]

const SYSTEM_PROMPT = `You are a precise Colombian bank certificate parser.

You will receive a Certificación Bancaria (bank certificate) document.
Extract the following fields and return ONLY a valid JSON object with no preamble, explanation, or markdown fences.

RULES:
1. nombre_beneficiario: The full name of the account holder (titular de la cuenta). Exact as written.
2. banco: The issuing bank. Normalize to one of these exact names if possible:
   Bancolombia, Banco de Bogotá, Davivienda, BBVA, Banco Popular, Banco Agrario,
   Colpatria, Helm Bank, Scotiabank Colpatria, Caja Social, Banco Falabella, Nequi, Daviplata.
   If none match, use the bank name exactly as written.
3. tipo_cuenta: Must be exactly "Ahorros" or "Corriente". Look for "cuenta de ahorros" or "cuenta corriente".
4. numero_cuenta: The account number, digits only (no spaces or dashes).
5. tipo_documento_bancolombia: The document type of the account holder: "NIT", "CC", or "CE".
   Return null if not mentioned.

Return ONLY this JSON:`

const USER_TEMPLATE = `{
  "nombre_beneficiario": "full name of account holder",
  "banco": "normalized bank name",
  "tipo_cuenta": "Ahorros or Corriente",
  "numero_cuenta": "digits only",
  "tipo_documento_bancolombia": "NIT or CC or CE or null"
}`

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

    const fileRes = await fetch(url)
    if (!fileRes.ok) throw new Error(`Failed to fetch file: ${fileRes.status}`)
    const fileBuffer = await fileRes.arrayBuffer()
    const uint8 = new Uint8Array(fileBuffer)
    let binary = ''
    for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i])
    const base64 = btoa(binary)
    const mediaType = fileRes.headers.get('content-type') ?? 'application/pdf'

    // Choose content block type: document for PDF, image for image types
    const isImage = mediaType.startsWith('image/')
    const contentBlock = isImage
      ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }
      : { type: 'document', source: { type: 'base64', media_type: mediaType, data: base64 } }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            contentBlock,
            { type: 'text', text: `Extract the banking fields and return JSON matching this shape:\n${USER_TEMPLATE}` },
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
    const stripped = rawText.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim()
    const jsonStart = stripped.indexOf('{')
    const jsonEnd = stripped.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error(`Claude did not return JSON. Response: ${stripped.slice(0, 200)}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = JSON.parse(stripped.slice(jsonStart, jsonEnd + 1)) as Record<string, any>

    // Normalize tipo_cuenta
    const normTipoCuenta = (v: unknown): 'Ahorros' | 'Corriente' | null => {
      if (!v) return null
      const u = String(v).toUpperCase()
      if (u.includes('AHORRO')) return 'Ahorros'
      if (u.includes('CORRIENTE')) return 'Corriente'
      return null
    }

    // Normalize tipo_documento_bancolombia
    const normTipoDoc = (v: unknown): 'NIT' | 'CC' | 'CE' | null => {
      if (!v) return null
      const u = String(v).toUpperCase().trim()
      if (u === 'NIT') return 'NIT'
      if (u === 'CC') return 'CC'
      if (u === 'CE') return 'CE'
      return null
    }

    // Normalize bank name to known list
    const normBanco = (v: unknown): string | null => {
      if (!v) return null
      const raw = String(v).trim()
      const match = COLOMBIAN_BANKS.find(b =>
        raw.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(raw.toLowerCase())
      )
      return match ?? raw
    }

    const fields: BankingFields = {
      nombre_beneficiario: typeof p.nombre_beneficiario === 'string' && p.nombre_beneficiario.trim()
        ? p.nombre_beneficiario.trim() : null,
      banco: normBanco(p.banco),
      tipo_cuenta: normTipoCuenta(p.tipo_cuenta),
      numero_cuenta: p.numero_cuenta ? String(p.numero_cuenta).replace(/\D/g, '') || null : null,
      tipo_documento_bancolombia: normTipoDoc(p.tipo_documento_bancolombia),
    }

    return new Response(JSON.stringify({ success: true, fields }), { headers })
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 200, headers },
    )
  }
})
