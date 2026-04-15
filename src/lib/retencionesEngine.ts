import type { RUTData, RetencionRecomendada } from './rutTypes'

type ConceptoFuente = 'COMPRAS' | 'SERVICIOS' | 'HONORARIOS' | 'TRANSPORTE_CARGA' | 'ARRENDAMIENTO' | 'CONTRATOS_CONSTRUCCION'

function getCIIUConcept(ciiu: string): ConceptoFuente {
  const s = ciiu.slice(0, 2)
  const n = parseInt(s)
  if (n >= 1 && n <= 3)   return 'COMPRAS'
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

const ICA_TARIFAS: Record<string, number> = {
  '01': 0, '02': 0, '03': 0,
  '10': 3.5, '11': 3.5, '12': 3.5, '13': 3.5, '14': 3.5,
  '15': 3.5, '16': 3.5, '17': 3.5, '18': 3.5, '19': 3.5,
  '20': 3.5, '21': 3.5, '22': 3.5, '23': 3.5, '24': 3.5,
  '25': 3.5, '26': 3.5, '27': 3.5, '28': 3.5, '29': 3.5,
  '30': 3.5, '31': 3.5, '32': 3.5, '33': 3.5,
  '41': 3.5, '42': 3.5, '43': 3.5,
  '45': 4.14, '46': 4.14, '47': 4.14,
  '49': 4.14, '50': 4.14, '51': 4.14, '52': 4.14, '53': 4.14,
  '55': 4.14, '56': 4.14,
  '58': 4.83, '59': 4.83, '60': 4.83, '61': 4.83, '62': 4.83, '63': 4.83,
  '64': 5.0,  '65': 5.0,  '66': 5.0,
  '68': 5.0,
  '69': 4.83, '70': 4.83, '71': 4.83, '72': 4.83, '73': 4.83, '74': 4.83, '75': 4.83,
  '77': 4.83, '78': 4.83, '79': 4.83, '80': 4.83, '81': 4.83, '82': 4.83,
  '85': 4.14, '86': 4.14, '87': 4.14, '88': 4.14,
  '90': 9.66, '91': 9.66, '92': 9.66, '93': 9.66,
}

const UVT_2026    = 49799
const BASE_10_UVT = UVT_2026 * 10   // 497,990
const BASE_2_UVT  = UVT_2026 * 2    //  99,598
const BASE_ICA    = 437726           // 25% SMLMV 2026

export function computeRetenciones(rut: RUTData): RetencionRecomendada[] {
  const results: RetencionRecomendada[] = []

  const isSIMPLE         = rut.regimen_simple || rut.responsabilidades.includes('47')
  const isAutorretenedor = rut.autorretenedor  || rut.responsabilidades.includes('15')
  const isDeclarante     = rut.declarante_renta || rut.tipo_persona === 'JURIDICA' || rut.responsabilidades.includes('05')
  const isResponsableIVA = rut.responsable_iva  || rut.responsabilidades.includes('48')

  const allCIIUs = [
    rut.actividad_principal?.codigo,
    rut.actividad_secundaria?.codigo,
    ...(rut.otras_actividades ?? [])
  ].filter(Boolean) as string[]

  const primaryCIIU     = rut.actividad_principal?.codigo ?? allCIIUs[0] ?? null
  const uniqueConcepts  = [...new Set(allCIIUs.map(getCIIUConcept))]
  const multiConcepts   = uniqueConcepts.length > 1

  // ── Retefuente ──────────────────────────────────────────────────────────
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
      notas: `CIIU registrados: ${allCIIUs.join(', ')}. Tarifa depende del concepto de cada factura: ${uniqueConcepts.map(conceptLabel).join(' / ')}.`,
    })
  } else {
    const concepto = uniqueConcepts[0] ?? 'SERVICIOS'
    let tarifa: number, base: number, label: string
    switch (concepto) {
      case 'COMPRAS':
        tarifa = isDeclarante ? 2.5 : 3.5; base = BASE_10_UVT
        label = `Compras — ${isDeclarante ? 'declarante' : 'no declarante'}`; break
      case 'HONORARIOS':
        tarifa = rut.tipo_persona === 'JURIDICA' ? 11 : 10; base = 0
        label = `Honorarios — persona ${rut.tipo_persona === 'JURIDICA' ? 'jurídica' : 'natural'}`; break
      case 'TRANSPORTE_CARGA':
        tarifa = 1; base = BASE_2_UVT; label = 'Transporte de carga'; break
      case 'ARRENDAMIENTO':
        tarifa = 4; base = 0; label = 'Arrendamiento bienes muebles'; break
      case 'CONTRATOS_CONSTRUCCION':
        tarifa = 2; base = BASE_10_UVT; label = 'Contratos de construcción'; break
      default:
        tarifa = isDeclarante ? 4 : 6; base = BASE_2_UVT
        label = `Servicios generales — ${isDeclarante ? 'declarante' : 'no declarante'}`
    }
    results.push({
      retencion_tipo: 'Retefuente', concepto: label,
      tarifa_recomendada: tarifa, base_minima: base, aplica: true,
      notas: `CIIU ${primaryCIIU ?? 'no registrado'}. UVT 2026: ${UVT_2026.toLocaleString('es-CO')}.`,
    })
  }

  // ── ReteICA ──────────────────────────────────────────────────────────────
  const icaSection   = primaryCIIU?.slice(0, 2) ?? null
  const icaTarifa    = icaSection ? (ICA_TARIFAS[icaSection] ?? 4.14) : 4.14
  const isExentoICA  = icaSection !== null && ['01','02','03'].includes(icaSection)
  results.push({
    retencion_tipo: 'ReteICA',
    concepto: isExentoICA ? 'No aplica — actividad agropecuaria' : `Cartagena — CIIU ${primaryCIIU ?? 'no registrado'}`,
    tarifa_recomendada: isExentoICA ? 0 : icaTarifa,
    base_minima: isExentoICA ? null : BASE_ICA,
    aplica: !isExentoICA,
    notas: isExentoICA
      ? 'Sector agropecuario exento de ICA en Cartagena.'
      : `Tarifa en ‰ — Acuerdo 41/2006. Base mínima 25% SMLMV 2026 (${BASE_ICA.toLocaleString('es-CO')}). Verificar autorretenedor ICA con Secretaría de Hacienda Distrital por separado.`,
  })

  // ── ReteIVA ──────────────────────────────────────────────────────────────
  if (!isResponsableIVA) {
    results.push({
      retencion_tipo: 'ReteIVA', concepto: 'No aplica — no responsable de IVA',
      tarifa_recomendada: 0, base_minima: null, aplica: false,
      notas: 'Proveedor no responsable de IVA — no factura IVA.',
    })
  } else {
    const isGoods = (uniqueConcepts[0] ?? 'SERVICIOS') === 'COMPRAS'
    results.push({
      retencion_tipo: 'ReteIVA',
      concepto: isGoods ? 'No aplica — compra de bienes' : '15% del IVA facturado',
      tarifa_recomendada: isGoods ? 0 : 15,
      base_minima: null,
      aplica: !isGoods,
      notas: isGoods
        ? 'ReteIVA no aplica en compra de bienes.'
        : 'HH no es gran contribuyente. Aplica sobre servicios gravados — verificar caso a caso.',
    })
  }

  return results
}
