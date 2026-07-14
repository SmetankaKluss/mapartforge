\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

select jsonb_build_object(
  'postgres_version', current_setting('server_version'),
  'extensions', coalesce((
    select jsonb_agg(
      jsonb_build_object('name', extname, 'version', extversion)
      order by extname
    )
    from pg_extension
  ), '[]'::jsonb),
  'auth_user_triggers', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'name', trigger_name,
        'definition', pg_get_triggerdef(trigger_oid, true)
      )
      order by trigger_name
    )
    from (
      select t.oid as trigger_oid, t.tgname as trigger_name
      from pg_trigger t
      where t.tgrelid = 'auth.users'::regclass
        and not t.tgisinternal
    ) triggers
  ), '[]'::jsonb),
  'storage_object_policies', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'name', policyname,
        'command', cmd,
        'roles', roles,
        'using', qual,
        'with_check', with_check
      )
      order by policyname
    )
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
  ), '[]'::jsonb),
  'publication_tables', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'publication', pubname,
        'schema', schemaname,
        'table', tablename
      )
      order by pubname, schemaname, tablename
    )
    from pg_publication_tables
  ), '[]'::jsonb),
  'migration_versions', coalesce((
    select jsonb_agg(version order by version)
    from supabase_migrations.schema_migrations
  ), '[]'::jsonb)
)::text;
