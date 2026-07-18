# Phase 1 Consent Rules

Public profiles must not appear in public list, map, search, or individual profile responses unless `public_contact_consent_at` is set and the profile is approved, public, and non-demo.

## Self-Registration

Self-registration captures separate required consent fields before a pending private profile is created:

- `termsAccepted`
- `privacyAcknowledged`
- `publicContactConsent`

Optional marketing and WhatsApp communication consent remain optional. The legacy `consentAccepted` property is not proof of these separate consents.

## WhatsApp Onboarding

WhatsApp onboarding may record public-contact consent only when tied to actual conversation evidence. Store:

- consent wording or consent-text reference;
- message or conversation reference;
- captured timestamp;
- captured channel;
- administrator or system identity.

Use the audited admin action `record_public_contact_consent` unless a future automated WhatsApp flow records the same audit fields from verified inbound messages.

## Administrator-Created

Administrator-created profiles stay private until explicit consent is recorded through `record_public_contact_consent`.

An administrator must not infer or invent consent. Recording consent must be based on a real specialist statement and include the channel, timestamp, wording/reference, and optional evidence note.

## Imported Lead

Imported Facebook or other public-source leads never receive public-contact consent automatically.

They remain private until the person explicitly agrees to registration and public contact display. Public-source contact information is not treated as LocalPro publication consent.
