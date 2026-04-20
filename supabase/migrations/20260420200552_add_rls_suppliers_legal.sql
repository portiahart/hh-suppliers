-- Add RLS policies for suppliers_legal so authenticated users can read and write
-- (mirrors the open policy on accounts_suppliers)

ALTER TABLE suppliers_legal ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can select suppliers_legal" ON suppliers_legal;
DROP POLICY IF EXISTS "Authenticated users can insert suppliers_legal" ON suppliers_legal;
DROP POLICY IF EXISTS "Authenticated users can update suppliers_legal" ON suppliers_legal;

CREATE POLICY "Authenticated users can select suppliers_legal"
  ON suppliers_legal FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert suppliers_legal"
  ON suppliers_legal FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update suppliers_legal"
  ON suppliers_legal FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
