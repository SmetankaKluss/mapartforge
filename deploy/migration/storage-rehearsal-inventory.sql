-- Read-only, redacted phase-one inventory for a Storage migration rehearsal.
-- The result contains counts and configuration only: no object keys, UUIDs, or user data.
with objects as (
  select
    o.id,
    o.bucket_id,
    o.name,
    case
      when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (o.metadata ->> 'size')::bigint
      else 0
    end as size_bytes
  from storage.objects o
),
object_refs as (
  select
    o.*,
    exists (
      select 1 from public.shares s
      where s.image_path = o.name or s.preview_path = o.name
    ) as share_ref,
    exists (select 1 from public.arts a where a.preview_path = o.name) as art_ref,
    exists (
      select 1 from public.art_versions v
      where v.project_path = o.name or v.preview_path = o.name
    ) as version_ref,
    exists (select 1 from public.art_artifacts a where a.storage_path = o.name) as artifact_ref,
    exists (select 1 from public.companion_imports i where i.image_path = o.name) as import_ref,
    exists (
      select 1 from public.companion_lens_sessions l
      where l.preview_path = o.name
    ) as lens_current_ref
  from objects o
),
bucket_prefix as (
  select
    b.id as bucket_id,
    b.public,
    b.file_size_limit,
    b.allowed_mime_types,
    split_part(r.name, '/', 1) as top_prefix,
    count(r.id)::bigint as object_count,
    coalesce(sum(r.size_bytes), 0)::bigint as bytes,
    count(r.id) filter (where r.share_ref)::bigint as share_refs,
    count(r.id) filter (where r.art_ref)::bigint as art_refs,
    count(r.id) filter (where r.version_ref)::bigint as version_refs,
    count(r.id) filter (where r.artifact_ref)::bigint as artifact_refs,
    count(r.id) filter (where r.import_ref)::bigint as import_refs,
    count(r.id) filter (where r.lens_current_ref)::bigint as lens_current_refs,
    count(r.id) filter (
      where r.id is not null
        and not (
          r.share_ref or r.art_ref or r.version_ref
          or r.artifact_ref or r.import_ref or r.lens_current_ref
        )
    )::bigint as no_db_pointer
  from storage.buckets b
  left join object_refs r on r.bucket_id = b.id
  group by
    b.id,
    b.public,
    b.file_size_limit,
    b.allowed_mime_types,
    split_part(r.name, '/', 1)
),
share_integrity as (
  select
    count(*)::bigint as share_rows,
    count(*) filter (where io.id is not null and po.id is not null)::bigint as complete_pairs,
    count(*) filter (where io.id is not null and po.id is null)::bigint as source_only,
    count(*) filter (where io.id is null and po.id is not null)::bigint as preview_only,
    count(*) filter (where io.id is null and po.id is null)::bigint as neither,
    count(*) filter (where io.id is null)::bigint as missing_source_objects,
    count(*) filter (where po.id is null)::bigint as missing_preview_objects
  from public.shares s
  left join storage.objects io
    on io.bucket_id = 'mapartforge' and io.name = s.image_path
  left join storage.objects po
    on po.bucket_id = 'mapartforge' and po.name = s.preview_path
),
companion_integrity as (
  select
    (select count(*) from public.art_artifacts)::bigint as artifact_rows,
    (
      select count(*) from public.art_artifacts a
      where exists (
        select 1 from storage.objects o
        where o.bucket_id = 'mapartforge' and o.name = a.storage_path
      )
    )::bigint as artifact_objects_present,
    (
      select count(*) from public.art_artifacts a
      where not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'mapartforge' and o.name = a.storage_path
      )
    )::bigint as artifact_objects_missing,
    (
      select count(*) from public.art_artifacts a
      join storage.objects o
        on o.bucket_id = 'mapartforge' and o.name = a.storage_path
      where a.size_bytes <> case
        when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
          then (o.metadata ->> 'size')::bigint
        else -1
      end
    )::bigint as artifact_size_metadata_mismatches,
    (select count(*) from public.companion_imports)::bigint as import_rows,
    (
      select count(*) from public.companion_imports i
      where exists (
        select 1 from storage.objects o
        where o.bucket_id = 'mapartforge' and o.name = i.image_path
      )
    )::bigint as import_objects_present,
    (
      select count(*) from public.companion_imports i
      where not exists (
        select 1 from storage.objects o
        where o.bucket_id = 'mapartforge' and o.name = i.image_path
      )
    )::bigint as import_objects_missing,
    (
      select count(*) from public.companion_imports i
      join storage.objects o
        on o.bucket_id = 'mapartforge' and o.name = i.image_path
      where i.size_bytes <> case
        when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
          then (o.metadata ->> 'size')::bigint
        else -1
      end
    )::bigint as import_size_metadata_mismatches
),
lens_integrity as (
  select coalesce(jsonb_agg(x order by x.status), '[]'::jsonb) as by_status
  from (
    select
      status,
      count(*)::bigint as sessions,
      count(*) filter (where revision > 0)::bigint as with_revision,
      count(*) filter (where preview_path is not null)::bigint as with_path
    from public.companion_lens_sessions
    group by status
  ) x
)
select jsonb_build_object(
  'captured_at', now(),
  'object_count', (select count(*) from objects),
  'object_bytes_from_metadata', (select coalesce(sum(size_bytes), 0) from objects),
  'bucket_prefixes', (
    select jsonb_agg(to_jsonb(x) order by bucket_id, top_prefix)
    from bucket_prefix x
  ),
  'shares', (select to_jsonb(x) from share_integrity x),
  'companion', (select to_jsonb(x) from companion_integrity x),
  'lens', (select by_status from lens_integrity)
)::text;
