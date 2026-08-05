# Automatic account deletion dependency inventory

Branch baseline: `a3d57889faa8c5dff933b54f63c66376a9d4f1da` (PR #24 merge).

This inventory is based on repository migrations `001`–`024` and the current server routes. It defines the deletion policy before migration `025` is implemented. Production was not queried or changed.

## Ownership roots and execution order

The authenticated identity is `auth.users.id`. `public.users.auth_user_id` maps it to the LocalPro user, and `tradesperson_profiles.user_id` maps the LocalPro user to an optional profile. An authenticated account may have neither a `public.users` row nor a linked profile.

The worker must use the server-resolved Auth user ID and process one locked request idempotently. The safe order is:

1. lock and mark the due deletion request as processing;
2. resolve the LocalPro user and owned profile on the server;
3. inventory and remove every `profile-photos` object under the owned profile prefix, including unfinalised uploads;
4. transactionally delete/anonymise relational data and mark the job complete or failed;
5. delete the Supabase Auth user last.

Storage and Auth are external to the PostgreSQL transaction. Therefore the job must persist stages and be safe to retry after partial completion. Deleting a missing Storage object, profile, LocalPro user, or Auth user must count as success.

## Dependency policy

| Relation / resource | Current link and delete action | Account-deletion policy | Integrity and reason |
|---|---|---|---|
| `auth.users` | Root identity; no repository FK from `public.users.auth_user_id` | Delete last through the protected server worker | Removes login credentials and OAuth identities only after application cleanup succeeds. |
| `public.users` | `auth_user_id` is unique but has no FK to `auth.users` | Delete | Account-owned identity row is not needed after completion. Deletion causes profile `user_id` and historical user references to become null under existing FKs if still present. |
| `tradesperson_profiles` | `user_id -> users(id) ON DELETE SET NULL` | Delete when owned by the account | Contains personal/public profile data. Ownership must be checked by the worker; never accept a profile ID from the browser. |
| `operating_areas` | Profile FK `ON DELETE CASCADE` | Delete with profile | Contains precise location geometry and is purely profile-owned. |
| `profile_services` | Profile FK `ON DELETE CASCADE` | Delete with profile | Pure profile configuration. Taxonomy rows are retained. |
| `profile_category_assignments` | Profile FK `ON DELETE CASCADE` | Delete with profile | Pure profile configuration. Category rows are retained. |
| `profile_contact_number_claims` | Profile FK `ON DELETE CASCADE` | Delete with profile | Releases normalised phone/WhatsApp uniqueness claims. |
| `profile_photos` | Profile FK `ON DELETE CASCADE`; replacement self-FK `ON DELETE SET NULL` | Delete with profile after Storage cleanup | Rows include approved, pending, rejected, removed and replacement photos. Database deletion alone does not delete Storage. |
| `profile-photos` Storage objects | Paths are created under `<profile-id>/<uuid>-<safe-name>` | Delete every object under the exact owned profile prefix | Covers row-backed photos, pending replacements, partially finalised, aborted-but-not-removed and abandoned direct uploads. No broad prefix is allowed. |
| `reviews` | Profile FK `ON DELETE CASCADE`; enquiry FK `ON DELETE SET NULL` | Delete with profile | Reviews are published as part of the deleted profile; aggregate columns disappear with it. The underlying homeowner enquiry remains. |
| `verification_statuses` | Profile FK `ON DELETE CASCADE`; verifier user FK `ON DELETE SET NULL` | Delete with profile | Profile verification state has no purpose without the profile. |
| `profile_claim_invitations` | Profile FK `ON DELETE CASCADE`; creating admin FK `ON DELETE SET NULL`; `used_by_auth_user_id` has no FK | Delete with profile | Claim tokens and profile-link history must not survive the profile. |
| `tradesperson_enquiry_states` | Profile and enquiry FKs both `ON DELETE CASCADE` | Delete with profile | Specialist-specific inbox state is account-owned; the homeowner enquiry remains. |
| `enquiries` | Profile and client-user FKs `ON DELETE SET NULL` | Retain, unlink automatically | Homeowner job-request records may be independent of the deleted tradesperson. Existing FK behaviour preserves them without an invalid owner reference. Their homeowner PII is outside this tradesperson-deletion scope. |
| `enquiry_photos` / `enquiry-photos` | Enquiry FK `ON DELETE CASCADE` | Retain with retained enquiry | They belong to the homeowner enquiry, not the tradesperson account. |
| `imported_leads` | `duplicate_of_profile_id ON DELETE SET NULL` | Retain, unlink | Lead provenance is operational history independent of the claimed profile. |
| `whatsapp_conversations` | Profile FK `ON DELETE SET NULL` | Retain, unlink | Conversation/legal history may be needed independently; it must no longer resolve to the deleted profile. |
| `whatsapp_messages` | Conversation FK `ON DELETE CASCADE` | Retain with retained conversation | Not directly owned by the profile deletion root. |
| `consent_logs` | User/profile FKs `ON DELETE SET NULL` | Retain as an unlinked legal record | Consent evidence is necessary after account deletion. Profile/user links become null. Existing consent text, channel and timestamps remain; IP/user agent retention requires an explicit product/legal decision if the continuation of the specification requires anonymisation. |
| `admin_actions` | Admin-user/profile FKs `ON DELETE SET NULL` | Retain as unlinked audit history | Operational/security audit is necessary; profile link becomes null. New deletion audit notes must not copy email, phone, name, address, tokens or Storage URLs. |
| `account_privacy_requests` | Profile FK `ON DELETE SET NULL`; `auth_user_id` has no FK | Retain minimal completed/failed job record | Required for idempotency, monitoring, retry and proof of fulfilment. It must contain identifiers/status/timestamps/error code only, not profile PII or tokens. Data-export requests remain separate. |
| `account_resolution_audit` | Stores `auth_user_id`, outcome/count/timestamp; no FK | Retain minimal security audit | It already avoids raw email/profile details. A later retention policy may purge old UUID-only audit rows. |
| Service categories, subcategories, aliases and category assignments between taxonomy rows | No account ownership | Retain | Shared taxonomy. Only profile join rows are deleted. |

## Existing platform behaviour and gaps

- `POST /api/meistras/account-requests` currently requires a session through `requireOwnedProfile`, checks same-origin when an Origin header exists, inserts a pending request, and optionally writes an admin action. It neither hides nor schedules nor deletes anything.
- Despite its name, `requireOwnedProfile` supports an authenticated account with no linked profile. Mutation routes then reject or no-op individually when `profile` is absent.
- Every `/meistras` page is protected by the server layout, which calls Supabase `auth.getUser()` through `requireTradespersonUser`; unauthenticated users are redirected to `/login`. There is no repository middleware file.
- Profile mutation routes (`profile`, `services`, `areas`, `photos`, `visibility`, and login-email) do not currently check for a pending deletion. A shared server-side guard is required; hiding UI controls alone is insufficient.
- The repository has no `vercel.json`, Vercel Cron route, Supabase `pg_cron` schedule, background worker, or job lease infrastructure.
- The repository has no application transactional-email dependency. Supabase Auth email flows exist for sign-up, password recovery and email changes only.
- The `profile-photos` bucket is configured private by later migration hardening. Server routes create signed upload URLs. Current object paths use the profile UUID as the first path segment.
- Enquiry photos live in a separate private `enquiry-photos` bucket and must not be removed by tradesperson account deletion.

## Required invariants for implementation

- Scheduling, cancellation, retry and processing derive `auth_user_id` from the verified server session or protected worker record; browser email/profile IDs are never trusted.
- Scheduling and immediate profile hiding must be atomic in PostgreSQL when a profile exists.
- Only one active deletion request may exist per Auth user. Repeated schedule/cancel/worker calls must be idempotent.
- Pending deletion blocks all owner mutations server-side, including profile, services, areas, visibility, login email and photo upload/finalisation/removal/reordering. Read-only access and cancellation remain available.
- Data-export requests are not cancelled, blocked or consumed by deletion-job status transitions.
- Worker and admin retry endpoints require independent server secrets/admin authorisation and are never executable by `public`, `anon` or ordinary `authenticated` database roles.
- Failed jobs expose a stable safe error code and attempt metadata, never secrets or personal data.
- No Production migration, cron or destructive verification is authorised in this task.
