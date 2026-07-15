# Yandex watchdog

This dependency-free Node.js Cloud Function runs outside GitHub Actions and fails when:

- production, staging, or the gateway is unavailable;
- cached gateway readiness is unhealthy or stale;
- the gateway Auth route no longer reaches the upstream;
- a public TLS certificate has fewer than 14 days remaining;
- the latest completed public-smoke, backup, or backup-freshness workflow failed or became stale.

The function contains no user session, database credential, service-role key, cloud key, or alert recipient. A timer invokes it every ten minutes through a dedicated service account. Yandex Monitoring owns notification recipients and recovery state.

Recommended alerts:

1. `serverless.functions.errors_per_second` for this function: alarm when greater than zero; no-data state is OK.
2. `serverless.functions.finished_per_second` for this function: aggregate over 20 minutes and alarm when no invocation completed; no-data state is Alarm.

Send Alarm and OK transitions to an email/push/Telegram notification channel. The recipient must be a Yandex Cloud account with `monitoring.viewer` for the folder and Monitoring notifications enabled in console settings.

Rollback is scoped: disable or remove the timer first, then remove the function and its dedicated invoker account. Runtime site assets, DNS, gateway, Supabase, backups, and Storage objects are not consumers of this watchdog.
