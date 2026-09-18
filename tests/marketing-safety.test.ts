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
});
