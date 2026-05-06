DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stg_accounts_suppliers_import'
      AND column_name = 'name'
  ) THEN
    ALTER TABLE stg_accounts_suppliers_import DROP COLUMN name;
  END IF;
END $$;
