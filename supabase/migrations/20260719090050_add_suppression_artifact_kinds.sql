alter type public.art_artifact_kind
  add value if not exists 'suppression_litematic' after 'litematic_tiles_zip';

alter type public.art_artifact_kind
  add value if not exists 'suppression_plan' after 'suppression_litematic';
