# Live Build Tracker Rollout Gate

Status: owner-authorized initial production deployment completed 2026-09-08.
companion-build v2 is active; existing Cloud/Lens functions were not replaced.
The additive tracker_web_snapshots migration and native website mirror passed
fresh backup/restore and synthetic authenticated gateway/direct update checks.
Rollback restores saved v1 Edge sources, retaining the new private table/data.
Backup and disposable PostgreSQL restore run34220004112 passed before deployment.
Group control passed real device-authenticated gateway/direct requests. Release
source-byte smoke passed upload/finalize/byte-identical download with a small
synthetic payload through the gateway; the temporary group was closed.
Maintenance scheduling and version-retention proof are still pending.
This is not full release acceptance or authorization for broad cleanup.

## Ordered Backend Changes

1. `20260908054547_live_build_private_collaboration.sql`
2. `20260908060336_live_build_observations.sql`
3. `20260908061547_live_build_observation_batches.sql`
4. `20260908092500_live_build_sources.sql`
5. `20260908094000_live_build_source_cleanup.sql`
6. `20260908112454_live_build_actor_quota_lock.sql`

Applied remote versions are112303,112304,112305,112306,112307 and112513
(all prefixed20260908), respectively. The final additive fix uses an owner-scoped
transaction advisory lock: service_role intentionally lacks auth.users read/update
grants. Edge validates actor identity and the existing owner FK preserves integrity.
Do not rewrite already applied migration files or broaden managed Auth grants.

Deploy the matching `companion-build` Edge sources only after migrations. Keep
the previous function source/config and fresh database restore evidence privately.
Rollback stops the new feature/maintenance and restores previous Edge sources;
retain additive tables and private files. Do not drop tables or reverse data migrations.
Never replay failed mutations against another backend during rollout or rollback.

## Required Environment Evidence

- Real PostgreSQL/Auth/device credentials: owner, member, outsider and revoked member.
- Gateway and direct paths: JSON control,2MiB binary POST, required custom headers,
  no cache, no redirects forwarding credentials, finalize timeout compatibility.
- Existing private Yandex/KMS configuration can access only the intended new logical
  namespace `mapkluss-build-sources`; no client secret or public bucket policy.
- Actual conditional PUT behavior and bounded GET verification match the adapter.
- Verify versioned-bucket lifecycle for this namespace. DELETE may leave noncurrent
  versions; the maintenance ledger only proves removal of the current object.
  Do not enable a broad bucket lifecycle or purge unrelated backups/artifacts.
- Prove maximum-size transfer/finalize latency and memory with synthetic data.

## Maintenance

Operator-only entry point: `supabase/maintenance/liveBuildSourceCleanup.ts`.
Without `--execute` it performs no claims, expiration updates or storage operations.
Authorized execution requires existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
and Yandex artifact configuration supplied privately. It processes at most8objects
per run, prints aggregate removed/failed counts and exits nonzero on failures.

After authorization, arrange periodic execution through the existing private
maintenance scheduler; scheduling is NOT installed by this change. Use restricted
environment injection, not a public HTTP endpoint or user-controllable CLI arguments.
Monitor nonzero failures, oldest pending eligible job and expired active groups.

Closing/deleting a group queues exact manifest part keys with a10minute grace
period for already-authorized IO. Expiration sweeps close at most20groups/run.
Claims lease work5minutes, preserve failures and reject stale acknowledgements.
Completed tombstones prevent account/group deletion from recreating work.
Expired closed metadata is retired after pending cleanup finishes, releasing
retained-group quota; completed orphan tombstones expire after7days.
No broad storage listing or arbitrary path deletion is supported.

## Final Candidate Proof

Sequential mod tests/build for26.2,1.21.11,1.21.8,1.21.4, with dev resource exclusion.
Actual ordinary menu: owner create/upload/invite; member join/download full art,
select/anchor parts, shared scan progress, break/repair, revoke, restart and phase
failure recovery. Separate gathering desaturation/colour and2D/3D interaction proof.
User's existing game remains untouched; use isolated instances only.

Earlier local-only acceptance gaps are not a claim that the service is undeployed.
The service and small-payload storage route are verified remotely. Full native
multi-client, maximum-size and maintenance checks remain unverified; do not infer
them from local SQL/HTTP fixtures or compilation.
