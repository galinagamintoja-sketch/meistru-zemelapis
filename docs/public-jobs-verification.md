# Darbų skelbimai — verification on isolated branch

Checked 2026-09-24 against `feat/darbu-skelbimai-v1`. Preview HTTP import and contact filtering have now been tested with two synthetic jobs, then both jobs were removed. Production migrations 031–032 were applied to the verified `localpro-lt` project as part of the requested release. A real login and any permitted-source collector pilot remain untested.

| Area | Status | Evidence / remaining check |
|---|---|---|
| Build/type/lint/regression unit suite | PASS | `npm run build`, `npm run typecheck`, `npm run lint -- --quiet`, `npm test` (283 passed, 2 skipped after the SQL test was added) |
| Import shape/source URL/time | PASS | `tests/public-jobs-import.test.ts`: strict fields, privacy pattern, post URL normalization/rejection, expiry boundary, signed cursor; 4 tests passed |
| Schema import/duplicate/expiry/filter/removal/gate/rate | PASS (local SQL smoke) | `tests/public-jobs-database.test.ts` uses PGlite to run migration 031 and exercise first import, duplicate ID, 14-day expiry, trade+area query, hide, reimport preserving hidden state, five reveals/sixth blocked, rate bucket and cleanup. This is not hosted Postgres concurrency evidence. |
| Desktop/mobile layout | PASS (synthetic UI only) | [desktop](../artifacts/jobs-preview/desktop-synthetic.png), [mobile](../artifacts/jobs-preview/mobile-synthetic.png); 2 fixture cards rendered, no horizontal overflow at 1280px or 390px. Screenshots are explicitly marked synthetic. |
| Preview schema and grants | PASS (hosted SQL) | The `localpro-preview` project is active and distinct from live LocalPro. Migrations 025–032 were applied in order; the contact-number presence flag is available to the service key, while direct anonymous jobs-table access remains denied. |
| Preview API configuration | PASS (empty board) | Preview-specific publishable and secret keys were verified against `localpro-preview`, set for the jobs Vercel branch only, and redeployed. Taxonomy and feed return HTTP 200; feed is empty after synthetic test cleanup. Production importer/cursor secrets were configured separately for the requested release; CRM was untouched. |
| Preview HTTPS import/contact filter | PASS (synthetic) | Two synthetic posts were accepted over the private HTTPS import endpoint: one marked as containing a contact number and one not. The hosted feed returned both; `contact_number=true` returned only the marked job. Both fixtures and their import audit rows were removed from preview afterward. Unknown taxonomy remains untested over HTTPS. |
| Simultaneous imports, transaction rollback, missing-ID upgrade | NOT TESTED | Run against preview PostgreSQL with concurrent clients and a simulated statement failure; inspect rows and audit. |
| 13/15-day, exact boundary, timezone/future | PARTIAL | Unit SQL/date calculations cover 13-day expiry interval and exactly 14-day cutoff, plus 15-day and future in TypeScript. Hosted timezone/clock behavior not tested. |
| Hidden/expired under cache | PARTIAL | SQL hides immediately and reimport does not reactivate; feed is `private, no-store`. Hosted cache path not tested. |
| Filter/pagination under changing data | PARTIAL | SQL trade+area and signed-cursor unit check pass. Hosted multi-trade, recency and concurrent import pagination not tested. |
| Guest 6+5 behavior | PARTIAL | SQL idempotent reveal receipts and sixth gate pass; API/browser fixture with 42 jobs and refresh/filter/network-timeout behavior not tested. |
| Real login/signup return | NOT TESTED | Requires preview Supabase Auth and OAuth redirect configuration. |
| Browser access/RLS/grants | PARTIAL | Migration explicitly revokes anon/authenticated table and function privileges; hosted grants and direct browser probes not tested. |
| Existing registration/map/profile/CRM | PARTIAL | Existing unit suite passes; preview E2E regression and separate CRM authentication not tested. |
| Collector quality and allowed access | NOT TESTED | No real posts connected. Begin with a small human-reviewed pilot using a permitted collection method; do not treat public visibility alone as permission for automated scraping. |

Do not interpret PGlite or mocked-browser checks as proof of production behavior. Preview migration, E2E tests, screenshots with real preview configuration and the limited human-reviewed collector pilot are still required.
