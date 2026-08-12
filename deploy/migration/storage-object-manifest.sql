-- Private operational manifest for the Storage migration rehearsal.
-- The output contains object paths and ownership-adjacent identifiers. Keep it
-- on the runner, never upload it as a workflow artifact, and delete it after use.
with strong_refs as (
  select
    a.bucket_id,
    a.storage_path as object_path,
    'artifact'::text as reference_type,
    a.content_type as expected_content_type,
    a.size_bytes as expected_size,
    a.sha256 as expected_sha256
  from public.art_artifacts a

  union all

  select
    i.bucket_id,
    i.image_path,
    'import',
    'image/png',
    i.size_bytes,
    i.sha256
  from public.companion_imports i

  union all

  select 'mapartforge', s.image_path, 'share_source', 'image/png', null::bigint, null::text
  from public.shares s
  where s.image_path is not null

  union all

  select 'mapartforge', s.preview_path, 'share_preview', 'image/png', null::bigint, null::text
  from public.shares s
  where s.preview_path is not null

  union all

  select 'mapkluss-lens', l.preview_path, 'lens_live', 'image/png', null::bigint, l.preview_sha256
  from public.companion_lens_sessions l
  where l.preview_path is not null
    and l.status <> 'closed'
    and l.expires_at > now()
),
aliases_raw as (
  select
    a.preview_path as object_path,
    'art_preview_alias'::text as reference_type,
    a.id as art_id,
    a.current_version_id as version_id,
    'preview_png'::public.art_artifact_kind as expected_kind
  from public.arts a
  where a.preview_path is not null

  union all

  select v.preview_path, 'version_preview_alias', v.art_id, v.id, 'preview_png'::public.art_artifact_kind
  from public.art_versions v
  where v.preview_path is not null

  union all

  select v.project_path, 'version_project_alias', v.art_id, v.id, 'project'::public.art_artifact_kind
  from public.art_versions v
  where v.project_path is not null
),
grouped_refs as (
  select
    bucket_id,
    object_path,
    array_agg(distinct reference_type order by reference_type) as reference_types,
    count(distinct expected_size) filter (where expected_size is not null) as expected_size_variants,
    max(expected_size) as expected_size,
    count(distinct expected_sha256) filter (where expected_sha256 is not null) as expected_sha_variants,
    max(expected_sha256) as expected_sha256,
    count(distinct expected_content_type) filter (where expected_content_type is not null) as content_type_variants,
    max(expected_content_type) as expected_content_type
  from strong_refs
  group by bucket_id, object_path
),
alias_refs as (
  select
    coalesce(artifact.bucket_id, 'unknown') as bucket_id,
    alias.object_path,
    array[alias.reference_type]::text[] as reference_types
  from aliases_raw alias
  left join public.art_artifacts artifact
    on artifact.storage_path = alias.object_path
    and artifact.art_id = alias.art_id
    and artifact.version_id = alias.version_id
    and artifact.kind = alias.expected_kind
),
active_reservations as (
  select
    item ->> 'bucketId' as bucket_id,
    item ->> 'storagePath' as object_path,
    'save_reservation'::text as reference_type,
    item ->> 'contentType' as expected_content_type,
    nullif(item ->> 'sizeBytes', '')::bigint as expected_size,
    item ->> 'sha256' as expected_sha256
  from public.companion_art_save_reservations r
  cross join lateral jsonb_array_elements(r.artifacts) item
  where r.status in ('uploading', 'verifying') and r.expires_at > now()

  union all

  select
    r.bucket_id,
    r.object_path,
    'import_reservation',
    'image/png',
    r.size_bytes,
    r.sha256
  from public.companion_import_upload_reservations r
  where r.status = 'uploading' and r.expires_at > now()
),
objects as (
  select
    o.bucket_id,
    o.name as object_path,
    case
      when coalesce(o.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (o.metadata ->> 'size')::bigint
      else null::bigint
    end as observed_size,
    nullif(o.metadata ->> 'mimetype', '') as observed_content_type
  from storage.objects o
),
durable_rows as (
  select
    coalesce(r.bucket_id, o.bucket_id) as bucket_id,
    coalesce(r.object_path, o.object_path) as object_path,
    coalesce(r.reference_types, '{}'::text[]) as reference_types,
    r.expected_content_type,
    r.expected_size,
    r.expected_sha256,
    o.observed_size,
    o.observed_content_type,
    case
      when r.bucket_id is null and exists (
        select 1 from public.companion_storage_delete_outbox d
        where d.bucket_id = o.bucket_id and d.object_path = o.object_path
      ) then 'pending_delete'
      when r.bucket_id is null then 'orphan_unreferenced'
      when o.bucket_id is null and (
        'artifact' = any(r.reference_types) or 'import' = any(r.reference_types)
      ) then 'missing_required_source'
      when o.bucket_id is null then 'missing_legacy_source'
      when r.expected_size_variants > 1 or r.expected_sha_variants > 1 or r.content_type_variants > 1
        then 'conflicting_reference'
      when r.expected_size is not null and o.observed_size is distinct from r.expected_size
        then 'conflicting_reference'
      when r.expected_content_type is not null and o.observed_content_type is not null
        and lower(split_part(o.observed_content_type, ';', 1))
          <> lower(split_part(r.expected_content_type, ';', 1))
        then 'conflicting_reference'
      when 'lens_live' = any(r.reference_types) then 'ephemeral_lens_live'
      when 'artifact' = any(r.reference_types) then 'confirmed_artifact'
      when 'import' = any(r.reference_types) then 'confirmed_import'
      when 'share_source' = any(r.reference_types) then 'confirmed_share_source'
      else 'confirmed_share_preview'
    end as classification
  from grouped_refs r
  full join objects o
    on o.bucket_id = r.bucket_id and o.object_path = r.object_path
  where not exists (
    select 1 from active_reservations pending
    where pending.bucket_id = coalesce(r.bucket_id, o.bucket_id)
      and pending.object_path = coalesce(r.object_path, o.object_path)
  )
),
alias_only_rows as (
  select
    coalesce(o.bucket_id, 'unknown') as bucket_id,
    a.object_path,
    a.reference_types,
    null::text as expected_content_type,
    null::bigint as expected_size,
    null::text as expected_sha256,
    o.observed_size,
    o.observed_content_type,
    'alias_only'::text as classification
  from alias_refs a
  left join objects o on o.bucket_id = a.bucket_id and o.object_path = a.object_path
  where not exists (
    select 1 from grouped_refs r
    where r.bucket_id = a.bucket_id and r.object_path = a.object_path
  )
),
pending_rows as (
  select
    pending.bucket_id,
    pending.object_path,
    array[pending.reference_type]::text[] as reference_types,
    pending.expected_content_type,
    pending.expected_size,
    pending.expected_sha256,
    o.observed_size,
    o.observed_content_type,
    'pending_reservation'::text as classification
  from active_reservations pending
  left join objects o
    on o.bucket_id = pending.bucket_id and o.object_path = pending.object_path
),
all_rows as (
  select * from durable_rows
  union all select * from alias_only_rows
  union all select * from pending_rows
),
capture as (
  select to_char(clock_timestamp() at time zone 'utc', 'YYYYMMDDHH24MISSMS') as generation
)
select jsonb_build_object(
  'capture_generation', capture.generation,
  'bucket', bucket_id,
  'path', object_path,
  'target_key', 'storage-migration/v1/' || bucket_id || '/' || object_path,
  'classification', classification,
  'reference_types', to_jsonb(reference_types),
  'expected_content_type', expected_content_type,
  'expected_size', expected_size,
  'expected_sha256', expected_sha256,
  'observed_size', observed_size,
  'observed_content_type', observed_content_type
)::text
from all_rows cross join capture
order by classification, bucket_id, object_path;
