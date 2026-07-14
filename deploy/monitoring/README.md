# Public monitoring

`public-smoke.mjs` performs read-only checks for:

- gateway process health;
- cached upstream readiness and freshness;
- Yandex staging root and SPA fallback for `/cloud`, `/device`, and dynamic `/art/:id` routes;
- TLS validity with at least 14 days remaining.

Yandex Object Storage returns the configured SPA error document with HTTP `404` for object keys that do not exist. Route checks therefore accept only `200`, or `404` when the response is HTML and still contains the React root. A plain provider 404, missing application shell, redirect, or other status remains a monitoring failure.

The GitHub Actions monitor runs twice per hour and can be run manually. GitHub Actions failure notifications are the initial alert channel; a provider-independent uptime service can be added after the production endpoint and alert destination are finalized.

The monitor intentionally does not use user sessions, database credentials, service-role keys, or mutating API requests.

## Russian ISP release gate

`check-russia.sh` uses Globalping eyeball probes to test the same set of Russian networks against Yandex staging, the API gateway, and Yandex Object Storage. It deliberately prints provider names, status, and latency without probe IP addresses. Run it before a domain cutover:

```bash
./deploy/monitoring/check-russia.sh
```

This distributed check complements but does not replace a real phone/mobile-data and user VPN test.
