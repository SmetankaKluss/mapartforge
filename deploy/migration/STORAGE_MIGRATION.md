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

## New ordinary Cloud artifact writes

New Cloud saves can use Yandex directly without changing the logical artifact
paths or public manifests. This is separate from the legacy dual-read copy and
from Lens. Existing rows default to `storage_provider = 'supabase'`; a complete
save reservation uses exactly one provider.

Create a separate private, versioned bucket, a KMS key, a migration writer and
a runtime identity limited to get/put/delete below
`cloud/v1/mapkluss-companion-private/`.
Anonymous reads, public ACLs and bucket-policy administration must remain
denied. Configure browser CORS for `https://mapkluss.art` with `GET`, `HEAD`
and `PUT`, the signed upload headers and exposed `ETag`. Add an enabled
lifecycle below `cloud/v1/` that removes non-current versions within 30 days
and incomplete multipart uploads within 7 days; the intended production
values are 7 days and 1 day respectively. This is required because deleting a
key from a versioned bucket otherwise leaves charged non-current bytes.

Before enabling writes, run `node deploy/migration/verify-artifact-storage.mjs`
with the runtime Object Storage identity. The preflight fails unless private
ACL, no bucket policy, versioning, the expected KMS key, browser CORS and
bounded lifecycle are all present. Configure these Edge secrets without
committing their values:

- `YANDEX_ARTIFACT_STORAGE_ACCESS_KEY_ID`
- `YANDEX_ARTIFACT_STORAGE_SECRET_ACCESS_KEY`
- `YANDEX_ARTIFACT_STORAGE_BUCKET`
- `YANDEX_ARTIFACT_STORAGE_KMS_KEY_ID`
- optional `YANDEX_ARTIFACT_STORAGE_PREFIX=cloud/v1`
- optional `YANDEX_ARTIFACT_STORAGE_ENDPOINT=https://storage.yandexcloud.net`
- optional `YANDEX_ARTIFACT_STORAGE_REGION=ru-central1`

Keep `MAPKLUSS_YANDEX_ARTIFACT_STORAGE_WRITE` absent while deploying the
additive migration and updated `companion-api`/`companion-mod`. Valid
credentials remain available for reads and cleanup when writes are disabled,
which preserves rollback access to already-published Yandex rows. Enabling the
write flag with incomplete configuration fails the save closed.

The website receives short-lived immutable PUT targets from `companion-api`.
The signed request binds content type, SHA-256 metadata, source bucket and KMS
headers. A Yandex write is never retried through Supabase. Before publication,
the Edge Function downloads the real object, checks MIME, exact size and
SHA-256, and only then stores `storage_provider = 'yandex'`. Reads and durable
cleanup follow that provider exactly.

Roll out as a private canary: migration, functions with writes disabled,
Supabase regression save, enable the flag for one owner window, then verify
save/update/reopen, preview, every artifact download, Companion library and
delete cleanup. Keep every Supabase object and the write flag rollback-ready
through the observation period. Do not remove the source copies as part of
this rollout.

## Lens preview cutover

Lens preview images are temporary live-session data and are deliberately not
part of the confirmed-artifact manifest above. Their database metadata,
authorization, invite groups, revision compare-and-swap and Realtime wake-up
messages remain in Supabase. Only the private PNG bytes may move to Yandex.

Use a separate runtime identity and preferably a separate private bucket. Do
not reuse either the migration writer or the generic artifact dual-read key.
Restrict its bucket policy to list, get, put and delete only below
`lens/v1/mapkluss-lens/`, require conditional writes, deny public ACLs and add a
short lifecycle rule as a final safety net for abandoned temporary revisions.
Configure these Edge Function secrets without committing their values:

- `MAPKLUSS_YANDEX_LENS_STORAGE=true`
- `YANDEX_LENS_STORAGE_ACCESS_KEY_ID`
- `YANDEX_LENS_STORAGE_SECRET_ACCESS_KEY`
- `YANDEX_LENS_STORAGE_BUCKET`
- optional `YANDEX_LENS_STORAGE_PREFIX=lens/v1`
- optional `YANDEX_LENS_STORAGE_ENDPOINT=https://storage.yandexcloud.net`
- optional `YANDEX_LENS_STORAGE_REGION=ru-central1`

With valid read credentials present, the flag controls new writes only. If the
flag is enabled with an invalid or incomplete configuration, the function fails
closed instead of writing to Supabase. With the switch on, new revisions use
immutable `If-None-Match: *` writes and are read
back to verify their exact SHA-256 before the database revision advances. A
Yandex write failure aborts publication; it is never retried as a Supabase
write. Reads probe Yandex first and fall back to Supabase for sessions created
before cutover. Trim, stop and maintenance cleanup attempt both providers.

Roll out only after creating the private bucket, lifecycle rule and restricted
identity, then deploy `companion-lens` while the flag is still absent. Enable
the secrets and flag last. Verify an authenticated editor start/publish/status,
a device poll with a 60-second private URL, a second revision, invite/join and
stop. Rollback consists of removing the flag while retaining the read
credentials: new writes return to Supabase, existing Yandex-backed sessions
remain readable, and the Yandex lifecycle rule removes temporary leftovers.
