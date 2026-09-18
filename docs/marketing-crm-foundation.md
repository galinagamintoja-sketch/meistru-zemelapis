# Marketing CRM foundation audit

Date: 2026-09-19  
Branch: `feature/marketing-crm-v1`

## Existing application findings

- Next.js 16 App Router application deployed through Vercel; there is no repository `vercel.json` override.
- Admin UI is currently a client-rendered `/admin` page with server API authorization.
- Runtime admin authorization uses Supabase Auth and `ADMIN_EMAIL_ALLOWLIST`; signed legacy sessions are test-only.
- Private writes use the server-only Supabase service-role helper. Public browser roles are restricted by RLS.
- SQL migrations use zero-padded sequential names; `030_tradesperson_labour_rates.sql` was the latest migration on `origin/main`.
- Specialist self-registration writes a directly owned, approved/public record to `tradesperson_profiles`; phone and email are present at the committed profile boundary.
- Lithuanian phone canonicalization already exists in migration `020` and accepts `+370`, `370`, domestic `0`, and legacy `8` formats.
- API handlers use Next.js route handlers, `NextResponse`, shared validation helpers, and server-side service-role access.
- Tests use Vitest for unit/source-level tests and Playwright for browser flows.
- Local Node is `v24.15.0`. The repository did not declare a Node engine. Current pg-boss `12.33.2` requires Node `>=22.12.0`; it was deliberately not installed because this phase does not deploy a permanent worker.

## Implemented architecture

- Supabase remains the authoritative CRM store.
- Migration `031_marketing_crm_foundation.sql` creates separate contact, identity, source, import, conversation, message, sequence, draft, approval, queue, event, suppression, channel-account, and settings records.
- All marketing tables have RLS enabled and direct `anon`/`authenticated` access revoked. Existing authenticated admin routes are the UI boundary.
- The send queue is durable and has unique idempotency keys. No Vercel request runs a background loop.
- `MarketingChannelAdapter` defines the future Telegram/email/SMS boundary; the only current implementation is a fail-closed unconfigured adapter.
- Incoming messages pause active acquisition enrollments and cancel queued/leased work in a database trigger before any AI classification.
- Specialist profile writes invoke registration reconciliation in the database. Unique matches register the contact and cancel acquisition work; ambiguous matches pause for review.
- Draft approval is revision-bound and queues the exact approved revision atomically through `approve_marketing_draft`.

## Import behavior

- `POST /api/admin/marketing/import/contacts` accepts multipart XLSX/CSV or scoped JSON input.
- Admin sessions are accepted. A future collection helper can use only `MARKETING_IMPORT_API_KEY` through `x-localpro-import-key`; it never receives Supabase credentials.
- Preview returns `new`, `existing_contact`, `update_existing`, `conflict`, or `invalid` for each row.
- Phone and email are normalized independently. A phone/email split between two contacts is quarantined.
- Names, trades, and locations never cause identity merges.
- Repeat imports reuse exact phone/email owners. Blank imported values and manually corrected fields are not overwritten.
- Sources are append-only by their natural source key. The importer never changes contact lifecycle status or suppressions.

## Admin routes and pages

- `/admin/marketing`
- `/api/admin/marketing/contacts`
- `/api/admin/marketing/overview`
- `/api/admin/marketing/import/contacts`
- `/api/admin/marketing/drafts`

The Marketing workspace provides responsive Dashboard, Contacts/import, Outreach Queue, Inbox, Drafts, and Settings views. Live transports, automatic sending, AI drafting, and mailbox/SMS/Telegram integrations remain intentionally absent.

## Verification

- Baseline: 278 passed, 2 skipped; typecheck/build passed; lint had 7 warnings.
- Foundation: 287 passed, 2 skipped; typecheck/build passed; lint retains the same 7 pre-existing warnings and adds no errors.
- Playwright marketing checks: desktop overview and 390 px Android-sized contacts view passed.
- Screenshots: `artifacts/marketing-crm-desktop.png`, `artifacts/marketing-crm-mobile.png`.

## Unresolved before live-channel work

- Apply and validate migration `031` against a non-production Supabase branch/local stack; it has not been applied to production.
- Confirm the Vercel Node version before introducing pg-boss, then provision a separate always-on integration worker.
- Confirm mailbox provider, `meistrai@localpro.lt` availability, and supported SMTP/IMAP or API features.
- Complete controlled Telegram Business Bot capability tests.
- Select Android handset/SIM and test the SMSGate release and signed webhook behavior.
- Obtain the real source workbook for column/header and high-volume import testing.
- Resolve existing npm audit findings, including the current Next.js 16.3.0 advisories, in a separate dependency-hardening change.
