-- Backfill tipo_persona from documento_tipo where tipo_persona is currently null.
-- NIT document → legal entity (JURIDICA)
-- CC / CE / PS / TI → natural person (NATURAL)
-- Rows where documento_tipo is null are left untouched (cannot infer reliably).

UPDATE accounts_suppliers
SET tipo_persona = 'JURIDICA'
WHERE tipo_persona IS NULL
  AND documento_tipo = 'NIT';

UPDATE accounts_suppliers
SET tipo_persona = 'NATURAL'
WHERE tipo_persona IS NULL
  AND documento_tipo IN ('CC', 'CE', 'PS', 'TI');
