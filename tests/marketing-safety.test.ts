import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dispatchEligibility } from "../lib/marketing/eligibility";

const safeFacts = { approvedRevisionMatches: true, suppressed: false, registered: false, hasNewReply: false, campaignPaused: false, channelAvailable: true, dailyAllowanceRemaining: true, insideSendingWindow: true, contactabilityPermitted: true };

describe("marketing outreach safety", () => {
  it("excludes registered and suppressed contacts", () => {
    expect(dispatchEligibility({ ...safeFacts, registered: true })).toEqual({ eligible: false, failures: ["registered"] });
    expect(dispatchEligibility({ ...safeFacts, suppressed: true })).toEqual({ eligible: false, failures: ["suppressed"] });
  });
  it("blocks on reply, approval, limit, and window failures", () => {
    const result = dispatchEligibility({ ...safeFacts, hasNewReply: true, approvedRevisionMatches: false, dailyAllowanceRemaining: false, insideSendingWindow: false });
    expect(result.failures).toEqual(expect.arrayContaining(["reply_received", "approval_changed", "daily_limit_reached", "outside_sending_window"]));
  });
  it("migration pauses on inbound and registration without AI", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    expect(sql).toContain("marketing_pause_on_inbound_message");
    expect(sql).toContain("pause_reason = 'reply_received'");
    expect(sql).toContain("status = 'registered'");
    expect(sql).toContain("cancellation_reason = 'registered'");
    expect(sql).not.toMatch(/update marketing_suppressions set revoked_at/i);
  });

  it("draft approval and creation do not mark a contact as contacted", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    const approvalFunction = sql.slice(sql.indexOf("create or replace function approve_marketing_draft"), sql.indexOf("create table marketing_events"));
    expect(approvalFunction).not.toMatch(/marketing_contacts[\s\S]*status\s*=\s*'contacted'/i);
  });

  it("ties approval to the reviewed revision and invalidates approval on edits", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    const route = readFileSync(resolve("app/api/admin/marketing/drafts/route.ts"), "utf8");
    expect(sql).toContain("current_draft.revision <> target_revision");
    expect(sql).toContain("approved_revision = target_revision");
    expect(sql).toContain("create table marketing_approved_message_snapshots");
    expect(sql).toContain("cancellation_reason='draft_revised'");
    expect(route).toContain('"revise_marketing_draft"');
  });

  it("keeps marketing tables private from browser database roles", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    expect(sql).toContain("alter table %I enable row level security");
    expect(sql).toContain("revoke all on table %I from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table %I to service_role");
  });

  it("keeps LocalPro registration matching behind an explicit cross-project integration boundary", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    const acceptanceSql = readFileSync(resolve("supabase/tests/marketing_crm_acceptance.test.sql"), "utf8");
    expect(sql).not.toMatch(/\btradesperson_profiles\b/i);
    expect(acceptanceSql).not.toMatch(/\btradesperson_profiles\b/i);
    expect(sql).not.toMatch(/create trigger[^;]*registration/i);
    expect(sql).toContain("create or replace function reconcile_marketing_registration_event");
    expect(sql).toContain("registration_source_project_ref");
    expect(sql).toContain("registration_external_profile_id");
    const reconciliation = sql.slice(sql.indexOf("create or replace function reconcile_marketing_registration_event"));
    expect(reconciliation).toContain("array_length(matches, 1), 0) > 1");
    expect(reconciliation).toContain("pause_reason = 'registration_match_conflict'");
    expect(reconciliation).toContain("return query select 'conflict'");
  });

  it("keeps source group and post references in the deduplication key", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    expect(sql).toMatch(/marketing_contact_sources_natural_key[\s\S]*coalesce\(group_url/);
    expect(sql).toMatch(/coalesce\(group_url[\s\S]*coalesce\(post_url/);
    expect(sql).toMatch(/\(case when group_url is null[\s\S]*else '' end\)\)/);
  });

  it("retains suppression identity snapshots after contact deletion", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    expect(sql).toContain("preserve_marketing_suppression_on_contact_delete");
    expect(sql).toContain("identity snapshot preserved on contact deletion");
    expect(sql).toContain("suppress_marketing_contact");
  });

  it("scopes Telegram-style message identifiers by thread", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    expect(sql).toMatch(/marketing_messages_external_id_idx[\s\S]*external_thread_id, external_message_id/);
    expect(sql).toContain("channel <> 'telegram'");
  });

  it("stores immutable approval and operational queue fields", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    for (const field of ["approved_snapshot_id", "attempt_count", "last_attempt_at", "provider_result", "cancelled_at", "cancellation_reason", "lease_owner", "lease_expires_at", "transport_job_id", "completed_at"]) expect(sql).toContain(field);
  });

  it("fails closed when contactability is not explicitly permitted", () => {
    expect(dispatchEligibility({ ...safeFacts, contactabilityPermitted: false })).toEqual({ eligible: false, failures: ["contactability_not_permitted"] });
  });

  it("normalizes historically formatted registration-event phones inside the CRM boundary", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    const reconciliation = sql.slice(sql.indexOf("create or replace function reconcile_marketing_registration_event"));
    expect(reconciliation).toContain("normalize_lithuanian_contact_number(target_phone)");
  });

  it("shows the exact contact total separately from the rendered page", () => {
    const ui = readFileSync(resolve("app/admin/marketing/page.tsx"), "utf8");
    expect(ui).toContain("pagination.total");
    expect(ui).toContain("contacts.length");
    expect(ui).toContain("onPage(pagination.page + 1)");
  });

  it("deduplicates identical invalid endpoint evidence without collapsing different values", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    expect(sql).toMatch(/marketing_contact_identities_invalid_value_idx[\s\S]*lower\(trim\(raw_value\)\)[\s\S]*where not is_valid/);
    expect(sql).toMatch(/values\(resolved_contact,'phone',phone_raw,null,false,false,'uncertain'[\s\S]*on conflict do nothing/);
    expect(sql).toMatch(/values\(resolved_contact,'email',email_raw,null,false,false,'uncertain'[\s\S]*on conflict do nothing/);
  });

  it("enforces contactability identity ownership and endpoint/channel compatibility", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    expect(sql).toContain("unique (id, contact_id)");
    expect(sql).toMatch(/foreign key \(identity_id, contact_id\)[\s\S]*references marketing_contact_identities\(id, contact_id\)/);
    expect(sql).toContain("validate_marketing_contactability_identity");
    expect(sql).toContain("contactability_identity_must_be_valid");
    expect(sql).toContain("identity_channel_mismatch");
    expect(sql).toMatch(/new\.identity_id is null[\s\S]*new\.channel <> 'telegram'/);
  });

  it("links unmatched inbound conversations transactionally and stops acquisition", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    const linking = sql.slice(sql.indexOf("create or replace function link_marketing_conversation_to_contact"));
    expect(linking).toContain("for update");
    expect(linking).toContain("conversation_not_eligible_for_matching");
    expect(linking).toMatch(/update marketing_messages[\s\S]*contact_id = target_contact_id/);
    expect(linking).toContain("pause_reason = 'reply_received'");
    expect(linking).toContain("cancellation_reason = 'reply_received'");
    expect(linking).toContain("'conversation_linked_to_contact'");
  });
});
