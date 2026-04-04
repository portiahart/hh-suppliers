-- suppliers_documents: tracks uploaded files per supplier
create table if not exists suppliers_documents (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid not null references accounts_suppliers(id) on delete cascade,
  document_type   text not null,
  storage_path    text not null,
  file_name       text not null,
  file_size_bytes bigint,
  mime_type       text,
  uploaded_by     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists suppliers_documents_supplier_id_idx on suppliers_documents(supplier_id);

alter table suppliers_documents enable row level security;

create policy "staff_read_suppliers_documents"
  on suppliers_documents for select to authenticated using (true);

create policy "staff_insert_suppliers_documents"
  on suppliers_documents for insert to authenticated with check (true);

create policy "staff_delete_suppliers_documents"
  on suppliers_documents for delete to authenticated using (true);

-- Storage bucket: supplier-documents (private, staff-managed)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-documents',
  'supplier-documents',
  false,
  10485760,
  array['application/pdf','image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

-- Storage policies
create policy "staff_upload_supplier_documents"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'supplier-documents');

create policy "staff_read_supplier_documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'supplier-documents');

create policy "staff_delete_supplier_documents"
  on storage.objects for delete to authenticated
  using (bucket_id = 'supplier-documents');
