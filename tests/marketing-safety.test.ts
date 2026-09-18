import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dispatchEligibility } from "../lib/marketing/eligibility";

const safeFacts = { approvedRevisionMatches: true, suppressed: false, registered: false, hasNewReply: false, campaignPaused: false, channelAvailable: true, dailyAllowanceRemaining: true, insideSendingWindow: true };

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
    expect(sql).toContain("last_error = 'registered'");
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
    expect(route).toContain("revision: draft.revision + 1");
    expect(route).toContain("approved_revision: null");
  });

  it("keeps marketing tables private from browser database roles", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    expect(sql).toContain("alter table %I enable row level security");
    expect(sql).toContain("revoke all on table %I from public, anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table %I to service_role");
  });

  it("pauses ambiguous registration matches instead of linking profiles", () => {
    const sql = readFileSync(resolve("supabase/migrations/031_marketing_crm_foundation.sql"), "utf8");
    const reconciliation = sql.slice(sql.indexOf("create or replace function reconcile_marketing_registration"));
    expect(reconciliation).toContain("array_length(matches, 1), 0) > 1");
    expect(reconciliation).toContain("pause_reason = 'registration_match_conflict'");
    expect(reconciliation).toContain("return query select 'conflict'");
  });
});
