import type { RUTData, RetencionRecomendada } from './rutTypes'

type ConceptoFuente = 'COMPRAS' | 'SERVICIOS' | 'HONORARIOS' | 'TRANSPORTE_CARGA' | 'ARRENDAMIENTO' | 'CONTRATOS_CONSTRUCCION'

function getCIIUConcept(ciiu: string): ConceptoFuente {
  const s = ciiu.slice(0, 2)
  const n = parseInt(s)
  if (n >= 1  && n <= 3)  return 'COMPRAS'
  if (n >= 10 && n <= 33) return 'COMPRAS'
  if (n >= 41 && n <= 43) return 'CONTRATOS_CONSTRUCCION'
  if (n >= 45 && n <= 47) return 'COMPRAS'
  if (n >= 49 && n <= 53) return 'TRANSPORTE_CARGA'
  if (s === '55') return 'SERVICIOS'
  if (s === '56') return 'COMPRAS'
  if (s === '68') return 'ARRENDAMIENTO'
  if (n >= 69 && n <= 75) return 'HONORARIOS'
  return 'SERVICIOS'
}

function conceptLabel(c: ConceptoFuente): string {
  const m: Record<ConceptoFuente, string> = {
    COMPRAS: 'Compras (2.5% / 3.5%)',
    SERVICIOS: 'Servicios (4% / 6%)',
    HONORARIOS: 'Honorarios (10% / 11%)',
    TRANSPORTE_CARGA: 'Transporte de carga (1%)',
    ARRENDAMIENTO: 'Arrendamiento (4%)',
    CONTRATOS_CONSTRUCCION: 'Contratos de construcción (2%)',
  }
  return m[c]
}

// ─── Cartagena ReteICA 2026 ───────────────────────────────────────────────────
// Rates confirmed by accountant. Stored as percentages (%).
// ⚠️ To update: change these two constants only.
const ICA_SERVICIOS = 0.856  // % — all service activities
const ICA_PRODUCTOS = 0.7    // % — commercial, industrial, construction, transport
                              // ⚠️ confirm exact value with accountant

function getICATarifa(ciiu: string): number {
  const s = ciiu.slice(0, 2)
  const n = parseInt(s)
  if (n >= 1  && n <= 3)  return 0              // Agropecuario — exento
  if (n >= 10 && n <= 53) return ICA_PRODUCTOS  // Industrial, construcción, comercio, transporte
  if (s === '55' || s === '56') return ICA_PRODUCTOS  // Alojamiento y restaurantes
  return ICA_SERVICIOS
}

// ─── 2026 constants ───────────────────────────────────────────────────────────
// Source: Decreto 1474 del 29 diciembre 2025
const UVT_2026    = 52374
const BASE_10_UVT = UVT_2026 * 10  // $523,740 — compras, construcción
const BASE_2_UVT  = UVT_2026 * 2   // $104,748 — servicios, transporte
const BASE_ICA    = 437726         // 25% SMLMV 2026

export function computeRetenciones(rut: RUTData): RetencionRecomendada[] {
  const results: RetencionRecomendada[] = []

  const isSIMPLE         = rut.regimen_simple || rut.responsabilidades.includes('47')
  const isAutorretenedor = rut.autorretenedor  || rut.responsabilidades.includes('15')
  const isDeclarante     = rut.declarante_renta || rut.tipo_persona === 'JURIDICA' || rut.responsabilidades.includes('05')
  const isResponsableIVA = rut.responsable_iva  || rut.responsabilidades.includes('48')
  const isJuridica       = rut.tipo_persona === 'JURIDICA'

  const allCIIUs = [
    rut.actividad_principal?.codigo,
    rut.actividad_secundaria?.codigo,
    ...(rut.otras_actividades ?? [])
  ].filter(Boolean) as string[]

  const primaryCIIU    = rut.actividad_principal?.codigo ?? allCIIUs[0] ?? null
  const uniqueConcepts = [...new Set(allCIIUs.map(getCIIUConcept))]
  const multiConcepts  = uniqueConcepts.length > 1

  // ── RetenFuente ──────────────────────────────────────────────────────────
  if (isSIMPLE) {
    results.push({
      retencion_tipo: 'Retefuente',
      concepto: 'No aplica — Régimen Simple de Tributación',
      tarifa_recomendada: 0,
      base_minima: null,
      aplica: false,
      notas: 'Proveedor en RST — no sujeto a retención en la fuente (Art. 911 ET).',
    })
  } else if (isAutorretenedor) {
    results.push({
      retencion_tipo: 'Retefuente',
      concepto: 'No aplica — Autorretenedor',
      tarifa_recomendada: 0,
      base_minima: null,
      aplica: false,
      notas: 'Código 15 en RUT. Proveedor retiene en nombre propio — no retener.',
    })
  } else if (multiConcepts) {
    results.push({
      retencion_tipo: 'Retefuente',
      concepto: 'Múltiples actividades — revisar por tipo de compra',
      tarifa_recomendada: null,
      base_minima: null,
      aplica: true,
      notas: `Tarifas posibles: ${uniqueConcepts.map(conceptLabel).join(' / ')}.`,
    })
  } else {
    const concepto = uniqueConcepts[0] ?? 'SERVICIOS'
    let tarifa: number, base: number, label: string
    switch (concepto) {
      case 'COMPRAS':
        tarifa = isDeclarante ? 2.5 : 3.5
        base = BASE_10_UVT
        label = `Compras — ${isDeclarante ? 'declarante' : 'no declarante'}`
        break
      case 'HONORARIOS':
        tarifa = isJuridica ? 11 : 10
        base = 0
        label = `Honorarios — persona ${isJuridica ? 'jurídica' : 'natural'}`
        break
      case 'TRANSPORTE_CARGA':
        tarifa = 1
        base = BASE_2_UVT
        label = 'Transporte de carga'
        break
      case 'ARRENDAMIENTO':
        tarifa = 4
        base = 0
        label = 'Arrendamiento bienes muebles'
        break
      case 'CONTRATOS_CONSTRUCCION':
        tarifa = 2
        base = BASE_10_UVT
        label = 'Contratos de construcción'
        break
      default:
        tarifa = isDeclarante ? 4 : 6
        base = BASE_2_UVT
        label = `Servicios generales — ${isDeclarante ? 'declarante' : 'no declarante'}`
    }
    results.push({
      retencion_tipo: 'Retefuente',
      concepto: label,
      tarifa_recomendada: tarifa,
      base_minima: base,
      aplica: true,
      notas: `Base mínima $${base.toLocaleString('es-CO')} (UVT 2026: ${UVT_2026.toLocaleString('es-CO')}).`,
    })
  }

  // ── ReteICA ──────────────────────────────────────────────────────────────
  const icaSection  = primaryCIIU?.slice(0, 2) ?? null
  const isExentoICA = icaSection !== null && parseInt(icaSection) >= 1 && parseInt(icaSection) <= 3
  const icaTarifa   = primaryCIIU ? getICATarifa(primaryCIIU) : ICA_SERVICIOS

  results.push({
    retencion_tipo: 'ReteICA',
    concepto: isExentoICA
      ? 'No aplica — actividad agropecuaria'
      : `Cartagena — CIIU ${primaryCIIU ?? 'no registrado'}`,
    tarifa_recomendada: isExentoICA ? 0 : icaTarifa,
    base_minima: isExentoICA ? null : BASE_ICA,
    aplica: !isExentoICA,
    notas: isExentoICA
      ? 'Sector agropecuario exento de ICA en Cartagena.'
      : `Base mínima $${BASE_ICA.toLocaleString('es-CO')} (25% SMLMV 2026).`,
  })

  // ── ReteIVA ──────────────────────────────────────────────────────────────
  // HH is NOT gran contribuyente.
  // Rule (Art. 437-2 ET): ReteIVA only applies when paying a persona natural
  // no declarante for an IVA-taxed service. Never applies to personas jurídicas.
  const primaryConcept = uniqueConcepts[0] ?? 'SERVICIOS'
  const isIVAExcluded  = primaryConcept === 'COMPRAS' || primaryConcept === 'TRANSPORTE_CARGA'

  if (isJuridica) {
    results.push({
      retencion_tipo: 'ReteIVA',
      concepto: 'No aplica — proveedor persona jurídica',
      tarifa_recomendada: 0,
      base_minima: null,
      aplica: false,
      notas: 'Agente retenedor no es gran contribuyente — ReteIVA no aplica sobre pagos a personas jurídicas (Art. 437-2 ET).',
    })
  } else if (!isResponsableIVA) {
    results.push({
      retencion_tipo: 'ReteIVA',
      concepto: 'No aplica — no responsable de IVA',
      tarifa_recomendada: 0,
      base_minima: null,
      aplica: false,
      notas: 'Proveedor no responsable de IVA.',
    })
  } else if (isIVAExcluded) {
    results.push({
      retencion_tipo: 'ReteIVA',
      concepto: 'No aplica — actividad excluida de IVA',
      tarifa_recomendada: 0,
      base_minima: null,
      aplica: false,
      notas: 'Compras de bienes y transporte generalmente excluidos de IVA (Art. 476 ET).',
    })
  } else if (!isDeclarante) {
    results.push({
      retencion_tipo: 'ReteIVA',
      concepto: '15% del IVA facturado',
      tarifa_recomendada: 15,
      base_minima: BASE_2_UVT,
      aplica: true,
      notas: 'Retener 15% del IVA facturado (Art. 437-2 ET).',
    })
  } else {
    results.push({
      retencion_tipo: 'ReteIVA',
      concepto: 'No aplica — persona natural declarante',
      tarifa_recomendada: 0,
      base_minima: null,
      aplica: false,
      notas: 'Agente retenedor no es gran contribuyente — ReteIVA no aplica sobre servicios de personas naturales declarantes.',
    })
  }

  return results
}
