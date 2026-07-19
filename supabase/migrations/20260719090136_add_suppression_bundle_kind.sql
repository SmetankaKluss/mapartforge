-- Kept in its own migration because PostgreSQL enum values must be committed
-- before later functions and constraints can safely reference them.
alter type public.art_artifact_kind
  add value if not exists 'suppression_bundle' after 'suppression_plan';
