# Tradesperson dashboard reference audit

## Reused/adapted from Kiranism

- Responsive shell proportions and hierarchy from `app-sidebar`, `header`, and `page-container`.
- Desktop sidebar navigation, compact mobile bottom navigation, page headings, cards, form grouping, and status badges.
- Account/settings page composition and accessible loading/empty-state patterns.

The components are reimplemented as small LocalPro-native React/CSS components. No starter application code, auth layer, demo data, or feature modules are copied wholesale.

## Required dependencies

- Existing Next.js 16, React 19, Zod, and `@supabase/supabase-js`.
- `@supabase/ssr` for PKCE sessions stored in secure HTTP-only cookies.

No Tailwind, Base UI, Clerk, TanStack Query/Table/Form, Zustand, Recharts, or icon package is required for the initial portal.

## Explicitly excluded

- Clerk, organisations/workspaces, billing, analytics, charts, chat, Kanban, Sentry.
- Demo products/users APIs, notification stores, command palette, themes, React Query examples.
- Template authentication, RBAC, mock data, and unrelated dashboard routes.

## LocalPro rules

- Supabase Auth is the only tradesperson identity system.
- Server code resolves `auth.getUser()` and derives profile ownership from `auth.users.id`.
- Existing profiles are never linked by public email matching.
- Only replacement photos require moderation. Approved photos remain visible until replacements are approved.
- Exact address, house number, postcode, and private coordinates are never returned by public APIs.
