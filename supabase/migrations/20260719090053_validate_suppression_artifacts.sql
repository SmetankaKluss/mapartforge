alter table public.art_artifacts
  drop constraint if exists art_artifacts_suppression_payload_check;

alter table public.art_artifacts
  add constraint art_artifacts_suppression_payload_check check (
    (
      kind <> 'suppression_litematic'
      and kind <> 'suppression_plan'
    )
    or (
      kind = 'suppression_litematic'
      and size_bytes between 1 and 16777216
      and content_type = 'application/octet-stream'
      and filename ~ '\.litematic$'
    )
    or (
      kind = 'suppression_plan'
      and size_bytes between 1 and 4194304
      and content_type = 'application/vnd.mapkluss.suppression-plan+json;version=1'
      and filename ~ '\.json$'
    )
  );
