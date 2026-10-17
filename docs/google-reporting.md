# Private Google reporting integration

`lib/google-reporting.ts` is a Node-only (`server-only`, `node:crypto`) read-only reporting client. The integration adds authenticated admin reporting, a private UI, a separately authenticated health monitor and scheduled failure checks. Local runtime verification has called the actual Google APIs; production verification remains separately required.

## Configuration (private server environment only)

All three variables are required; none may use a `NEXT_PUBLIC_` prefix:

- `GOOGLE_REPORTING_CREDENTIALS_JSON`: service-account JSON, with `type: service_account`, `project_id: localpro-501816`, and `client_email: localpro-analytics-reader@localpro-501816.iam.gserviceaccount.com`. RSA private key must be at least 2048 bits. The module reads no credential files and ignores `token_uri`.
- `GOOGLE_REPORTING_GA4_PROPERTY_ID=559398175` (bare numeric ID, not `properties/...`)
- `GOOGLE_REPORTING_GSC_SITE_URL=sc-domain:localpro.lt`

Project, identity, property, and site mismatches fail closed without a network call. OAuth and reporting URLs are fixed HTTPS constants; redirects are forbidden. JWTs are RS256-signed with built-in Node crypto. Scopes are exactly `analytics.readonly` and `webmasters.readonly`. Existing restricted reader roles suffice; no permission broadening is needed.

## Production export and contract

After checking the caller's admin authorization, import:

```ts
import { getGoogleReportingSnapshot } from "../../../lib/google-reporting";

const snapshot = await getGoogleReportingSnapshot({
  window: "28d", // only "7d" | "28d" | "90d"; default "28d"
  includeConversions: true, // optional; default false
});
```

Use a Node runtime (not Edge). A parent route should be dynamic, authenticate **before** requesting data, rate-limit calls, and return `Cache-Control: private, no-store`. Never pass arbitrary user request bodies/config/dependencies into the client. A public frontend must not import this module. The integrated routes/UI are described below.

The returned `GoogleReportingSnapshot` has independent `ga4`, `realtime`, `searchConsole`, and optionally `conversions` results:

- Success: `{ status: "success", empty: boolean, data, fetchedAt }`.
- Failure: `{ status: "error", error: { code, httpStatus, retryable } }`.
- Overall `status` is `success` only when **every requested report** succeeds; otherwise `partial` or `error`. Inspect individual results for alerts. Missing conversions means not requested, **not zero conversions**.
- HTTP 200 with no rows (including Google's omitted `rows`) is valid success with `empty: true`. Never render failures as zero visits/clicks. Malformed/error-bearing 200 responses fail safely.
- `fetchedAt` reflects actual successful retrieval, not a cache hit. Only normalized allowlisted fields are returned. Private key/JWT/access tokens/upstream error messages and response bodies are never included or logged.

Exports for parent alerts/types: `GoogleReportingError`, `ReportingErrorCode`, `ReportingFailure`, `ReportResult`, `ReportingWindow`, `GaDailyReport`, `GaEventReport`, `SearchDailyReport`, `GoogleReportingSnapshot`, `PropertyQuota`, and `sanitizeReportingError(unknown)`. The sanitizer never forwards arbitrary exception messages. Invalid window inputs throw `GoogleReportingError`; operational/configuration failures are captured per report. `createGoogleReportingClient` is for isolated trusted server tests; production should use the module-level singleton to share cache/token work.

## Fixed report semantics

- GA4 `runReport`: daily `date`, `activeUsers`, `sessions`, `eventCount`; date labels selected using the UTC calendar through yesterday (UTC), at most 90 daily rows. GA4 interprets dates in the property's configured timezone; near midnight these are not universally the last completed property-local days. These are daily aggregates, not a rolling hourly window. **Do not sum daily activeUsers into a unique-user total.**
- Optional separate conversions `runReport`: `eventName`, `eventCount`, exact-name filter `generate_lead`, `sign_up`, `contact_click`, same date range, maximum three rows. Counts are events, not deduplicated people or automatically inferred GA4 key events.
- GA4 `runRealtimeReport`: aggregate `eventName`, `eventCount`, default Google realtime window, limit 100 event categories. It is a bounded event list, not a guaranteed exhaustive total when more than 100 distinct categories exist. It is independent of the selected historical window.
- Search Console `searchAnalytics.query`: only dimension `date`, web search, final data, through three UTC days ago to account for processing lag, at most 90 rows. No query/page/user drilldown or indexing mutations. Search Console's date interpretation is its own reporting timezone. It does not prove indexing or represent all visits.
- Every GA4 request sets `returnPropertyQuota: true`. Known numeric quota counters are returned under `data.quota`; missing quotas are `{}`. These counters are not an application-wide rate limiter.

## Facebook archive registration funnel

See [archive registration funnel](archive-registration-funnel.md) for the four consented stages, same-tab OAuth-return attribution, privacy limits and actual ordered GA4 funnel report. This is a closed sequential report, not ratios of unrelated event totals. Archive registration clicks remain distinct from newly completed specialist profiles and do not themselves become `sign_up`.

## Reliability and operational limits

- OAuth renewal starts 60 seconds before expiry; expiry is anchored before the exchange. Refresh is single-flight per client. API HTTP 401 permits exactly one reauthentication; concurrent reports do not invalidate a newer token.
- Each HTTP attempt, including body reading, has an 8-second abort/race deadline and a 512 KB response cap. Up to two retries (three attempts total) for network errors, timeouts, HTTP 429, and 5xx. Ordinary 403 is **not** retried. Only explicit transient reasons `rateLimitExceeded`, `userRateLimitExceeded`, or `RATE_LIMIT_EXCEEDED` enable 403 retries; daily limits and insufficient permissions do not.
- Exponential jitter starts from 250 ms; Retry-After seconds/date is honored up to a hard 5-second wait cap. Retry exhaustion returns typed `retryable: true` so the parent can distinguish temporary upstream failures from permission/configuration failures. It is not a promise the parent should immediately retry the whole snapshot.
- A shared 45-second whole-snapshot budget also bounds OAuth, retries, backoff, a 401 refresh and waits for coalesced work. Remaining budget caps attempts and sleeps; exhaustion returns sanitized per-source `TIMEOUT` while preserving completed reports. Reports execute concurrently. Admin authentication separately fails closed after 8 seconds, leaving headroom beneath the declared 60-second route/page limit. OAuth credential rejection is `AUTHENTICATION`; report HTTP 400 remains `INVALID_REQUEST`.
- Successful caches: GA daily/conversions 5 minutes, realtime 30 seconds, Search Console 15 minutes; identical report loads single-flight. Failures are never cached. Expired entries are pruned and result objects are cloned against caller mutation.
- Cache, access token, and single-flight state are **in-memory per warm Node instance only**. Cold starts, parallel instances, restarts, and deployments duplicate requests. Do not claim a shared/persistent quota cache or rely on this for cross-instance throttling. Add a separately authorized durable cache/lock if traffic requires it. Authorization is enforced before Google calls. Per-warm-instance guards allow 30 admin requests/minute and 6 monitor requests/minute; these are not distributed limits.

## Integrated routes, UI and monitoring

- `/admin/analytics`: dynamic Node-only admin page, noindex, uses existing server-verified admin policy; never changes Google sign-in or roles.
- `/api/admin/analytics?window=7d|28d|90d`: the same admin authentication; private/no-store JSON with independent source results. Invalid windows are 400, anonymous/auth-service-error callers 401, per-instance throttling 429, total report failure 502. A partial report is explicit in its JSON, not a zero-value report.
- `/api/internal/analytics/health`: requires an exact strong bearer token from **private** `GOOGLE_REPORTING_MONITOR_TOKEN`, not an application cookie or query parameter. Returns only status/row-count summaries, no raw reports. HTTP 503 means one or more requested reports failed after client retries; valid empty reports return 200. Requests are private/no-store and noindex.
- Provision a cryptographically random monitor token (at least 32 characters) separately from all existing auth/cron secrets. Store the same value as the GitHub repository Actions secret `LOCALPRO_REPORTING_MONITOR_TOKEN`. Never put it in workflow YAML, frontend config, command arguments or logs.
- `.github/workflows/analytics-health.yml`: hourly production check plus manual dispatch, fixed URL and redirect rejection. Node 24 is explicitly selected and the embedded script uses module mode; its 90-second request limit exceeds the bounded reporting chain. Uses the private monitor secret; failures are durable failed Actions runs and generate GitHub Actions failure notifications according to the recipient's notification settings. **Email/Telegram delivery is not guaranteed or verified by adding this workflow**; enable the owner's desired failure notifications and test delivery. Schedules may be delayed or disabled by GitHub inactivity rules; this is not a guaranteed-time SLA.
- The workflow is active only after it exists on the default branch and both secret stores are configured. Do not merge an unconfigured monitor and report it as operational. Never expose credentials just to work around missing hosting-management authentication.
- Google key-event administration is deliberately unchanged: Viewer/Restricted read roles suffice. `generate_lead` and `sign_up` are emitted on confirmed new saves; `contact_click` is engagement only. Ask the property owner to mark the first two as GA4 key events if desired; do not request Editor merely to read reports.
- Frontend tracking is restricted to HTTPS `localpro.lt` / `www.localpro.lt` and blocks Google entirely until opt-in. A fixed same-origin empty frame isolates the vendor SDK from real form fields, document titles and router history; it is not a security sandbox. Helper response headers prevent indexing and cross-origin framing. The privacy policy describes consent, pseudonymous processing and limitations.
- Existing LocalPro Google OAuth and all Leonamai settings are untouched. No new database migration is required for analytics.

## Real local runtime verification

`python scripts/verify-google-reporting-local.py` reads the supplied Desktop credential only into the spawned Node process environment, uses a temporary in-memory monitor token, starts the actual Next app on localhost, checks anonymous 401 boundaries and calls the actual Google APIs through the authenticated health route. It prints only normalized health metadata and terminates its own process tree. It never creates an env file, prints a key/token, mutates Google data or verifies production implicitly. This opt-in script is not run in CI and requires the original setup file locally.

## Local verification

`npx playwright test --config=e2e/analytics-sdk.config.ts` downloads and executes the **real Google SDK** and checks no pre-opt-in requests and sanitized page-view collection. Collection requests are intercepted, so fixture traffic never enters the property. This verifies SDK transport construction, **not GA ingestion or Realtime/DebugView**. Hosted consent/persistence has separate coverage in `e2e/analytics-ui-live.spec.ts`; gallery tests use an explicit rejected preference.

```sh
node node_modules/vitest/vitest.mjs run tests/google-reporting.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
node node_modules/eslint/bin/eslint.js lib/google-reporting.ts tests/google-reporting.test.ts
```

Tests use fake fetch, synthetic in-memory RSA credentials, and fake clocks/timers; they never inspect environment files or deployed credentials. `server-only` is mocked in the unit suite because Next supplies the boundary marker during application compilation. Existing dependencies only; no installs or production build are needed for this suite.
