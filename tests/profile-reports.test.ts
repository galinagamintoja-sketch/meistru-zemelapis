import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { profileReportSchema } from "../lib/profile-reports";

const valid = {
  profileId: "11111111-1111-4111-8111-111111111111",
  reason: "wrong_contact",
  details: "Nurodytas telefono numeris priklauso kitam asmeniui.",
  reporterEmail: "client@example.lt",
  website: ""
};

describe("profile reports", () => {
  it("accepts a useful report", () => {
    expect(profileReportSchema.safeParse(valid).success).toBe(true);
  });

  it("supports all published report reasons", () => {
    for (const reason of ["wrong_photo", "wrong_contact", "misleading_details", "inappropriate", "other"]) {
      expect(profileReportSchema.safeParse({ ...valid, reason }).success).toBe(true);
    }
  });

  it("rejects spam honeypots, invalid profiles and oversized details", () => {
    expect(profileReportSchema.safeParse({ ...valid, website: "spam.example" }).success).toBe(false);
    expect(profileReportSchema.safeParse({ ...valid, profileId: "not-a-uuid" }).success).toBe(false);
    expect(profileReportSchema.safeParse({ ...valid, details: "x".repeat(1001) }).success).toBe(false);
  });

  it("keeps the report table inaccessible to browser database roles", () => {
    const migration = readFileSync("supabase/migrations/026_profile_reports.sql", "utf8");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.profile_reports from public, anon, authenticated");
    expect(migration).toContain("grant select, insert, update, delete on table public.profile_reports to service_role");
  });
});
