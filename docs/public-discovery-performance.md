# Public discovery, archive loading and registration diagnostics

## Public SEO boundaries
- Treat town/service-area labels as untrusted data. Street addresses, house numbers,
  URLs and punctuation-only values cannot generate indexable location pages,
  sitemap entries, profile headings or structured service-area labels.
- Do not infer a replacement town or alter owner data. Keep stable profile URLs;
  valid operating towns continue to generate supported landing pages.
- Homepage Organization/WebSite markup describes LocalPro, not certification of
  its specialists. Visible Lithuanian answers must match implemented functionality.
  FAQ markup does not guarantee Google rich results or AI-search placement.

## Loading changes and privacy limits
- App and archive loading boundaries stream an accessible shell while live data
  is being fetched. A shell becoming visible is NOT the actual job feed being ready.
- Public taxonomy labels/counts use a 15-second, at-most-64-entry warm-instance
  cache with same-key request coalescing. Public job bodies, contact details,
  authentication and moderation decisions are NOT cached by this helper.
- Public card photo URLs request `variant=card`, including old managed photos
  without a stored derivative. Sharp auto-orients, bounds width to 520 pixels,
  converts to WebP, and removes metadata. An undecodable original remains a
  compatibility fallback. Decoder/input limits bound processing.
- The photo route still checks current publication/consent/moderation before
  downloading/resizing and retains `Cache-Control: private, no-store`.
- Homepage archive links use Next navigation; external Facebook links still
  start a cold navigation that cannot be prefetched from this website.

## Registration measurement
A Google click starts authentication; it does not create a public profile.
Existing specialists, linking flows, cancelled OAuth, and incomplete profile forms
must not be counted as newly registered specialists.

Four optional diagnostics supplement (not replace) the existing ordered funnel:
- `archive_registration_form`: authenticated new-user form is mounted;
- `archive_registration_submit`: client validation passed and saving starts;
- `archive_registration_invalid`: client validation rejected an attempted submit;
- `archive_registration_failed`: a save attempt fails before confirmed profile creation.

These require accepted analytics consent and an unexpired, ordered archive click
journey. Each phase is emitted at most once per document; refreshing can produce
another event. They are event counts, not unique people or proven root causes.
Only the constant `source=facebook_archive` parameter is allowed. No form fields,
error messages, contact details, user IDs or provider tokens are included.
Rejection/withdrawal clears the journey and diagnostics; there is no replay.
A late photo-upload error after confirmed profile creation is not classified as
failed registration. No completion is inferred from an OAuth callback.

OAuth start/callback failure recovery preserves only a validated local `next`
destination and generic error code. Account ownership rules are unchanged.

## Verification
- Run `npm run test`, `npm run lint`, `npx tsc --noEmit --incremental false`,
  and `npm run build`.
- Run `e2e/archive-funnel-ui-live.config.ts` on the exact hosted candidate. It
  intercepts Google collection and uses an explicitly synthetic OAuth/save fixture;
  it does NOT prove a new account was persisted or Google ingested the events.
- Measure actual homepage search/feed readiness separately from FCP/LCP and
  loading shells, on direct desktop and simulated mobile networks.
- Verify card output byte sizes and current publication gates after deployment.
- Facebook's embedded browser and external link/interstitial delays need a real
  device check; desktop/mobile emulation is not evidence about that browser.
