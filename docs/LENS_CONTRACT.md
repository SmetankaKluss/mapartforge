# MapKluss Lens Contract v1

This document is the authoritative cross-client contract for the website, the
`companion-lens` Edge Function, and MapKluss Companion. Wire JSON uses camelCase;
action names use snake_case. Every successful response includes `apiVersion: 1`.
Every request declares `principalKind: "website" | "device" | "server"`; the
function validates that declaration against the supplied credential.

## Invariants

- Only a website Supabase user JWT may start, publish, inspect, rotate, or close a session.
- Mod device tokens may list, join, poll, place, leave, heartbeat, and report.
- One account has at most one active Lens session and one publishing browser lease.
- Every publisher mutation is compare-and-swap guarded by that lease. A delayed request from
  an older browser lifecycle cannot publish, rotate, close, or delete data from a reacquired session.
- The session owns preview revisions. Placements own world coordinates and visibility.
- `personal` is visible only to the owner account. `group` is visible only to the owner
  and devices that explicitly joined the session with its invite code.
- There is no public or automatic same-server discovery mode.
- Only an owner device may create, update, or delete a shared placement.
- Session codes are 12-character Crockford Base32 capabilities, stored only as SHA-256.
- No action returns a raw Storage path. Preview downloads use 60-second signed URLs.
- Revisions are monotonic. A publish with a stale `baseRevision` returns `revision_conflict`.
- Realtime messages contain only `sessionId`, `revision`, and `changedAt`; HTTP remains the
  source of truth. A healthy Realtime connection uses a 60-second recovery poll. A degraded
  connection retries at 5/10/20/40/60 seconds with ±20% jitter.
- A mod with no open Lens screen, known session, visible placement, or locally owned placement
  produces no Lens disk reads and no Lens network traffic.

## Shared Types

```text
LensVisibility = "personal" | "group"
LensFacing = "north" | "south" | "east" | "west"
LensStatus = "active" | "offline" | "closed" | "expired"
LensGrid = { wide: 1..100, tall: 1..100 }

LensSession = {
  sessionId, title, status, grid, mapMode: "2d" | "3d",
  revision, tileResolution: 16 | 32 | 64 | 128,
  previewWidth, previewHeight, viewerCount,
  editorLastSeenAt, expiresAt,
  sessionCode?, ownedByUser,
  realtime?: { websocketUrl, apiKey, topic }
}

LensPlacement = {
  placementId, sessionId, ownerKey, title, visibility,
  serverHash, dimensionId,
  anchor: { x, y, z }, facing,
  grid, revision, tileResolution,
  lastSeenAt, distanceBlocks?, ownedByDevice, realtime
}

LensPollResult = {
  changed, session, signedPreviewUrl?, placements
}
```

`ownerKey` is a stable non-secret SHA-256-derived public identifier, not the auth UUID.
For multiplayer, `serverHash` is lowercase normalized `host:port` hashed with SHA-256;
the raw address is never uploaded. Singleplayer uses a SHA-256 identifier derived from
the normalized local save path so placements cannot leak between saves, and supports
personal placements only.

## Actions

- `capabilities` (either principal): returns `enabled`, limits, and timing defaults.
- `session_start` (website): creates/resumes the active session, rotates its code/topic,
  revokes old group members, and returns a secret `publisherLease` held only in memory.
- `session_publish` (website multipart): fields `sessionId`, `baseRevision`, `title`,
  `publisherLease`, `gridWide`, `gridTall`, `mapMode`, `tileResolution`, `sha256`, and binary `preview`.
- `session_reacquire` (website): replaces an expired browser publisher lease without changing
  the invite code, Realtime topic, placements, or group membership.
- `session_status` (website): heartbeat plus current session/viewer status; requires `publisherLease`.
- `session_rotate_code` (website): requires `publisherLease`, rotates the group code and
  Realtime capability topic, and revokes subscribers joined with the old code.
- `session_close` (website): requires `publisherLease` and idempotently closes the session and
  all placements. A stale lease returns success with `stale: true` without changing current data.
- `session_list` (device): returns owned and group-joined active sessions.
- `session_join` (device): verifies an invite code and upserts a `group` subscriber.
- `session_leave` (device): removes the caller's non-owner subscription.
- `session_poll` (device): accepts `sessionId` and `knownRevision`; unchanged responses and
  responses without a visible placement do not include a signed URL. Polling does not refresh
  presence. Only the owner or an explicit group member may poll.
- `placement_upsert` (owner device): max eight placements in the current session; server hash/dimension are required
  for `group` and optional for `personal`; returns the canonical placement.
- `placement_delete` (owner device): idempotently removes a placement.
- `presence_heartbeat` (device): refreshes joined subscriber presence and owned placements.
  Group viewers do not write the shared session row on every heartbeat.
- `placement_report` (device): stores reason `spam | sexual | hateful | other`; reporting also
  hides the placement locally in the mod.
- `maintenance_cleanup` (server secret): expires stale sessions and deletes orphaned previews.

## Preview And Timing

- Website debounce: 350 ms; maximum one publish request per second; newest pending preview wins.
  Clearing/stopping a session invalidates in-flight queue results, and an empty editor closes
  the current session instead of leaving a phantom preview.
- Publish, status refresh, code rotation, and close all re-check the publisher lease in their
  database update. Reacquiring a session therefore invalidates every older in-flight mutation.
- Website status/heartbeat: 30 seconds only for an active visible-tab session. Offline after
  90 seconds, expired after 120 seconds without it.
- Mod presence heartbeat: 30 seconds, aggregated across at most 20 sessions and eight owned
  placements. A group placement is hidden after 90 seconds without
  its owner's heartbeat.
- Preview source is final `previewImageData`, never compare mode.
- Pick the largest tile resolution in `128, 64, 32, 16` whose atlas is at most 4096 px per
  side and 16,777,216 pixels. Retry once at the next lower resolution if PNG exceeds 8 MiB.
- PNG dimensions must equal `grid.wide * tileResolution` by `grid.tall * tileResolution`.
- Storage uses immutable `owner/session/revision-sha256.png` objects in private `mapkluss-lens`.
  Keep the current and immediately previous revision during the signed-URL grace period.
- The mod allows only one preview download/decode per session, keeps only the newest pending
  revision, rejects compressed bodies over 8 MiB, validates PNG dimensions before decode,
  and caps all installed Lens atlases to a shared 256 MiB texture budget.
- Realtime uses an unguessable capability channel. It is only a wake-up signal; all
  metadata, authorization, coordinates, and preview bytes still require authenticated HTTP.
- Server maintenance processes at most 50 candidate sessions per invocation and never trims
  objects belonging to an active session. Unknown and in-flight future revision paths are kept.

## Stable Errors

`lens_disabled`, `unauthorized`, `publisher_required`, `device_required`, `not_found`,
`not_joined`, `forbidden`, `invalid_code`, `revision_conflict`, `session_gone`,
`invalid_preview`, `preview_too_large`, `placement_limit`, `rate_limited`, `invalid_request`.

Error responses include `{ apiVersion: 1, error, message?, retryAfterMs? }`.
