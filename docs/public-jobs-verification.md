# Darbų skelbimai — verification on isolated branch

Checked 2026-09-24 against `feat/darbu-skelbimai-v1`. Synthetic data only. **Not yet ready for production or real collection**: the jobs branch is connected to the separate preview database and its taxonomy and empty feed return HTTP 200, but no real preview login or collector pilot has run.

| Area | Status | Evidence / remaining check |
|---|---|---|
| Build/type/lint/regression unit suite | PASS | `npm run build`, `npm run typecheck`, `npm run lint -- --quiet`, `npm test` (283 passed, 2 skipped after the SQL test was added) |
| Import shape/source URL/time | PASS | `tests/public-jobs-import.test.ts`: strict fields, privacy pattern, post URL normalization/rejection, expiry boundary, signed cursor; 4 tests passed |
| Schema import/duplicate/expiry/filter/removal/gate/rate | PASS (local SQL smoke) | `tests/public-jobs-database.test.ts` uses PGlite to run migration 031 and exercise first import, duplicate ID, 14-day expiry, trade+area query, hide, reimport preserving hidden state, five reveals/sixth blocked, rate bucket and cleanup. This is not hosted Postgres concurrency evidence. |
| Desktop/mobile layout | PASS (synthetic UI only) | [desktop](../artifacts/jobs-preview/desktop-synthetic.png), [mobile](../artifacts/jobs-preview/mobile-synthetic.png); 2 fixture cards rendered, no horizontal overflow at 1280px or 390px. Screenshots are explicitly marked synthetic. |
| Preview schema and grants | PASS (hosted SQL) | The `localpro-preview` project is active and distinct from live LocalPro. Migrations 025–031 were applied in order; jobs tables have RLS and anon cannot read jobs, authenticated cannot read import audit. |
| Preview API configuration | PASS (empty board) | Preview-specific publishable and secret keys were verified against `localpro-preview`, set for the jobs Vercel branch only, and redeployed. [Board](https://meistru-zemelapis-5m4p1bzan-lentvaris.vercel.app/darbu-skelbimai), taxonomy and feed return HTTP 200; feed returns zero jobs. No production or CRM environment entry was changed. |
| Real preview import/unknown taxonomy | NOT TESTED | Use the preview-only import token to call the HTTPS endpoint with a synthetic fixture; do not connect the collector until access permission and the human-review pilot are settled. |
| Simultaneous imports, transaction rollback, missing-ID upgrade | NOT TESTED | Run against preview PostgreSQL with concurrent clients and a simulated statement failure; inspect rows and audit. |
| 13/15-day, exact boundary, timezone/future | PARTIAL | Unit SQL/date calculations cover 13-day expiry interval and exactly 14-day cutoff, plus 15-day and future in TypeScript. Hosted timezone/clock behavior not tested. |
| Hidden/expired under cache | PARTIAL | SQL hides immediately and reimport does not reactivate; feed is `private, no-store`. Hosted cache path not tested. |
| Filter/pagination under changing data | PARTIAL | SQL trade+area and signed-cursor unit check pass. Hosted multi-trade, recency and concurrent import pagination not tested. |
| Guest 6+5 behavior | PARTIAL | SQL idempotent reveal receipts and sixth gate pass; API/browser fixture with 42 jobs and refresh/filter/network-timeout behavior not tested. |
| Real login/signup return | NOT TESTED | Requires preview Supabase Auth and OAuth redirect configuration. |
| Browser access/RLS/grants | PARTIAL | Migration explicitly revokes anon/authenticated table and function privileges; hosted grants and direct browser probes not tested. |
| Existing registration/map/profile/CRM | PARTIAL | Existing unit suite passes; preview E2E regression and separate CRM authentication not tested. |
| Collector quality and allowed access | NOT TESTED | No live collector or real posts connected; 20-post human pilot and collection permission check remain separate release gates. |

Do not interpret PGlite or mocked-browser checks as proof of production behavior. Preview migration, E2E tests, screenshots with real preview configuration and the limited human-reviewed collector pilot are still required.
