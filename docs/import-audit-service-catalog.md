# Import audit: service catalog and specific-service filters

## Scope

Customer-request classification remains in Aladina. This change does not infer customer intent, revisit held posts, or reimport any listing. No importer schema/token, source identity, duplicate protection, publication date, expiry or listing body is changed.

Migration 034 adds or reactivates only these canonical services, retaining an existing matching slug's UUID:

| Service | Existing parent category | Slug |
| --- | --- | --- |
| Dekoratyvinis tinkavimas | Vidaus apdaila | dekoratyvinis-tinkavimas |
| Pamatų šiltinimas | Fasadai ir šiltinimas | pamatu-siltinimas |
| Statybinių medžiagų pristatymas ir užnešimas | Statyba ir konstrukcijos | statybiniu-medziagu-pristatymas-ir-uznesimas |

UUIDs come from the target database, not source constants. Canonical category assignments are inserted for registration and catalog discovery. The existing protected `GET /api/private/jobs/import/taxonomy` reads active database subcategories dynamically; its contract remains unchanged.

The public board gains a separate `service=<subcategory UUID>` filter. Existing `trade=<category UUID>` links/cursors remain compatible. Service, category, location, date and contact constraints are conjunctive. Each facet ignores its own selection and retains the others. Counts deduplicate job joins. The public taxonomy now also includes active `services` with `id`, `name`, `category_id`, and contextual `count`.

## ICF listing correction

Migration 035 replaces only the `Karkasinių namų statyba` association of source post `2145257802786153` with existing method-neutral `Individualių namų statyba`. ICF means insulated concrete form construction, not timber frame; no new construction-method service is necessary. Other associations are retained. No `public_jobs` row is updated or deleted.

Live read-only baseline verified on 2026-10-14 using the public feed and category API:

- Job UUID: `fd693666-0555-4ecb-bd52-d76cc814ea4e`
- Title: Vieno aukšto namo statyba iš ICF blokelių Šiauliuose
- Original URL: https://www.facebook.com/groups/231707407474545/posts/2145257802786153/
- Publication timestamp: `2026-10-14T15:27:02+00:00`
- Wrong service UUID: `9b892bc0-d454-44b5-b6a8-d7f17a4a9fc4`
- Correct existing service UUID: `0b229d25-2ae1-48e7-b406-2060e730cb9d`

Migration checks the source-post cardinality, existing Šiauliai association and active construction service/category. An absent post in preview is a no-op; ambiguous/mismatched data aborts. Both migrations are idempotent.

## Local verification completed

- Full Vitest: 339 passed, 2 skipped (unconfigured local account-deletion integration).
- PGlite executes catalog and correction SQL against PostgreSQL-compatible tables. Tests prove old service rows, all job columns (including source identities/dates) and audit rows remain unchanged, unrelated jobs/tags remain intact, and repeat imports remain duplicates after correction.
- All three database-generated services are accepted by the real import RPC and returned correctly by its service-filtered listing RPC.
- The actual protected importer-taxonomy route returns the same generated IDs from the test database. No bearer returns 401. This is local integration evidence, NOT a live importer claim.
- SSR/feed/taxonomy service normalization, invalid values, cursor isolation, gates, contextual counts and Lithuanian UI are covered.
- Typecheck, ESLint (0 errors, 8 existing warnings), seed-mode production build pass.
- Desktop/mobile Playwright service and existing facet fixtures pass; fixtures are explicitly synthetic.

## Production completion evidence (2026-10-16)

Temporary user-supplied Supabase credentials restored authorized production access. No credential was written to a repository file.

- Applied 034 and 035 together in a transaction to verified `localpro-lt` project `kfeplqsesskrkvcjmupe`; recorded both migration versions in the ledger.
- All 279 complete listing rows compare exactly equal before/after, including source IDs/URLs, publication/creation/update/expiry timestamps and body. All old service/category rows and job-area associations are unchanged. Exactly the intended one trade association was replaced.
- Production IDs: Dekoratyvinis tinkavimas `234b903a-1224-4638-95f5-8feca3947894`; Pamatų šiltinimas `cbad6eaa-4970-4366-a28b-c88d2c312711`; Statybinių medžiagų pristatymas ir užnešimas `1fa581c5-e629-4094-a76b-48ef046b303d`. All active with the intended parent categories and presentation assignments.
- Merged #40 and schema-query follow-up #41. Vercel confirms successful Production deployment of runtime commit `f41d5fdfc007b5f450222b0a702e112c80a7e690`; public `localpro.lt` taxonomy/feed return 200.
- Live schema validation caught that service subcategories have no `sort_order` column (categories do). Removed the invalid select/order and added a regression assertion. The first deployment briefly returned taxonomy/feed 503 before the corrected deployment restored them.
- Two additional live Playwright runs (1440px desktop and 390px mobile) passed against `https://localpro.lt`, using an independently captured real database snapshot as oracle. Checked every new service under its category, zero-result correctness, direct URLs/reload, ICF inclusion under the accurate service, exclusion under the old tag, area/date/contact combinations, reset, contextual counts and overflow. No mocked network or synthetic production listings used for these browser checks.
- All three new services currently have zero real listings; held requests have not been released or reclassified.
- Executed the actual protected importer taxonomy handler locally against the production DB with a local verification bearer: HTTP 200, all three exact active database IDs and categories returned. This is NOT an authenticated HTTP request to the deployed endpoint with Aladina's bearer. The live endpoint correctly returns 401 without a bearer; the supplied Supabase keys are not the website importer token. Aladina must refresh the protected taxonomy with its existing token for the final client-to-live-endpoint check.
- Verified production import RPC acceptance for each new service and old-payload duplicate preservation of the ICF correction inside a fully rolled-back transaction. Zero QA jobs/audits persisted. Import function definition and source-identity constraints compare byte-for-byte unchanged.

Aladina can use these real active IDs to reconsider the held requests, retaining its existing customer-request classification rules. No held requests were imported by this change.

## Repeatable deployment/verification procedure

1. Confirm the live LocalPro Supabase project, inspect the existing post and catalog, and capture job rows/associations plus import function/identity constraints for comparison.
2. Apply 034 and 035 transactionally, recording them in the migration ledger according to the existing deployment workflow. Do not replay the full migration history blindly.
3. Read the real IDs:

```sql
select s.id, s.name, s.slug, s.is_active, c.id category_id, c.name category
from public.service_subcategories s
join public.service_categories c on c.id = s.service_category_id
where s.slug in ('dekoratyvinis-tinkavimas', 'pamatu-siltinimas',
                'statybiniu-medziagu-pristatymas-ir-uznesimas', 'individualiu-namu-statyba');
```

4. Fetch the live protected importer taxonomy using the normal bearer and confirm all three active UUIDs exactly match the database. Never print the token.
5. Deploy the reviewed app commit; verify the actual public hostname and deployed commit.
6. Fetch `/api/jobs/taxonomy`; confirm new service names/UUIDs/category IDs. Exercise `service=<UUID>` alongside category/location/date/contact filters. Compare results/counts with database associations; an honest zero is correct before Aladina releases held requests. Do not fabricate production jobs for this test.
7. Verify the ICF job appears under `service=0b229d25-2ae1-48e7-b406-2060e730cb9d&area=siauliai`, not the old timber-frame service, with the same UUID, source URL and timestamp. Compare all preserved columns/associations to baseline.
8. Give Aladina the verified active production IDs. Aladina alone reconsiders held requests using its unchanged customer-request classification rules.
