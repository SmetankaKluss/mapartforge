drop policy if exists "Public insert" on storage.objects;

create policy "Public insert"
on storage.objects
for insert
to public
with check (
  bucket_id = 'mapartforge'
  and (
    name ~ '^images/[a-z0-9_-]{8,64}\.png$'
    or name ~ '^previews/[a-z0-9_-]{8,64}\.png$'
  )
  and name <> 'diagnostics'
  and name not like 'diagnostics/%'
  and name not like 'companion/%'
);
