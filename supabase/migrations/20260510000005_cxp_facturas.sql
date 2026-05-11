-- CxP Facturas — Cuentas por Pagar
-- Source of truth for payables data, imported from Google Sheets CxP tab.
-- Only rows where pagado = 'POR PAGAR' are displayed on the CxP page.

CREATE TABLE IF NOT EXISTS cxp_facturas (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Supplier
  proveedor         text,
  nit               text,

  -- Invoice
  no_factura        text,
  concepto          text,
  tipo_documento    text,
  tipo_egreso       text,

  -- Dates
  fecha_factura     date,
  fecha_vencimiento date,
  fecha_pago        date,

  -- Financials
  valor_total       numeric(15,2),
  monto_base        numeric(15,2),
  dcto              numeric(15,2),
  iva_19            numeric(15,2),
  ipc               numeric(15,2),
  iva_5             numeric(15,2),
  otros_exentos     numeric(15,2),
  tasa_retefuente   numeric(8,4),
  retefuente        numeric(15,2),
  tasa_reteica      numeric(8,4),
  reteica           numeric(15,2),

  -- Classification
  empresa           text,
  centro_costo      text,
  metodo_pago       text,

  -- Status
  pagado            text,        -- 'POR PAGAR' | 'PAGADO'
  aprobado          text,        -- 'SI' | 'NO'
  orden_prioridad   text,

  -- Documents
  doc_url           text,
  comprobante_url   text,

  -- Sheet metadata
  sheet_uuid        text,
  supabase_id       text,
  bot_email         text,

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cxp_empresa_idx    ON cxp_facturas(empresa);
CREATE INDEX IF NOT EXISTS cxp_pagado_idx     ON cxp_facturas(pagado);
CREATE INDEX IF NOT EXISTS cxp_aprobado_idx   ON cxp_facturas(aprobado);
CREATE INDEX IF NOT EXISTS cxp_vcto_idx       ON cxp_facturas(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS cxp_nit_idx        ON cxp_facturas(nit);
CREATE INDEX IF NOT EXISTS cxp_proveedor_idx  ON cxp_facturas(proveedor);

ALTER TABLE cxp_facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cxp_select" ON cxp_facturas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "cxp_write" ON cxp_facturas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
