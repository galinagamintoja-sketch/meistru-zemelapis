# Specialist breadcrumbs, photo descriptions and public SEO consistency

## Scope and rollout

Review-branch changes only. This work does not merge/deploy to production, apply migrations, edit accounts or modify specialist content. It builds on PR #43's protected, evidence-based specialist entity JSON-LD. The existing optional migration 036 remains unapplied to production.

## Breadcrumbs

- A public profile emits exactly one `BreadcrumbList`, nested under its existing `ProfilePage.breadcrumb`. The list has a stable `#breadcrumb` ID, consecutive positions and absolute canonical links.
- The HTML breadcrumb is generated from the same data and marks the current profile with `aria-current="page"`.
- Hierarchy: LocalPro → existing category/location landing page → public profile. Labels use the profile's real public category, operating locality and public display name (company label when present, otherwise personal name).
- Parent links use the existing `categoryLocationPath`, `isSeoEligible` and `matchesCategoryLocation` predicates. These are also the actual landing route's membership/availability predicates: the eligible profile itself establishes a nonempty route. The profile's base city is preferred only when it is actually a selected operating area.
- Unknown categories, thin profiles, absent usable cities and address-like localities fall back to LocalPro → profile, rather than inventing a parent or introducing a broken link. The same checks remove previously unconditional related-category links to unavailable routes.
- An eligible company-label-only page without a supported Person/verified Organization can still emit a standalone breadcrumb without inventing an entity.
- `profileSeoSlug`, `profilePath`, existing canonical URLs, legacy redirects, sitemaps and indexing criteria are unchanged. Search-return query parameters are never incorporated into structured data.

## Accurate photo descriptions

- `photoLabels` maps each approved, nonremoved original/card photo URL to its meaningful existing database label. It follows the same moderation and primary-photo ordering as public images; labels are not paired using the legacy `photos` array's potentially different indexes.
- Hero, thumbnail and lightbox resolve the same photo to the same alt. Homepage/profile-card images, selected-profile views and map popups also use the shared resolver; an image fallback changes its alt to describe the actual replacement image.
- Filenames, camera identifiers, URLs and storage paths are not descriptions. Missing/non-descriptive labels retain an honest specialist-name plus numbered work-photo fallback. Trade artwork is explicitly an illustrative image, never claimed as the specialist's completed work.
- Existing descriptive labels are not expanded with invented materials, locations, service claims or search-keyword lists. No AI image interpretation or automatic database relabelling is performed.
- Limitation: the code cannot establish whether an owner's human-written label accurately describes a photograph. Good, human-reviewed labels are still needed for photographs whose current labels are filenames or missing.

## Public-content consistency and quality warnings

- Profile H1, page title, social titles and `ProfilePage.name` share one formatter using actual public display name/category/locality. The old title inferred a specific occupation from a broad category (for example, treating all interior-finish profiles as painters); that inference is removed from wording, not from stable canonical paths.
- Meta/social descriptions summarize real public category, service labels and operating areas. Raw descriptions are not promoted into SEO copy when they may contradict selected services. Raw public description text remains unchanged on the page and entity JSON-LD. Summaries fit complete locality/service labels instead of slicing names into misleading fragments.
- All selected secondary categories are displayed on the profile, including actual categories of selected services missing from legacy profile-category selections. Stale map entries for unselected services are ignored. Every selected service remains public; multi-trade work is not automatically removed or rewritten.
- Service JSON-LD categories now come from each service's joined category association. A secondary electrical service is no longer labelled plumbing merely because plumbing is the profile's primary category. Missing/ambiguous service-category associations are omitted rather than guessed.
- New advisory warning: clear website-development-only copy on a known on-site construction/trade profile without a selected digital service. It checks secondary selections too and abstains on mixed-trade descriptions, negation, past-work and third-party/ambiguous context.
- Warnings appear through the existing admin quality panel. They do not mutate descriptions/selections, suspend users, remove services or alter noindex/approval/consent gates.
- The rule is intentionally narrow, not an exhaustive natural-language contradiction detector or an accusation that the person cannot legitimately offer unrelated services.

## Read-only public-data audit

A snapshot of the production public API contained 15 specialists. The new breadcrumb resolver found 10 supported category/location parents and safely used the shorter hierarchy for the remaining 5.

The description warning identified `sitestudio.lt`: selected plumbing services with website-development description copy. An owner/admin must confirm whether the category or description needs correction; neither was changed automatically. Existing warnings also identified missing portfolio photographs, duplicate display names, locality capitalization, repeated sentences and an address-like locality. These remain human data-quality follow-ups, not silently rewritten records. Existing address-shaped canonical slugs are intentionally not changed by this SEO patch.

## Verification

- Full Vitest suite: 445 passed, 2 existing opt-in local account-deletion integration tests skipped.
- Typecheck passed; lint passed with 0 errors and 8 existing warnings; `git diff --check` passed.
- Seed-mode optimized Next.js production build passed.
- Regression coverage includes canonical/noncanonical slugs, parent route rendering vs 404 fallbacks, protected/test/demo profiles, thin-profile noindex, entity/breadcrumb/visible-heading consistency, genuine multi-trade category associations, mismatch-vs-legitimate-description cases, approved-photo URL/label ordering and labelled/unlabelled/fallback/illustrative image alts.
- Hosted preview: all 15 public profile canonicals and breadcrumbs passed the read-only audit. Ten use parents and five use shorter breadcrumbs; all seven distinct chosen parents returned HTTP 200 on both preview and canonical production targets. Three hosted browser tests passed (1440px/390px consistency and gallery navigation).
- Current public photos: 16 work images, zero usable descriptive labels. Honest fallback descriptions remain until meaningful human-reviewed labels are provided. No production labels were edited or image details guessed.
- Repeatable GET-only audit: `LOCALPRO_VERIFY_BASE_URL=<preview-url> npx tsx scripts/verify-profile-seo-public.ts`. Final CI is checked separately for the latest commit.
- Schema.org Validator: both the generated Lukmila breadcrumb snippet and the full hosted profile URL passed with **0 errors, 0 warnings**. URL mode detects the nested `ProfilePage` / `BreadcrumbList` structure.
- Google Rich Results Test did **not** complete in either code or hosted-preview URL mode. Code mode returned “Something went wrong — Log in and try again”; URL mode returned “Something went wrong.” This is an authentication/tool limitation, not a successful rich-results validation. Manual retry in a working/signed-in browser remains outstanding.
- Rich-result eligibility and good alt text do not guarantee Google indexing, rankings, image visibility or rich-result display.
