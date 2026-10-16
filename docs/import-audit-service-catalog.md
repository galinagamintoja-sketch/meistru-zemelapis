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

## Production deployment gate

This session has GitHub credentials but no authenticated Supabase dashboard, Vercel CLI, service-role key or importer bearer token. Migrations have NOT been applied to production, the listing is NOT yet corrected live, and new production service IDs are NOT yet available/verified. Do not tell Aladina the held requests are cleared based on local fixture IDs.

Once authorized production access is restored:

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
