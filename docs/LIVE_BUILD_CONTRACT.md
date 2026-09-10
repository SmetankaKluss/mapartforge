# Live Build Collaboration v1

The existing material tracker and Lens APIs are unchanged. The private Tracker API
is deployed. Native group/source integration is implemented; final multiplayer
acceptance and production source-transport maintenance evidence remain pending.

## Website snapshot mirror

Authenticated web_begin/web_publish/web_read/web_stop bind a native publisher to
an existing exact Cloud art/version resource session. Only the art owner writes;
owner and current accepted private group members read. No public link grants scan
access. Native merged pixels/counts are published, not browser-inferred completion.
One bounded upload and visible-page poll approximately every5seconds; freshness
expires after15seconds and retained snapshots are explicitly stale. Large native
accounting passes/network latency can exceed that cadence. The current group
mirror requires the owner mod online; autonomous server merging is not implemented.

Snapshot: width/height <=1280, signed ARGB32 palette <=1024 entries, canonical
base64 little-endian uint16 palette indices, six counts(total/correct/missing/wrong/
unknown/stale), <=100 optional part summaries and <=512 material counts.4.6MB
request ceiling; service-only table/RPC, publisher lease and monotonic sequence.
No coordinates, world/server names or filenames in the snapshot. Material counts
and native rendered preview are bounded passes, not one atomic observation instant.

## Access

`POST /functions/v1/companion-build` requires a validated Supabase user JWT or an
approved, unexpired Companion device token. Anonymous accounts are not accepted.
The Edge function derives the actor; an actor ID supplied in JSON grants no rights.
All new tables use RLS, with no grants to public, anon or authenticated. The
security-invoker control RPC is service-only, with explicit membership and owner checks.
This follows the existing Lens service boundary, not its temporary subscriber lifetime.

Actions use JSON `{ "action": "...", ... }` and return
`{ "api_version": 1, "build": ... }`. Requests are bounded to8KiB (observe uploads64KiB,
observe_batch384KiB, observations_batch32KiB); DB control
metadata is bounded to4KiB. Errors contain no database details or request data.
No mutation may automatically retry through a second backend. A revision conflict
requires reading current state and an explicit fresh action.

## Lifecycle and Placement

- `create`: source_sha256, grid_wide/grid_tall1-10, consent:true. At most5 active
  builds and20 retained builds per owner,30-day expiry. Closing builds cannot bypass
  the retained-row cap. No source image/schematic is uploaded implicitly.
- `invite`: build_id, expected_revision. Owner only. Returns one random128-bit hex
  code, valid24hours. Only a domain-separated SHA-256 is stored. Rotation invalidates
  the prior code without removing accepted members.
- `join`: code, consent:true. Requires login. Up to19 friends plus owner. Repeat
  join is idempotent. Joining never automatically binds a local Minecraft world.
- `read`: build_id. Owner/member only. Returns the whole grid and placed tiles.
  Membership UUIDs are returned only to owner; invitation hashes never return.
- `leave`: build_id. Member only. Owner uses close instead.
- `remove_member`: build_id, expected_revision, member_id. Owner only. Also clears
  the current invitation so the removed member cannot reuse it.
- `close`: build_id, expected_revision. Immediately denies subsequent reads/joins.
- `place`: build_id, expected_revision, tile, consent:true, target_sha256, phase,
  cell_count, world_binding, dimension, origin_x/y/z, rotation0-3, mirrored.
  Owner explicitly shares one map placement, not the whole grid. Tile indexes are
  zero-based and bounded by the actual grid. Phase-1 is initial/static geometry.
  Limits:2million cells per tile,8million per build. These are capacity limits,
  not a universal freshness guarantee. Replacing a placement changes its revision.
- `unplace`: build_id, expected_revision, tile. Removes only that map placement.

World binding is a random group-local UUID. Clients keep the association to their
actual server/world locally and require explicit confirmation before scanning.
Never send a server address/name or the persistent local world hash. Coordinates
and dimension are shared only after placement consent. Source and target hashes,
phase, transform and placement revision must match before any observation applies.

The whole-art overview stays visible. Unplaced tiles remain desaturated. Current
selected tile and whole-art completion are separate; unknown/stale is not complete.

## Rate Limits and Transactions

Reuses the existing service-only companion_lens_consume_rate_limit RPC with a
distinct build-rate-v1 actor hash and build-prefixed buckets:10joins/minute,
120control calls/minute and a separate120observation calls/minute per account. Failed joins count because rate consumption
is a separate transaction. Membership/placement actions lock the build row;
owner create quotas serialize on the owner row. Client roles cannot invoke the RPC.

## Shared Observations

`observe_begin` accepts build_id and consent:true. Returns a random lease, issued_ms
and valid_ms30000. One current publishing lease per member/build; another device
invalidates the previous lease. Membership is rechecked on every call.

`observe` and `observations` require build_id, tile, page, placement_revision,
source_sha256, target_sha256, phase and world_binding. Page size is4096 cells;
the last page has exactly the remaining cells. No page for an unplaced map exists.
Placement replacement/deletion cascades its evidence, never neighbouring maps.

Upload adds lease, monotonically increasing sequence, states (string of0unknown,
1correct,2missing,3wrong), and offsets_ms (one integer per cell, -120000..30000).
Offsets describe sample time relative to lease issuance, NOT receipt time. Clients
must use monotonic elapsed time since the lease response minus actual sample age;
the server-issued origin makes this conservative. Future, pre-consent or older
than120s samples are rejected. A delayed/expired lease cannot freshen old samples.
Identical last-sequence replay acknowledges without writes; changed/older replay
conflicts. Unknown never clears or refreshes another observation. Newest per-cell
evidence wins; equal timestamps conservatively prefer wrong, then missing.

Read returns states, observed_ms, page revision and server_ms, never reporter IDs.
Expired evidence is4stale; revoked/pre-rejoin evidence is0unknown. No history is
resurrected after revocation. These are reports by invited clients, not proof from
a server plugin, anti-cheat or attribution of who placed a block.

## Compact Batches

`observe_batch`: build_id, lease, sequence, pages (1..32 distinct tile/page pairs).
Each page contains the normal identity fields except build_id plus packed. Packed
is canonical base64 of big-endian unsigned16-bit words, one per structural cell.
The bottom3 bits are state0..3, remaining bits are floor(offset_ms/100)+1200,
bounded0..1500. Rounding offsets down is conservative. Page maximum8192 decoded
bytes;32pages cover up to131072 cells. Padding/reserved states/oversized data fail.
The whole batch commits atomically; exact latest replay acknowledges without writes.
Batch sequence starts1 and increments per lease; do not mix single and batch writes
within one lease. Batch state and page evidence are not two independent commits.

`observations_batch`: build_id and1..32 page identity records. Response pages use
the same binary word shape, but bottom3 bits are state0..4 and high bits are AGE in
100ms units rounded UP, capped1201. Unknown has age0. Each page includes server_ms,
revision and membership_revision. Never interpret response age as upload offset.
Client elapsed time must include network transit, conservatively using request-start
monotonic time; receipt time must not restart the120s freshness clock.

Optional known_revision plus membership_revision per read page can return unchanged
instead of packed data. Only exact page AND current session revision can skip data.
Revocation/leave/placement changes alter the session revision, forcing revalidation.
An unchanged reply NEVER refreshes cached observation timestamps. The client must
locally expire cached cells and discard all data on access denial or placement mismatch.

Limits are unchanged:120observation calls/minute includes leases/reads/writes. At8m
cells the full grid requires at most roughly2000pages/63batches each way, rather
than4000single-page calls. Clients must pace and send only locally observed pages,
not request fresh evidence for unloaded chunks. Cold full-grid transfer remains
large; a batch is not a promise of unlimited group throughput.

## Pending Before Release

### Private Source Delivery (Deployed)

`source_begin` accepts build_id, kind (`litematic` / `two_layer_zip`), size_bytes,
part_sha256 and explicit consent. Owner only; one immutable manifest per group.
Parts are exactly2MiB except the final tail, maximum64parts/128MiB; Litematic16MiB.
The whole source hash is the group's existing immutable source_sha256, not a new client override.
`source_read` returns the manifest under `build` in the existing control envelope;
members see available:false until verification has committed ready. Owner can inspect pending upload.

Binary requests use POST to companion-build with `?source=put|get|finalize`, existing
JWT/device Authorization, `x-build-id` and `x-build-part` (put/get). PUT request body
is one raw part. GET response is application/octet-stream. Finalize returns `{source:...}`.
These are native-only paths, not new browser CORS endpoints. Internal
source_part_read/source_part_write/source_commit RPC actions cannot be dispatched through JSON control.
Every part authorizes the actor, validates the part hash/size and rechecks access after IO.
Finalize incrementally hashes actual stored parts, compares the whole source SHA/size,
then invokes owner-only commit. Only ready members can retrieve bytes; no signed URL
is returned to clients. HTTP failures must not trigger mutation fallback/replay.

Storage uses existing configured private Yandex/KMS bucket and logical namespace
mapkluss-build-sources, group/source/part-hash keys. Conditional PUT prevents replacement;
an existing key is still fully verified at finalize and read. No filename, local/world path
or original auth token is stored. Generic source calls120/min; finalize has separate10/min
counter. Client must additionally parse schema/ZIP bounds and verify expected source/grid
before replacing its active local workspace.

Native upload/download wiring and a durable cleanup ledger/worker are implemented
locally. Release gates: exact end-to-end Auth/Yandex proof, large-file finalize timing,
IAM namespace permission and actual scheduled cleanup/version-retention evidence.
The metadata foreign-key cascade does NOT delete Yandex objects directly; a separate
durable ledger survives group/account deletion. See LIVE_BUILD_ROLLOUT.md.
The source migrations and companion-build v2 are deployed. A release smoke test
verified an authenticated synthetic source upload, finalize and byte-identical
download through the gateway. This checks storage transport, not multi-client
Minecraft acceptance or maximum-size performance. Scheduled cleanup and
version-retention evidence remain separate operational follow-ups.

Retain follow-up checks for multi-client compact batch/changed-page transport
and retention cleanup.
Measure storage/WAL and merge latency: per-cell time/reporter arrays are bounded
but not proven economical at maximum capacity. Client world validation,
private friends controls and3D/gathering are implemented in the Companion,
not by the database migration.

Local SQL tests exercise the real migration through a disposable PostgreSQL
adapter exporting exec/query; the test entry is supabase/tests/liveBuildControl.test.mjs.
Edge tests: `deno test supabase/functions/_shared/liveBuildControl.test.ts`.
PGlite verification is not a full Supabase/PostgREST/Auth or concurrent-transaction
rehearsal. Native PostgreSQL17, actual JWT/device requests, concurrent revisions,
staging, backup/rollback and deployment evidence remain release gates.

Reference: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security).
