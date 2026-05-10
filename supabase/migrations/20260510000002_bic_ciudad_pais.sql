-- Location fallback fields from DATABASEOLD cols I (Ciudad) and K (País)
ALTER TABLE public.accounts_suppliers
  ADD COLUMN IF NOT EXISTS bic_ciudad TEXT,
  ADD COLUMN IF NOT EXISTS bic_pais   TEXT;
