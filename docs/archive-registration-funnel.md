# Facebook archive → specialist registration funnel

This measures the archive **on LocalPro** (`/darbu-skelbimai`), not activity inside Facebook. It is additive to the consent-safe tracking and private reporting in PR44. It does not change Google sign-in, registration authorization, archive pagination, or profile persistence.

## Four distinct stages

1. `archive_visit`: a consenting visitor views the archive.
2. `archive_registration_prompt`: the archive's actual guest registration dialog is shown after the visitor requests more jobs.
3. `archive_register_click`: the visitor explicitly clicks **Tęsti su Google nemokamai** in that dialog. Opening the dialog, an automatic redirect, or clicking a Facebook post is not this event.
4. `archive_registration_complete`: a newly persisted specialist profile is confirmed after that attributed click. The existing `sign_up` event remains separate; a click, Google sign-in alone, existing-profile response, failure, demo/seed response or direct unrelated registration is not an archive completion.

## Consent and attribution

- No events or archive-attribution writes before accepted analytics consent. Only HTTPS `localpro.lt` and `www.localpro.lt` can activate tracking; previews and other brands are excluded.
- A minimal versioned `sessionStorage` record retains only the ordered stage and timing information for a fixed maximum 30-minute journey. It survives a same-tab OAuth round trip without sending an account ID or modifying the OAuth flow.
- A normal same-tab Google CTA waits for a trusted collector acknowledgment for **at most 500ms** before navigating. The isolated frame signals its own impending disposal so the SDK flushes its batch, then acknowledges the bridge after a short dispatch grace period; Google's event callback alone proves only queueing, not transmission. The independent timeout or consent withdrawal releases navigation. Without eligible analytics the anchor keeps native behavior; modified/new-tab clicks are not delayed. This prevents losing the click during unload without making registration depend on analytics.
- A later stage requires the preceding stages. Repeated effects, dialog opens, clicks or success callbacks do not manufacture additional stages in the same journey.
- Withdrawal clears pending events and the attribution record. Reaccepting consent does not replay earlier clicks or registrations. Expired/malformed records fail closed; unavailable browser storage must not break the site.
- No names, contact details, user/profile IDs, post IDs, Facebook URLs, query strings, filter values, form content or Google sign-in data are attached to these events. The isolated analytics frame revalidates event names and allowlisted parameters.

## Actual ordered reporting, not unrelated totals

The private reporting integration uses Google's read-only **v1alpha `runFunnelReport`** endpoint with a **closed**, ordered four-step funnel and constant event-name conditions. No custom dimensions or broader Google permissions are needed. Intervening normal website events are allowed; subsequent steps have a bounded duration and client attribution has a fixed 30-minute expiry from the first stage.

The report's aggregate `activeUsers` counts are GA4's users who meet the funnel sequence, not the sum of daily unique users and not a count of every real person. The dashboard can show archive-to-click and archive-to-completed-profile rates; a zero denominator must display an unavailable rate rather than invent a percentage. Empty successful reports are distinct from API/permission failures. The selected reporting date window and its existing timezone caveats still apply.

Limitations: analytics consent, blocked requests/cookies, Google processing delays or thresholds, new tabs/devices, expired journeys, and abandoned OAuth flows can cause gaps. GA4 can deduplicate multiple journeys from one browser/user within the selected window; the client marker is a same-tab attribution aid, not an identity tracker or a guarantee of GA4 session identity. Browser-created or duplicated tabs can inherit sessionStorage from an opener; stage deduplication is per tab, not a strict cross-tab guarantee. No retroactive history is created. These totals do not measure behavior after opening a post inside Facebook.

Official API contract: https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1alpha/properties/runFunnelReport

## Verification commands

```sh
npm test
npm run typecheck -- --incremental false
npm run lint
npm run build
npx playwright test --config=e2e/analytics.config.ts
npx playwright test --config=e2e/analytics-sdk.config.ts
PLAYWRIGHT_BASE_URL=https://<exact-preview>.vercel.app npx playwright test --config=e2e/archive-funnel-ui-live.config.ts
python scripts/verify-google-reporting-local.py
```

The hosted archive test hydrates the exact preview on an intercepted LocalPro origin, exercises the real archive dialog/Google CTA, and runs the real Google SDK. Its OAuth return and successful profile acknowledgment are controlled fixtures; every Google collection request is intercepted. It creates no real account or profile and does not prove production ingestion. The local reporting probe uses the existing private read-only setup and real Next routes/Google APIs. Google currently repeats identical `activeUsers` headers in an empty funnel visualization; a captured-shape regression covers that valid response without recording credentials or production user data.

## Verification and release boundaries

- A read-only probe on 2026-10-18 called the real funnel endpoint for the existing LocalPro property using the existing reader credential: **HTTP 200**, a `funnelStepName` dimension and valid empty rows. It emitted no events. This proves API availability/permission, not production collection.
- Frontend behavioral tests must cover ordered stages, actual dialog/button hooks, consent, withdrawal, expiry, reload/OAuth-return persistence, malformed/unavailable storage, successful-new-profile boundaries and payload privacy.
- Reporting tests must cover the closed ordered request, response parsing, empty results, independent errors, caching and whole-snapshot deadlines.
- Verify the final commit and hosted preview. PR44 remains subject to production release approval; private production configuration alone does not deploy it.
- After deployment, separately verify real consented collection and the protected report. Do not report live counts or an operating alert system from fixtures, preview checks or a valid empty API response.
