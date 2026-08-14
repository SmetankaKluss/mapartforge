# Read-only load rehearsal

`read-only-load.mjs` exercises the public data plane without a user session and without mutations. Each virtual client checks REST, an empty Storage listing, unauthenticated Cloud/Lens rejection, and a Realtime WebSocket handshake. Gateway mode also checks cached health/readiness.

The default levels are `10,25,50,100`; each level spreads arrivals over ten seconds. A level stops the run when the aggregate error rate exceeds `2%` or p95 exceeds `3000 ms`. `MAPKLUSS_LOAD_RAMP_MS` can change the arrival window; a shorter window is an explicit burst test and should not be interpreted as normal Lens traffic.

```bash
MAPKLUSS_ANON_KEY=... node deploy/load/read-only-load.mjs
MAPKLUSS_ANON_KEY=... MAPKLUSS_LOAD_LEVELS=25 node deploy/load/read-only-load.mjs --direct
```

This is a transport/data-plane rehearsal, not proof of authenticated Cloud-save or active Lens revision capacity. Those require controlled QA identities and dedicated fixtures. Never add bearer tokens, device tokens, art identifiers, server addresses, or raw responses to load-test output.

`realtime-hold.mjs` opens and holds the same `10,25,50,100` Realtime WebSocket levels for 15 seconds each. It measures connection establishment separately from the hold period and closes every socket before advancing.

```bash
MAPKLUSS_ANON_KEY=... node deploy/load/realtime-hold.mjs
```
