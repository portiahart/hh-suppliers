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
}
