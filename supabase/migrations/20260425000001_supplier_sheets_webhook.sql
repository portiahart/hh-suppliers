-- Database webhook: push accounts_suppliers rows to Google Sheets on insert/update.
--
-- Before running this migration, replace YOUR_PROJECT_REF below with your
-- Supabase project ref (the subdomain in your Supabase URL, e.g. "abcdefghij").
--
-- You can find it at: Settings → General → Reference ID in the Supabase dashboard.

DROP TRIGGER IF EXISTS sync_supplier_to_sheets ON public.accounts_suppliers;

CREATE TRIGGER sync_supplier_to_sheets
AFTER INSERT OR UPDATE ON public.accounts_suppliers
FOR EACH ROW
EXECUTE FUNCTION supabase_functions.http_request(
  'https://dqfrqjsbfmwtclkclmvc.supabase.co/functions/v1/sync-supplier-to-sheets',
  'POST',
  '{"Content-Type":"application/json"}',
  '{}',
  '5000'
);
