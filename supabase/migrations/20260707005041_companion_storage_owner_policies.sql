drop policy if exists "Companion owner storage insert" on storage.objects;
drop policy if exists "Companion owner storage select" on storage.objects;
drop policy if exists "Companion owner storage update" on storage.objects;
drop policy if exists "Companion owner storage delete" on storage.objects;

alter policy "Public insert"
on storage.objects
with check (
  bucket_id = 'mapartforge'
  and (
    name like 'images/%'
    or name like 'previews/%'
  )
  and name <> 'diagnostics'
  and name not like 'diagnostics/%'
  and name not like 'companion/%'
);

create policy "Companion owner storage insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'mapartforge'
  and split_part(name, '/', 1) = 'companion'
  and split_part(name, '/', 2) = (select auth.uid())::text
);

create policy "Companion owner storage select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'mapartforge'
  and split_part(name, '/', 1) = 'companion'
  and split_part(name, '/', 2) = (select auth.uid())::text
);

create policy "Companion owner storage update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'mapartforge'
  and split_part(name, '/', 1) = 'companion'
  and split_part(name, '/', 2) = (select auth.uid())::text
)
with check (
  bucket_id = 'mapartforge'
  and split_part(name, '/', 1) = 'companion'
  and split_part(name, '/', 2) = (select auth.uid())::text
);

create policy "Companion owner storage delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'mapartforge'
  and split_part(name, '/', 1) = 'companion'
  and split_part(name, '/', 2) = (select auth.uid())::text
);
