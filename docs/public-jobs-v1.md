# Darbų skelbimai — V1 implementation and collector handoff

Status: **limited production release requested; collector pilot pending**. The separate `localpro-preview` Supabase project (`hznpdchpdtqejqonxkgm`) was restored and migrations 025–032 were applied there on 2026-09-24. Preview HTTP import and phone-number filtering passed with synthetic jobs, which were removed afterward. Production migrations 031–032 were applied to `localpro-lt` after verifying the project identity. Real collector access and login remain to be checked during the controlled pilot.

## Architecture and existing-system fit

- Base: `origin/main` commit `0b1c897` (2026-09-18), Next.js 16 + Supabase. The feature is in the LocalPro app, not the separate marketing CRM.
- Trades reuse `service_subcategories.id` UUIDs and its active flag. A service may appear in multiple presentation categories; jobs refer to the canonical service once. `GET /api/jobs/taxonomy` exports active IDs, names and slugs.
- The app has no canonical city/municipality table. `job_areas` is a deliberately small V1 area taxonomy with explicit `town` versus `municipality` kinds. It does not modify contractor operating-area text or infer a town from a group name. Unknown areas return `unsupported_taxonomy`. Expand only after reviewing names and aliases. `Vilnius` and `Vilniaus rajonas` have distinct IDs.
- Existing `job_requests` are homeowner enquiries, and `imported_leads` is a contractor acquisition flow. Neither is used for this index.
- Supabase Auth identifies unrestricted readers. A complete specialist profile is not required. The existing `/login?next=` and OAuth callback return to the jobs path; the safe-return helper rejects external/backslash URLs. Existing CRM auth is untouched.

## Data and access

Migrations `031_public_jobs.sql` and `032_public_jobs_contact_filter.sql` add jobs, trade and area associations, private import audit and rate buckets, minimal guest sessions/reveal receipts and admin actions. All new tables have RLS enabled and no browser grants. Service role alone reads or mutates them through server routes. Import, associations and acceptance audit are one PostgreSQL function transaction. A canonical URL and namespace-aware source identity are independently unique. An import cannot change status, timestamps, IDs or content of an existing job. A later supplied post ID fills a null ID only when URL and identity agree. Cross-posts with different Facebook post identities are *not* automatically merged.

The feed function excludes `status != active` and `expires_at <= now()` on every read. Expiry is `posted_at + interval '14 days'`; no scheduler is required for visibility. The background cleanup removes expired guest sessions, audit older than 90 days, rate buckets older than two days and admin-action history older than a year. It **does not purge job identity rows**, preserving deduplication; long-term job-row retention needs a separate future policy if storage becomes material. Changing the 14-day lifetime requires a reviewed migration; it does not silently extend existing rows.

## Import contract

`POST /api/private/jobs/import` over HTTPS, `Authorization: Bearer <preview-or-production-specific high-entropy token>`, `Content-Type: application/json`; one job per request, 8 KiB maximum. Schema: [public-jobs-import.schema.json](public-jobs-import.schema.json). The token is server-side `LOCALPRO_JOBS_IMPORT_TOKEN`; deleting/revoking it disables imports. Rotate by updating the server secret and collector together; use a distinct preview token. The browser gets neither this token nor a Supabase service-role key. `LOCALPRO_JOBS_CURSOR_SECRET` is a separate 32+ character server-only signing secret. `CRON_SECRET` protects cleanup.

Fetch `GET /api/jobs/taxonomy` from the target environment first. Put the returned active service UUID(s) in `trade_ids` and returned area ID(s) in `area_ids`. Do not invent UUIDs or area slugs. Example *synthetic* body (replace the service UUID with an ID returned by that environment):

Migration `033_job_areas_lithuania.sql` covers all 60 Lithuanian municipalities and Varėna town, preserving the original pilot IDs. Use an exact town ID when present. If a smaller town is absent, use its municipality ID **only after independently verifying the town belongs to that municipality**; keep the original town name in the short summary. If the municipality cannot be verified, hold the post for review rather than assigning a nearby or similarly named area. New areas must be added to the canonical seed and migration, not guessed by the collector. After the 033 rollout, confirm both `varena` and `varenos-rajonas` appear in the live taxonomy before retrying the held Varėna request.

```json
{
  "schema_version": 1,
  "source_platform": "facebook",
  "source_url": "https://www.facebook.com/groups/123/posts/456/",
  "source_post_id": "456",
  "source_name": "Vieša remonto grupė",
  "source_visibility": "public",
  "request_type": "work_request",
  "title": "Vonios plytelių klojimas",
  "summary": "Ieškomas meistras vonios sienų ir grindų plytelėms kloti Lentvaryje.",
  "has_contact_number": true,
  "trade_ids": ["<UUID from GET /api/jobs/taxonomy>"],
  "area_ids": ["lentvaris"],
  "posted_at": "2026-09-20T10:00:00+03:00"
}
```

The accepted request title and summary must be original, neutral Lithuanian plain text, without copied full posts, names, addresses, contacts or links. `has_contact_number` records whether a reviewer verified a phone number in the original post; it never stores or displays the number itself. The board checkbox filters for verified `true` values and links to the original post for contact details. Obvious contact/link patterns are rejected, but this is not proof of privacy or factual availability. The collector must classify a concrete work request, not an advert for a tradesperson's service or general recruitment. Both `source_visibility` and `request_type` are assertions, not verified facts. Do not guess location, timing, budget or date. An exact timezone-aware publication instant is required; an unknown/relative-only date is rejected, not replaced with import time. Five minutes of future clock skew is tolerated. The age boundary is exclusive: exactly 14 days old is rejected.

Supported URL shapes: `https://(www|m).facebook.com/groups/{group}/(posts|permalink)/{numericPostId}/`, `https://(www|m).facebook.com/{page}/posts/{numericPostId}/`, and `story.php?story_fbid={numericPostId}&id={numericPageId}`. Exact Facebook hosts only; tracking query and fragment are dropped. A short/share URL, group homepage, redirect, HTTP URL, deceptive host or mismatched supplied ID is rejected. The server does **not** fetch the link, so source availability/public visibility is not verified. Page-name versus numeric-page URL aliases may conflict rather than auto-merge; the collector should use stable canonical permalinks.

Responses: `201 {"outcome":"accepted","job_id":"..."}`; `200 duplicate` with same ID; `422 rejected` with stable `reason_code` and field codes; `409 conflict` for inconsistent identities; `401` bad credential; `429` with `Retry-After`; `503` transient storage/config problem. Never retry 4xx validation/auth/conflict automatically. Network timeout or 5xx may be retried with bounded exponential backoff; uniqueness makes a completed-but-timed-out import return `duplicate`. The shared DB rate bucket allows 30 authenticated attempts per minute. Rejected text is not echoed or logged.

## Feed, guest gate and operations

`GET /api/jobs/feed?trade=<UUID>&area=<area-id>&period=1d|3d|7d|all&cursor=<opaque>&action_id=<UUID>` returns at most six jobs, `has_more` and a signed next cursor. Filters are conjunctive; each job appears once even with several trades. Order is `posted_at DESC, id DESC`; the cursor includes a created-at snapshot to avoid newer imports shifting later pages. Cursors are tied to filter values. Responses are private/no-store. `GET /api/jobs/taxonomy` is a small read-only export.

Guest first batches are free. Each successful further page consumes one of five 24-hour session reveals, with an idempotent action ID and server-side row lock. A sixth reveal is gated only if matching jobs remain. Filters do not reset the session count. Clearing cookies can restart this intentional soft gate. Registered Supabase users get bounded ungated pages. The browser persists page cursors and action IDs in session storage to replay a session after refresh/login without consuming new reveals; previously rendered cards are not copied into browser storage.

`/darbu-skelbimai` is linked in the global footer. `/admin/darbu-skelbimai` is protected by the existing admin allowlist and shows counts and recent jobs. Admin hide/close writes an audit action atomically. The public “Pranešti apie skelbimą” link routes to the existing support mailbox with only the job ID; support must investigate, and one report does not auto-hide. The import credential cannot moderate. There is no Facebook availability polling or independent source verification.

## Preview, rollback and release gates

1. The **non-production LocalPro** Supabase project is `localpro-preview` (`hznpdchpdtqejqonxkgm`), distinct from the live `localpro-lt` project and the CRM project. Migrations 025–032 were applied there in order, and jobs-table RLS/no direct anon or authenticated access was checked. Do not use the CRM project or production keys.
2. The jobs branch has a verified preview-project secret key, preview publishable key, and branch-scoped cursor/import/cron secrets. Its [preview board](https://meistru-zemelapis-5m4p1bzan-lentvaris.vercel.app/darbu-skelbimai), taxonomy, and empty feed return HTTP 200. Use synthetic fixtures only there and probe browser grants/RLS directly.
3. Run import/duplicate/concurrency/failure/expiry/filter/gate/auth/admin and mobile/desktop checks. Keep a screenshot and per-check PASS/FAIL/NOT TESTED report. Test a real login/signup return path (including email verification if enabled) before calling the preview ready for user testing.
4. Separately confirm the collector's permitted Facebook access method. Conduct a human-reviewed pilot of about 20 recent eligible posts, checking classification, geography, dates, links, multi-trade and duplicates. Do not connect an autonomous live collector before that review.

Rollback before real imports: revert the jobs deployment and remove its importer/cursor secrets; leave the additive tables in place until any audit and identity data has been reviewed. After real imports, export required audit/identity data and decide retention/removal before any destructive rollback. No rollback SQL is run automatically.
