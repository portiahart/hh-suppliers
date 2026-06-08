ALTER TABLE accounts_suppliers
  ADD COLUMN IF NOT EXISTS notificar_pagos boolean DEFAULT false;
