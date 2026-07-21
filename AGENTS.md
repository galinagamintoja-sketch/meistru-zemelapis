# LocalPro Agent Notes

This repository is the active Next.js/Supabase LocalPro app.

## Routine Scans

Exclude generated and bulky context from routine searches unless the task explicitly needs it:

- `tmp/`
- `.next/`
- `node_modules/`
- Playwright browser profiles and caches
- screenshots and image artifacts
- `*.log`
- `*.tsbuildinfo`

## Source Of Truth

- `index.html` and `script.js` are legacy prototype files. Do not use them as the source of truth for current app behavior.
- Do not delete or move the legacy prototype files without an explicit cleanup task.
- `styles.css` is still actively imported by `app/globals.css`; do not change or split it until its active imports are intentionally separated.

## Deferred Refactors

Do not start the larger frontend split during Phase 2 feature work unless Valentin explicitly asks for that batch. Keep these as later controlled tasks:

- public search/map extraction
- registration and Google Places extraction
- admin component extraction
