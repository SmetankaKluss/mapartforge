-- Disposable restore targets only: match Supabase Storage migration 0062.
-- https://github.com/supabase/storage/blob/master/migrations/tenant/0062-object-versioning-core.sql
DO $$
DECLARE
  bucket_owner name;
  object_owner name;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO bucket_owner
    FROM pg_class WHERE oid = 'storage.buckets'::regclass;
  SELECT pg_get_userbyid(relowner) INTO object_owner
    FROM pg_class WHERE oid = 'storage.objects'::regclass;
  IF bucket_owner IS DISTINCT FROM object_owner THEN
    RAISE EXCEPTION 'Managed Storage table owners differ';
  END IF;
  EXECUTE format('SET LOCAL ROLE %I', bucket_owner);
END;
$$;

ALTER TABLE storage.buckets
  ADD COLUMN IF NOT EXISTS versioning_status text NOT NULL DEFAULT 'DISABLED';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'storage.buckets'::regclass
      AND conname = 'buckets_versioning_status_check'
  ) THEN
    ALTER TABLE storage.buckets ADD CONSTRAINT buckets_versioning_status_check
      CHECK (versioning_status IN ('DISABLED', 'ENABLED', 'SUSPENDED'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'storage.buckets'::regclass
      AND conname = 'buckets_versioning_standard_only_check'
  ) THEN
    ALTER TABLE storage.buckets ADD CONSTRAINT buckets_versioning_standard_only_check
      CHECK (type = 'STANDARD' OR versioning_status = 'DISABLED');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'storage.buckets'::regclass
      AND conname = 'buckets_versioning_dark_check'
  ) THEN
    ALTER TABLE storage.buckets ADD CONSTRAINT buckets_versioning_dark_check
      CHECK (versioning_status = 'DISABLED');
  END IF;
END;
$$;

ALTER TABLE storage.objects
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_delete_marker boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_versioned boolean NOT NULL DEFAULT false;

RESET ROLE;
