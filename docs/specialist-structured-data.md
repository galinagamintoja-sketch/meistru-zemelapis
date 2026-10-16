# Specialist structured data: verified identity, not inferred business status

## Scope and publication safety

`lib/seo.ts::profileJsonLd()` emits a Schema.org `ProfilePage` with a stable canonical `@id`, a `Person` or `Organization` main entity, and explicit `Offer` → `Service` links to the provider and its publicly listed operating places.

- Individuals remain `Person`; a company name, legal-form prefix, contact/WhatsApp/portfolio badge, approval, invoice claim or description is **not** business verification.
- A business becomes `Organization` only after an authorized reviewer checks evidence that the named organization exists and that this profile legitimately represents it. The reviewed name must match the current public company name. Invalid/future timestamps, revoked or unavailable evidence fail closed to `Person`.
- We deliberately do **not** emit `LocalBusiness` or a trade-specific subtype: operating areas are not proof of business premises, a public address, or specialist qualifications.
- `Person.jobTitle` is the public profile's trade/category label, not an occupation inferred from the legacy landing-page slug. Public service labels are used without internal slug fallbacks.
- Service operating areas are `Place` values (the stored values can be cities, villages or districts), not invented business addresses. `areaServed` is on services/organizations, not on `Person`.
- All publicly supplied profile photographs with valid public HTTP(S) URLs are eligible; placeholders, signed storage links, credential-bearing URLs and executable URL schemes are not used as entity images.
- No address, exact coordinates, phone/email fields, qualifications, certifications, company identifiers, legal names, reviews or aggregate ratings are added. The public description is preserved as text; claims inside it are not promoted to independently verified credentials.
- Private, unapproved, unconsented, demo and obvious test profiles are blocked both by the page and by the JSON-LD generator. Thin but otherwise public profiles retain their existing noindex behavior.
- Canonical profile URLs and legacy redirects are unchanged; `return` parameters never enter JSON-LD entity URLs. Native script rendering keeps the existing `<` escaping to prevent script termination.

## Verification storage and administrative procedure

Migration `036_verified_profile_business_identity.sql` creates `profile_business_verifications`. It is RLS-enabled, has no public/authenticated policies or grants, and is accessible only to the service role/authorized database operators. No self-service registration or profile editor accepts verification data.

Before creating or replacing a record, the reviewer must:
1. Check a reliable registry record or business document against the precise public company name.
2. Verify that the profile represents the business, rather than merely mentioning a business with the same name.
3. Record the private evidence reference, verification method (`registry_record` or `business_document`) and authenticated reviewer identity in `verified_by`; never infer them from profile text.
4. Store the matching `verified_name`, actual review timestamp and `revoked_at = null` using an authorized service-role/database operation. There is intentionally no new owner-facing verification endpoint or automatic backfill.
5. Revoke the record when evidence no longer supports the identity; re-review before clearing revocation. Editing `company_name` automatically revokes the previous record, even if the owner later restores the old name.

The public profile lookup performs a separate verification query for the single matching profile. It selects **only** reviewed name, timestamp and revocation status. Evidence and reviewer details never enter the public `Specialist` object or JSON-LD. Other public list queries need no new database columns or joins. Account/profile deletion cascades to the verification record.

A missing migration or database error must not break profile pages or promote a business. The helper removes any preexisting projection and falls back to `Person`. This makes code-before-migration rollout safe, although business markup remains disabled until the migration and genuine evidence records exist.

## Verified implementation results

- Full suite: **373 passed, 2 skipped** (the pre-existing opt-in local account-deletion integration tests).
- Typecheck and optimized Next.js production build passed; lint: **0 errors, 8 existing warnings**.
- Checked the used property domains/ranges against Schema.org's current JSON-LD vocabulary, including `areaServed`, `jobTitle`, `makesOffer` and `provider`.
- Fetched the public production specialists API (HTTP 200) and exercised the new generator locally against all **15 returned public profiles**. Canonical URLs, visible names/trade/descriptions and absence of unsupported/private fields passed. This was a read-only check, not a deployment or a business-verification backfill.
- Verified business examples are explicitly synthetic local test fixtures. No actual business has been declared verified, and migration 036 has not been applied to production in this task.
- No dependency versions were changed. `npm ci` reported existing dependency audit advisories (3 moderate, 10 high, 1 critical); dependency remediation is outside this structured-data change.

## Tests and rollout

- `tests/profile-jsonld.test.ts`: individual and evidence-verified business schemas; name-only/contact-only rejection; revoked, missing, mismatched and future evidence; public content agreement; actual page rendering/metadata/canonical redirects; protected pages; excluded private fields; safe images and script escaping; self-service input protection; database failure fallback.
- `tests/profile-business-database.test.ts`: applies the real SQL using PGlite/Postgres, verifies private role permissions and proof constraints, no automatic promotion, name-change revocation (including owner edits), no revival on name restoration and deletion cascade.
- Existing SEO, public-profile, photo, consent, account deletion and routing tests remain in the full test run.

Production database changes and deployment are separate steps. No existing company profile should be automatically labelled verified. After approval and rollout, inspect actual page-source JSON-LD for a genuine reviewed business and an individual, validate with Schema.org Validator/Google Rich Results Test, and compare with visible content. Passing automated tests or hosting deployment is not proof of Google indexing, a rich-result entitlement, or ChatGPT ingestion.
