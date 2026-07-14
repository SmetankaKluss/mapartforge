-- The trigger still owns profile creation for new auth users, but the
-- SECURITY DEFINER function should not be directly callable from exposed roles.
revoke execute on function public.handle_new_companion_user() from public;
revoke execute on function public.handle_new_companion_user() from anon;
revoke execute on function public.handle_new_companion_user() from authenticated;

do $$
begin
  if to_regclass('public.build_sessions') is not null then
    drop policy if exists "Public can insert build_sessions" on public.build_sessions;
    drop policy if exists "Public can update build_sessions" on public.build_sessions;
    drop policy if exists "Public can read build_sessions" on public.build_sessions;
    drop policy if exists "public read" on public.build_sessions;
    drop policy if exists "Build sessions readable by link" on public.build_sessions;

    create policy "Build sessions readable by link"
    on public.build_sessions
    for select
    using (
      art_id is null
      or exists (
        select 1
        from public.arts a
        where a.id = build_sessions.art_id
          and (
            a.privacy in ('unlisted', 'public')
            or a.owner_id = (select auth.uid())
          )
      )
    );
  end if;

  if to_regclass('public.shares') is not null then
    drop policy if exists "Public can insert shares" on public.shares;
    drop policy if exists "Public can read shares" on public.shares;
    drop policy if exists "Shares public read" on public.shares;
    drop policy if exists "Shares bounded public insert" on public.shares;

    create policy "Shares public read"
    on public.shares
    for select
    using (true);

    create policy "Shares bounded public insert"
    on public.shares
    for insert
    with check (
      id ~ '^[a-z0-9_-]{8,64}$'
      and image_path = ('images/' || id || '.png')
      and preview_path = ('previews/' || id || '.png')
      and jsonb_typeof(settings) = 'object'
      and octet_length(settings::text) <= 200000
    );
  end if;
end $$;
