drop policy if exists "profiles owner read" on public.profiles;
drop policy if exists "profiles owner insert" on public.profiles;
drop policy if exists "profiles owner update" on public.profiles;

create policy "profiles owner read" on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles owner insert" on public.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles owner update" on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "arts owner read write" on public.arts;
drop policy if exists "arts unlisted public read" on public.arts;
drop policy if exists "arts read" on public.arts;
drop policy if exists "arts owner insert" on public.arts;
drop policy if exists "arts owner update" on public.arts;
drop policy if exists "arts owner delete" on public.arts;

create policy "arts read" on public.arts
  for select
  using (
    privacy in ('unlisted', 'public')
    or (select auth.uid()) = owner_id
  );

create policy "arts owner insert" on public.arts
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "arts owner update" on public.arts
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "arts owner delete" on public.arts
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "art_versions owner read write" on public.art_versions;
drop policy if exists "art_versions unlisted public read" on public.art_versions;
drop policy if exists "art_versions read" on public.art_versions;
drop policy if exists "art_versions owner insert" on public.art_versions;
drop policy if exists "art_versions owner update" on public.art_versions;
drop policy if exists "art_versions owner delete" on public.art_versions;

create policy "art_versions read" on public.art_versions
  for select
  using (
    (select auth.uid()) = owner_id
    or exists (
      select 1
      from public.arts a
      where a.id = art_versions.art_id
        and a.privacy in ('unlisted', 'public')
    )
  );

create policy "art_versions owner insert" on public.art_versions
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "art_versions owner update" on public.art_versions
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "art_versions owner delete" on public.art_versions
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "art_artifacts owner read write" on public.art_artifacts;
drop policy if exists "art_artifacts unlisted public read" on public.art_artifacts;
drop policy if exists "art_artifacts read" on public.art_artifacts;
drop policy if exists "art_artifacts owner insert" on public.art_artifacts;
drop policy if exists "art_artifacts owner update" on public.art_artifacts;
drop policy if exists "art_artifacts owner delete" on public.art_artifacts;

create policy "art_artifacts read" on public.art_artifacts
  for select
  using (
    (select auth.uid()) = owner_id
    or exists (
      select 1
      from public.arts a
      where a.id = art_artifacts.art_id
        and a.privacy in ('unlisted', 'public')
    )
  );

create policy "art_artifacts owner insert" on public.art_artifacts
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "art_artifacts owner update" on public.art_artifacts
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "art_artifacts owner delete" on public.art_artifacts
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "favorites owner" on public.favorites;

create policy "favorites owner" on public.favorites
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "collections owner" on public.collections;

create policy "collections owner" on public.collections
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

drop policy if exists "collection_items owner" on public.collection_items;

create policy "collection_items owner" on public.collection_items
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.collections c
      where c.id = collection_items.collection_id
        and c.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.collections c
      where c.id = collection_items.collection_id
        and c.owner_id = (select auth.uid())
    )
  );

drop policy if exists "device_codes owner read" on public.device_codes;

create policy "device_codes owner read" on public.device_codes
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "companion_imports owner" on public.companion_imports;

create policy "companion_imports owner" on public.companion_imports
  for all
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);
