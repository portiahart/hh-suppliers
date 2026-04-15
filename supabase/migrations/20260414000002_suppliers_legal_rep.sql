alter table suppliers_legal
  add column if not exists rep_legal_nombre    text,
  add column if not exists rep_legal_documento text;
