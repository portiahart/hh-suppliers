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
