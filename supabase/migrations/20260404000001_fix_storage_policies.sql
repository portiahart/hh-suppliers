-- Re-apply storage policies for supplier-documents bucket
-- Drop first in case they already exist with different definitions
drop policy if exists "staff_upload_supplier_documents"  on storage.objects;
drop policy if exists "staff_read_supplier_documents"    on storage.objects;
drop policy if exists "staff_delete_supplier_documents"  on storage.objects;
drop policy if exists "staff_update_supplier_documents"  on storage.objects;

create policy "staff_upload_supplier_documents"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'supplier-documents');

create policy "staff_read_supplier_documents"
  on storage.objects for select to authenticated
  using (bucket_id = 'supplier-documents');

create policy "staff_delete_supplier_documents"
  on storage.objects for delete to authenticated
  using (bucket_id = 'supplier-documents');

create policy "staff_update_supplier_documents"
  on storage.objects for update to authenticated
  using (bucket_id = 'supplier-documents')
  with check (bucket_id = 'supplier-documents');

-- Ensure bucket settings are correct
update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp']
where id = 'supplier-documents';
