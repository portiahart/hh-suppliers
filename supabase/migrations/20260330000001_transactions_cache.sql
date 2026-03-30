-- ── Table 1: transactions_cache ──────────────────────────────────────────────
-- Caches expense rows from BANCOS, CASHAPP, TARSCOL, EXTRA named ranges.
-- Full reload per source on each sync (DELETE + INSERT).

CREATE TABLE IF NOT EXISTS transactions_cache (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source            text NOT NULL CHECK (source IN ('BANCOS','CASHAPP','TARSCOL','EXTRA')),
  fecha_operacion   date,
  fecha_factura     date,
  fecha_vencimiento date,
  proveedor         text,
  nit               text,
  importe_cop       numeric(15,2),
  monto_base        numeric(15,2),
  total_iva         numeric(15,2),
  total_ipc         numeric(15,2),
  rete_fuente       numeric(15,2),
  rete_ica          numeric(15,2),
  concepto          text,
  tipo_egreso       text,
  centro_costo      text,
  tipo_documento    text,
  empresa_raw       text,
  empresa           text,
  empresa_split     jsonb,
  no_fac            text,
  moneda            text,
  pagado            text,
  aprobado          text,
  orden_prioridad   text,
  doc_url           text,
  synced_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS transactions_cache_fecha_factura_idx  ON transactions_cache(fecha_factura);
CREATE INDEX IF NOT EXISTS transactions_cache_nit_idx            ON transactions_cache(nit);
CREATE INDEX IF NOT EXISTS transactions_cache_empresa_idx        ON transactions_cache(empresa);

ALTER TABLE transactions_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_transactions_cache"
  ON transactions_cache FOR SELECT TO authenticated USING (true);


-- ── Table 2: cuentas_por_pagar_cache ─────────────────────────────────────────
-- Caches outstanding payables from the CPP named range.
-- Same structure as transactions_cache minus pagado/aprobado (nothing in CPP is paid).

CREATE TABLE IF NOT EXISTS cuentas_por_pagar_cache (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source            text NOT NULL DEFAULT 'CPP',
  fecha_operacion   date,
  fecha_factura     date,
  fecha_vencimiento date,
  proveedor         text,
  nit               text,
  importe_cop       numeric(15,2),
  monto_base        numeric(15,2),
  total_iva         numeric(15,2),
  total_ipc         numeric(15,2),
  rete_fuente       numeric(15,2),
  rete_ica          numeric(15,2),
  concepto          text,
  tipo_egreso       text,
  centro_costo      text,
  tipo_documento    text,
  empresa_raw       text,
  empresa           text,
  empresa_split     jsonb,
  no_fac            text,
  moneda            text,
  orden_prioridad   text,
  doc_url           text,
  synced_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cuentas_por_pagar_cache_fecha_vencimiento_idx ON cuentas_por_pagar_cache(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS cuentas_por_pagar_cache_fecha_factura_idx     ON cuentas_por_pagar_cache(fecha_factura);
CREATE INDEX IF NOT EXISTS cuentas_por_pagar_cache_nit_idx               ON cuentas_por_pagar_cache(nit);
CREATE INDEX IF NOT EXISTS cuentas_por_pagar_cache_empresa_idx           ON cuentas_por_pagar_cache(empresa);

ALTER TABLE cuentas_por_pagar_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_read_cuentas_por_pagar_cache"
  ON cuentas_por_pagar_cache FOR SELECT TO authenticated USING (true);
