import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Pre-filtered query builder for accounts_suppliers.
// Excludes internal staff entries whose name starts with "X -".
export function suppliersQuery(select = '*') {
  return supabase
    .from('accounts_suppliers')
    .select(select)
    .not('name', 'ilike', 'X -%')
}
