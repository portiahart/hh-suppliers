-- Add sheet_row_num so approve-cxp can write back to the correct sheet row
ALTER TABLE cxp_facturas ADD COLUMN IF NOT EXISTS sheet_row_num integer;

-- Schedule sync-cxp every 10 minutes via pg_cron + pg_net
-- Requires pg_cron and pg_net extensions (enable in Supabase Dashboard → Database → Extensions if needed)
SELECT cron.schedule(
  'sync-cxp-every-10min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://dqfrqjsbfmwtclkclmvc.supabase.co/functions/v1/sync-cxp',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxZnJxanNiZm13dGNsa2NsbXZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3Nzg0NDQsImV4cCI6MjA4OTM1NDQ0NH0.U9KL-ir5vVLq3nPVBqXp7x69VhLAjf7Bbpn0PyM8hWw"}'::jsonb,
    body    := '{}'::jsonb
  );
  $$
);
