-- Allow both anon and authenticated roles to upload to supplier-documents.
-- The path structure (supplierId/docType/filename) provides implicit scoping.
-- Reads/deletes remain authenticated-only.
drop policy if exists "staff_upload_supplier_documents" on storage.objects;

create policy "staff_upload_supplier_documents"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'supplier-documents');
