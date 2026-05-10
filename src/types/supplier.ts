export type SupplierStatus = 'ACTIVE' | 'INACTIVE'

export interface Supplier {
  id: string
  razon_social: string | null
  nombre_operativo: string | null
  nit: string | null
  documento_tipo: string | null
  tipo_persona: string | null
  email: string | null
  telefono: string | null
  categoria: string | null
  status: SupplierStatus | null
  archived_at: string | null
  created_at: string
  updated_at: string
  // BIC fields synced from DATABASEOLD sheet (cols AN–AU)
  bic_survey_score: string | null
  bic_ubicacion: string | null
  bic_categoria: string | null
  bic_physical_goods: string | null
  bic_independent: string | null
  bic_underserved: string | null
  bic_small_company: string | null
  bic_minoria: string | null
  bic_synced_at: string | null
  // Payment specifics — imported once from DATABASEOLD col N, managed in-app thereafter
  pago_inmediato: boolean | null
}
