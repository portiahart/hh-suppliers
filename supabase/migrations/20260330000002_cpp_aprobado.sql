-- Add aprobado column to cuentas_por_pagar_cache.
-- Needed for the dashboard "Facturas Aprobadas / Pendiente" cards.

ALTER TABLE cuentas_por_pagar_cache
  ADD COLUMN IF NOT EXISTS aprobado text;
