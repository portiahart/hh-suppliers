-- Add pago_inmediato flag to accounts_suppliers.
-- Tracks whether a supplier is paid immediately (vs. via bank transfer / PSE).
-- Imported once from DATABASEOLD col N; managed manually in-app thereafter.
ALTER TABLE accounts_suppliers
  ADD COLUMN IF NOT EXISTS pago_inmediato boolean DEFAULT false;
