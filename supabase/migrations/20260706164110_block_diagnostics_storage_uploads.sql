alter policy "Public insert"
on storage.objects
with check (
  bucket_id = 'mapartforge'
  and name <> 'diagnostics'
  and name not like 'diagnostics/%'
);
