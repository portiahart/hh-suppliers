-- Patch tables that may have been created manually before migrations ran,
-- ensuring all required columns exist.

-- suppliers_assessment
alter table suppliers_assessment
  add column if not exists answers      jsonb        not null default '{}',
  add column if not exists total_score  integer      not null default 0,
  add column if not exists pass         boolean      not null default false,
  add column if not exists assessed_at  timestamptz  not null default now(),
  add column if not exists assessed_by  text,
  add column if not exists updated_at   timestamptz  not null default now();

-- Ensure unique constraint
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'suppliers_assessment'::regclass
      and contype = 'u'
      and conname = 'suppliers_assessment_supplier_id_key'
  ) then
    alter table suppliers_assessment add constraint suppliers_assessment_supplier_id_key unique (supplier_id);
  end if;
end $$;

-- RLS + policies (idempotent)
alter table suppliers_assessment enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='suppliers_assessment' and policyname='staff_read_suppliers_assessment') then
    create policy "staff_read_suppliers_assessment" on suppliers_assessment for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='suppliers_assessment' and policyname='staff_insert_suppliers_assessment') then
    create policy "staff_insert_suppliers_assessment" on suppliers_assessment for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='suppliers_assessment' and policyname='staff_update_suppliers_assessment') then
    create policy "staff_update_suppliers_assessment" on suppliers_assessment for update to authenticated using (true);
  end if;
end $$;

-- suppliers_documents
alter table suppliers_documents
  add column if not exists document_type   text         not null default 'Otro',
  add column if not exists storage_path    text         not null default '',
  add column if not exists file_name       text         not null default '',
  add column if not exists file_size_bytes bigint,
  add column if not exists mime_type       text,
  add column if not exists uploaded_by     text,
  add column if not exists updated_at      timestamptz  not null default now();

alter table suppliers_documents enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='suppliers_documents' and policyname='staff_read_suppliers_documents') then
    create policy "staff_read_suppliers_documents" on suppliers_documents for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='suppliers_documents' and policyname='staff_insert_suppliers_documents') then
    create policy "staff_insert_suppliers_documents" on suppliers_documents for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='suppliers_documents' and policyname='staff_delete_suppliers_documents') then
    create policy "staff_delete_suppliers_documents" on suppliers_documents for delete to authenticated using (true);
  end if;
end $$;

-- suppliers_banking
alter table suppliers_banking
  add column if not exists nombre_beneficiario           text,
  add column if not exists banco                         text,
  add column if not exists tipo_cuenta                   text,
  add column if not exists numero_cuenta                 text,
  add column if not exists tipo_documento_bancolombia    text,
  add column if not exists verificacion_notas            text,
  add column if not exists verificado_at                 timestamptz,
  add column if not exists verificado_por                text,
  add column if not exists updated_at                    timestamptz not null default now();

alter table suppliers_banking enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='suppliers_banking' and policyname='staff_read_suppliers_banking') then
    create policy "staff_read_suppliers_banking" on suppliers_banking for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='suppliers_banking' and policyname='staff_insert_suppliers_banking') then
    create policy "staff_insert_suppliers_banking" on suppliers_banking for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='suppliers_banking' and policyname='staff_update_suppliers_banking') then
    create policy "staff_update_suppliers_banking" on suppliers_banking for update to authenticated using (true);
  end if;
end $$;

-- suppliers_legal
alter table suppliers_legal
  add column if not exists codigo_tributario  text,
  add column if not exists ciiu               text,
  add column if not exists direccion          text,
  add column if not exists ciudad             text,
  add column if not exists pais               text,
  add column if not exists proximity_zone     text,
  add column if not exists updated_at         timestamptz not null default now();

alter table suppliers_legal enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='suppliers_legal' and policyname='staff_read_suppliers_legal') then
    create policy "staff_read_suppliers_legal" on suppliers_legal for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='suppliers_legal' and policyname='staff_insert_suppliers_legal') then
    create policy "staff_insert_suppliers_legal" on suppliers_legal for insert to authenticated with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='suppliers_legal' and policyname='staff_update_suppliers_legal') then
    create policy "staff_update_suppliers_legal" on suppliers_legal for update to authenticated using (true);
  end if;
end $$;
