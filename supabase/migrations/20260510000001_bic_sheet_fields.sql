-- BIC assessment fields synced from DATABASEOLD named range (cols AN–AU)
ALTER TABLE public.accounts_suppliers
  ADD COLUMN IF NOT EXISTS bic_survey_score   TEXT,
  ADD COLUMN IF NOT EXISTS bic_ubicacion      TEXT,
  ADD COLUMN IF NOT EXISTS bic_categoria      TEXT,
  ADD COLUMN IF NOT EXISTS bic_physical_goods TEXT,
  ADD COLUMN IF NOT EXISTS bic_independent    TEXT,
  ADD COLUMN IF NOT EXISTS bic_underserved    TEXT,
  ADD COLUMN IF NOT EXISTS bic_small_company  TEXT,
  ADD COLUMN IF NOT EXISTS bic_minoria        TEXT,
  ADD COLUMN IF NOT EXISTS bic_synced_at      TIMESTAMPTZ;
