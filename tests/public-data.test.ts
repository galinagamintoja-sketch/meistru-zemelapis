import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatMarkerCount, formatReviewCount, formatSpecialistCount, isObviousPublicTestProfile } from "../lib/display";

describe("public specialist listing", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.LOCALPRO_SEED_MODE = "true";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("returns only approved specialists publicly", async () => {
    const { getSpecialists } = await import("../lib/specialists");
    const specialists = await getSpecialists();

    expect(specialists.length).toBeGreaterThan(0);
    expect(specialists.every((specialist) => specialist.status === "approved")).toBe(true);
  });

  it("formats Lithuanian plural forms for public counters", () => {
    expect(formatSpecialistCount(1)).toBe("1 specialistas");
    expect(formatSpecialistCount(2)).toBe("2 specialistai");
    expect(formatSpecialistCount(10)).toBe("10 specialistų");
    expect(formatMarkerCount(1)).toBe("1 žymeklis");
    expect(formatMarkerCount(2)).toBe("2 žymekliai");
    expect(formatMarkerCount(10)).toBe("10 žymeklių");
    expect(formatReviewCount(0)).toBe("0 atsiliepimų");
    expect(formatReviewCount(1)).toBe("1 atsiliepimas");
    expect(formatReviewCount(2)).toBe("2 atsiliepimai");
  });

  it("recognizes obvious public test profiles without deleting records", () => {
    expect(
      isObviousPublicTestProfile({
        name: "Deployment Test 123",
        email: "deployment-test@example.lt",
        description: "Automated production deployment test with one uploaded photo.",
        source: "self-registration"
      })
    ).toBe(true);
    expect(
      isObviousPublicTestProfile({
        name: "Realus Meistras",
        email: "meistras@localpro.lt",
        description: "Vidaus apdaila ir remonto darbai Vilniuje.",
        source: "self-registration"
      })
    ).toBe(false);
  });
});
