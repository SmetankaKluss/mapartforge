create index if not exists companion_imports_owner_sha_source_idx
  on public.companion_imports(owner_id, sha256, source, created_at desc);
