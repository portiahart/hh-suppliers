-- suppliers_assessment: Happy Supplier Test results per supplier
create table if not exists suppliers_assessment (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid not null references accounts_suppliers(id) on delete cascade,
  answers      jsonb not null default '{}',
  total_score  integer not null default 0,
  pass         boolean not null default false,
  assessed_at  timestamptz not null default now(),
  assessed_by  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (supplier_id)
);

create index if not exists suppliers_assessment_supplier_id_idx on suppliers_assessment(supplier_id);

alter table suppliers_assessment enable row level security;

create policy "staff_read_suppliers_assessment"
  on suppliers_assessment for select to authenticated using (true);

create policy "staff_insert_suppliers_assessment"
  on suppliers_assessment for insert to authenticated with check (true);

create policy "staff_update_suppliers_assessment"
  on suppliers_assessment for update to authenticated using (true);
