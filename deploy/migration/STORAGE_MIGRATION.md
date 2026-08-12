# Storage migration rehearsal

This lane copies only database-confirmed objects to a private Yandex Object
Storage bucket. Supabase remains the source of truth and source objects are not
deleted.

## Safety model

- `storage-object-manifest.sql` joins every object by exact bucket and path.
- Only `confirmed_*` rows are eligible for copying.
- Reviewed missing legacy share files, alias-only rows, ephemeral Lens and
  orphan rows are excluded and reported.
- Missing required artifacts/imports, active reservations and conflicting
  references block copy mode completely.
- The private manifest stays on the ephemeral Actions runner and is deleted in
  an `always()` step. It must never be uploaded as an artifact or printed.
- Every copied byte stream is checked for size and, when available, SHA-256.
- A disposable encrypted canary proves that anonymous access is denied before
  any user bytes are copied. Buckets with a policy are rejected.
- The Yandex target is checked again after upload and uses KMS encryption.
- Retries reuse a target only when its stored size/hash match.

## Required isolated configuration

Create a private, versioned migration bucket and a dedicated migration service
account that can read/write only that bucket and use its KMS key. Protect the
GitHub environment named `storage-migration` with a required reviewer, then
configure these names in that environment only:

- secrets: `SUPABASE_SERVICE_ROLE_KEY`, `YC_MIGRATION_ACCESS_KEY_ID`,
  `YC_MIGRATION_SECRET_ACCESS_KEY`
- variables: `YC_MIGRATION_BUCKET`, `YC_MIGRATION_KMS_KEY_ID`

Run `Rehearse confirmed Storage migration` in `inventory` mode first. Both
modes use the protected environment because the manifest needs production DB
access. Known missing legacy share objects are reported but never fabricated or
copied. Missing artifacts/imports, reservations, and conflicting references
stop copy mode.

## Temporary dual-read

After the copy is verified, create a separate runtime service account that can
only `GET`/`HEAD` objects in the private bucket. It must not reuse the migration
writer identity and must not receive write, delete, bucket-policy or KMS admin
permissions. Configure that read-only identity as Edge Function secrets and set:

- `MAPKLUSS_YANDEX_STORAGE_DUAL_READ=true`
- `YANDEX_STORAGE_ACCESS_KEY_ID`
- `YANDEX_STORAGE_SECRET_ACCESS_KEY`
- `YANDEX_STORAGE_BUCKET`
- optional `YANDEX_STORAGE_PREFIX=storage-migration/v1`

The shared signer probes Yandex first and signs a short-lived Yandex GET URL
only for an existing target. Missing or unavailable targets fall back to the
existing Supabase signer. Removing the flag restores Supabase-only reads.

Do not enable dual-read until the inventory/copy rehearsal, signed-link expiry,
guest isolation, authenticated previews/downloads, and rollback smoke all pass.
