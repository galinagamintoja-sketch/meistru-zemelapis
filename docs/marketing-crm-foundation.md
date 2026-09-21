# Marketing CRM foundation audit

Date: 2026-09-19  
Branch: `feature/marketing-crm-v1`

## Existing application findings

- Next.js 16 App Router application deployed through Vercel; there is no repository `vercel.json` override.
- Admin UI is client-rendered with server API authorization through Supabase Auth and `ADMIN_EMAIL_ALLOWLIST`.
- Private writes use the server-only Supabase service-role helper; browser roles are restricted by RLS.
- SQL migrations use zero-padded sequential names; migration 031 remains unapplied.
- Specialist registration writes phone and email at the committed profile boundary.
- Tests use Vitest for unit/source checks and Playwright for browser flows.

## Implemented architecture

- The disposable standalone Supabase project is the authoritative CRM store for this testing phase; it does not require LocalPro application tables.
- Migration 031 defines contacts, identities, sources, imports, conversations, messages, sequences, drafts, approvals, queue records, events, suppressions, contactability evidence, channel accounts, and settings.
- Marketing tables have RLS enabled and direct browser-role access revoked.
- No live transport adapter or background dispatch loop is enabled.
- Incoming messages synchronously stop pending acquisition work. Registration matching is invoked through an explicit service-role integration RPC carrying an opaque LocalPro project ref/profile ID and phone/email evidence; there is no cross-project foreign key or database trigger.

## Import and admin surface

- `POST /api/admin/marketing/import/contacts` accepts multipart XLSX/CSV or scoped JSON input.
- Admin sessions and the scoped `MARKETING_IMPORT_API_KEY` are supported; the service-role key is never exposed.
- `/admin/marketing` provides Dashboard, Contacts/import, Queue, Inbox, Drafts, and Settings views.
- The contacts view uses the API's exact total and page navigation rather than presenting one page as the full count.
- Committed imports persist a sanitized error report downloadable as CSV.

## Identity matching

- Phone numbers are parsed and validated with `libphonenumber-js`; Lithuanian `+370`, `370`, domestic `0`, and historical `8` inputs normalize to E.164. Foreign `+` numbers retain their country.
- Emails are trimmed, syntax checked, and lower-cased. Invalid endpoints remain as evidence with their raw value and invalid reason, but are excluded from matching and sending.
- Identity ownership is contact-scoped. The `(identity_type, normalized_value)` lookup is indexed but is deliberately not globally unique.
- A normalized endpoint with multiple owners is ambiguous and requires review. Phone and email resolving to different owners also requires review. Neither case is silently merged.
- A single existing owner plus materially new endpoint information requires review before the endpoint can be attached.
- Exact repeated rows within one import may resolve to one contact while preserving each distinct source. Repeated endpoint data with a different identity signature requires review.
- Preview queries only normalized candidates from the incoming file, in chunks. Commit repeats the same all-owner checks under an advisory transaction lock.

## Source identity

A source is unique by contact, source type, group URL, post URL, source URL, and label. Exact repeats are ignored; a different Facebook group or post is retained.

## Approval and queue safety

Approval creates an immutable message snapshot containing the revision, body, recipient, channel, channel account, approval time, and reviewer. The queue references this snapshot. Editing, rejecting, changing the recipient/channel/account, or changing the body supersedes the snapshot and transactionally cancels pending queue items.

Provider event IDs are unique within channel and channel account. External message IDs additionally include the provider thread/chat when present. Telegram external IDs without a thread are not treated as globally unique.

## Contactability

Contactability evidence is recorded per contact, optional endpoint, and channel. Recipient category and eligibility default to `unknown`. Acquisition dispatch must fail closed unless the relevant evidence is explicitly `permitted`; legal or business-policy decisions remain human decisions.

## Phase 2 boundary

Batch approval is supported by the schema and atomic API RPC. The current UI still offers individual approval only. A selection/review interface and “approve selected/all reviewed” controls remain Phase 2 work. Dispatch limits, weekday/window rules, delays, attempts, global pause, provider adapters, deterministic opt-out parsing, and scheduled reconciliation are configuration/foundation only until live dispatch is separately authorized and transactionally implemented.

## Standalone registration boundary

- `marketing_contacts` stores `registration_source_project_ref` and `registration_external_profile_id` as opaque external identifiers, without a foreign key to LocalPro.
- `reconcile_marketing_registration_event(...)` is service-role-only and accepts the registration event payload supplied by a future LocalPro integration worker.
- Contact imports never query LocalPro tables. Registration-event delivery, retry/idempotency orchestration, and production project allow-listing remain integration work and are not enabled in this foundation.

## Verification boundary

Migration 031 has not been applied to local, disposable, preview, or production Supabase. Database execution and authenticated Preview browser verification remain required after this hardening pass is reviewed and explicitly authorized.
