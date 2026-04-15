import { RUTData } from './rutTypes'

export async function parseRUT(fileUrl: string): Promise<RUTData> {
  const fileResponse = await fetch(fileUrl)
  const blob = await fileResponse.blob()
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(blob)
  })

  const mimeType = blob.type || 'application/pdf'
  const isImage = mimeType.startsWith('image/')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const content: any[] = [
    isImage
      ? { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } }
      : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
    { type: 'text', text: 'Parse this RUT and return JSON only.' }
  ]

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `You are a precise Colombian tax document parser for DIAN RUT forms (Formulario 001).

CRITICAL READING RULES — follow exactly:

1. ECONOMIC ACTIVITY CODES — there are up to four separate codes on the RUT:
   - Field 46: Actividad principal código (4 digits)
   - Field 48: Actividad secundaria código (4 digits)
   - Field 50: Otras actividades — there may be TWO codes in this row, each 4 digits
   Read all four slots independently. Do not collapse or deduplicate them.

2. RESPONSABILIDADES GRID — field 53 is a numbered grid (boxes 1–26).
   Each filled box contains a 1 or 2-digit code. Read every filled box.
   The text labels below the grid confirm the codes — cross-check both.
   Look specifically for code 15 (Autorretenedor) — it is critical and easy to miss.

3. Numbers in the RUT are spaced character by character. Reassemble without spaces.
   "9 0 0 9 7 2 3 4 1" = "900972341"

4. Derivation rules — compute these from responsabilidades, do not guess:
   - autorretenedor: true only if codes contain "15"
   - regimen_simple: true only if codes contain "47"
   - declarante_renta: true if codes contain "05" OR tipo_persona is JURIDICA
   - responsable_iva: true only if codes contain "48"

Return ONLY a valid JSON object — no preamble, no explanation, no markdown fences:

{
  "nit": string,
  "dv": string,
  "razon_social": string,
  "nombre_comercial": string | null,
  "tipo_persona": "JURIDICA" | "NATURAL",
  "ciudad": string | null,
  "departamento": string | null,
  "direccion": string | null,
  "correo": string | null,
  "responsabilidades": string[],
  "autorretenedor": boolean,
  "regimen_simple": boolean,
  "declarante_renta": boolean,
  "responsable_iva": boolean,
  "actividad_principal": { "codigo": string, "fecha_inicio": string | null } | null,
  "actividad_secundaria": { "codigo": string, "fecha_inicio": string | null } | null,
  "otras_actividades": string[],
  "establecimientos": [{ "nombre": string | null, "ciiu": string | null, "ciudad": string | null, "direccion": string | null }],
  "fecha_inscripcion": string | null
}`,
      messages: [{ role: 'user', content }]
    })
  })

  if (!response.ok) throw new Error(`Anthropic API error: ${response.status}`)
  const data = await response.json()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const text = data.content.map((b: any) => b.text || '').join('')
  const clean = text.replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(clean) as RUTData
  } catch {
    throw new Error(`RUT parse failed — model returned: ${clean.slice(0, 200)}`)
  }
}
