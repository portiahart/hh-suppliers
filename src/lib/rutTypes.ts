export interface RUTActividad {
  codigo: string
  fecha_inicio?: string | null
}

export interface RUTEstablecimiento {
  nombre: string | null
  ciiu: string | null
  ciudad: string | null
  direccion: string | null
}

export interface RUTData {
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

export interface RetencionRecomendada {
  retencion_tipo: 'Retefuente' | 'ReteICA' | 'ReteIVA'
  concepto: string
  tarifa_recomendada: number | null
  base_minima: number | null
  aplica: boolean
  notas: string
}
