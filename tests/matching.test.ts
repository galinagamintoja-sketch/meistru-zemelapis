import { describe, expect, it } from "vitest";
import { evaluateCandidates, type MatchCandidate, type MatchJob } from "../lib/matching";

const job: MatchJob = { categorySlug: "apdaila", subcategorySlug: "dazymas", city: "Lentvaris", latitude: 54.6436, longitude: 25.0486 };
const candidate: MatchCandidate = {
  id: "profile-a", display_name: "A Specialistas", phone: "+37061234567", whatsapp_number: "37061234567", email: "a@localpro.lt",
  base_city: "Lentvaris", radius_km: 25, latitude: 54.65, longitude: 25.05, public_status: "public", approval_status: "approved",
  is_demo: false, public_contact_consent_at: "2026-07-19T10:00:00Z", verification_labels: [],
  service_categories: { slug: "apdaila" },
  profile_services: [{ service_categories: { slug: "apdaila" }, service_subcategories: { slug: "dazymas" } }],
  operating_areas: [{ city: "Lentvaris", radius_km: 25 }]
};

describe("deterministic rule-based matching", () => {
  it("matches compatible public specialists and explains the match", () => {
    const result = evaluateCandidates(job, [candidate]);
    expect(result.matches).toEqual([expect.objectContaining({ candidateId: "profile-a", reason: "matched_category_and_service" })]);
  });

  it("explains category and service mismatches", () => {
    const result = evaluateCandidates(job, [{ ...candidate, service_categories: { slug: "elektra" }, profile_services: [] }]);
    expect(result.evaluations[0].reason).toBe("excluded_category_mismatch");
  });

  it("excludes specialists whose operating area does not reach the job", () => {
    const result = evaluateCandidates(job, [{ ...candidate, base_city: "Klaipėda", latitude: 55.7033, longitude: 21.1443, operating_areas: [{ city: "Klaipėda", radius_km: 10 }] }]);
    expect(result.evaluations[0].reason).toBe("excluded_location_mismatch");
  });

  it.each([
    ["private", { public_status: "private" }, "excluded_not_public"],
    ["pending", { approval_status: "pending" }, "excluded_not_approved"],
    ["suspended", { approval_status: "suspended" }, "excluded_not_approved"],
    ["rejected", { approval_status: "rejected" }, "excluded_not_approved"],
    ["demo", { is_demo: true }, "excluded_demo"],
    ["no consent", { public_contact_consent_at: null }, "excluded_no_public_consent"]
  ])("excludes %s profiles", (_, changes, reason) => {
    expect(evaluateCandidates(job, [{ ...candidate, ...changes }]).evaluations[0].reason).toBe(reason);
  });

  it("excludes incomplete candidate and job location data", () => {
    expect(evaluateCandidates(job, [{ ...candidate, phone: "" }]).evaluations[0].reason).toBe("excluded_incomplete_profile");
    expect(evaluateCandidates({ ...job, city: "Nežinoma", latitude: null, longitude: null }, [candidate]).evaluations[0].reason).toBe("excluded_missing_job_location");
  });

  it("returns evaluation metadata without any private enquiry fields", () => {
    const serialized = JSON.stringify(evaluateCandidates(job, [candidate]));
    expect(serialized).not.toContain("source_address");
    expect(serialized).not.toContain("client_phone");
    expect(serialized).not.toContain("client_email");
    expect(serialized).not.toContain("storage_path");
  });

  it("orders stably by relevance, distance, name, then id", () => {
    const fartherAvailable = { ...candidate, id: "z", display_name: "Žanas", verification_labels: ["available-soon"], operating_areas: [{ city: "Vilnius", radius_km: 40 }] };
    const nearB = { ...candidate, id: "b", display_name: "B Specialistas" };
    const nearA = { ...candidate, id: "a", display_name: "A Specialistas" };
    expect(evaluateCandidates(job, [nearB, fartherAvailable, nearA]).matches.map((item) => item.candidateId)).toEqual(["z", "a", "b"]);
  });

  it("returns a clear zero-result evaluation", () => {
    const result = evaluateCandidates(job, [{ ...candidate, public_status: "private" }]);
    expect(result.matches).toEqual([]);
    expect(result.evaluations).toHaveLength(1);
  });
});
