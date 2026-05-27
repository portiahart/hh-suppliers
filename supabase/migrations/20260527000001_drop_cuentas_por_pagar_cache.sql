-- Drop legacy cuentas_por_pagar_cache table.
-- Replaced by cxp_facturas (synced from xPP sheet via sync-cxp edge function).

DROP TABLE IF EXISTS cuentas_por_pagar_cache;
