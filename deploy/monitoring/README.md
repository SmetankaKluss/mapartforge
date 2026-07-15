# Public monitoring

`public-smoke.mjs` performs read-only checks for:

- gateway process health;
- cached upstream readiness and freshness;
- gateway Auth, REST, Storage, Edge Functions, and Realtime WebSocket data plane;
- production and Yandex staging application shells;
- Yandex staging root and SPA fallback for `/cloud`, `/device`, and dynamic `/art/:id` routes;
- TLS validity for production, staging, and gateway with at least 14 days remaining.

Yandex Object Storage returns the configured SPA error document with HTTP `404` for object keys that do not exist. Route checks therefore accept only `200`, or `404` when the response is HTML and still contains the React root. A plain provider 404, missing application shell, redirect, or other status remains a monitoring failure.

The GitHub Actions monitor runs twice per hour and can be run manually. A failed check opens or refreshes one public actionable issue; the next healthy run closes it. `monitor-backups.yml` independently checks that the latest KMS-encrypted daily generation is no older than 36 hours and that a disposable restore drill has passed within 35 days.

These workflows provide an actionable interim alert path, but GitHub cannot alert when its own scheduler stops. Keep the provider-independent uptime/heartbeat monitor as a required follow-up before infrastructure work is considered complete.

The monitor intentionally does not use user sessions, database credentials, service-role keys, or mutating API requests.

## Russian ISP release gate

`check-russia.sh` uses Globalping eyeball probes to test the same set of Russian networks against Yandex staging, the API gateway, and Yandex Object Storage. It deliberately prints provider names, status, and latency without probe IP addresses. Run it before a domain cutover:

```bash
./deploy/monitoring/check-russia.sh
```

This distributed check complements but does not replace a real phone/mobile-data and user VPN test.
