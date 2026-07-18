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

  it("places profiles without stored coordinates at their base city", async () => {
    const { profileRowToSpecialist } = await import("../lib/db-mappers");
    const specialist = profileRowToSpecialist({
      id: "edgaras",
      display_name: "Edgaras",
      company_name: null,
      phone: "+37063601230",
      whatsapp_number: null,
      email: "edgaras@example.lt",
      base_city: "Lentvaris",
      radius_km: 35,
      latitude: null,
      longitude: null,
      description: "Vidaus apdaila Lentvaryje.",
      review_score: null,
      review_count: null,
      verification_labels: null,
      public_status: "public",
      approval_status: "approved",
      source: "self-registration",
      service_area_label: "Kaunas + 35 km",
      service_categories: { name: "Apdaila", slug: "apdaila" },
      profile_services: [],
      operating_areas: [{ city: "Kaunas", radius_km: 35 }],
      profile_photos: [],
      reviews: []
    });

    expect(specialist.operatingCities).toEqual(["Lentvaris", "Kaunas"]);
    expect(specialist.serviceArea).toBe("Lentvaris, Kaunas + 35 km");
    expect(specialist.registeredLat).toBeCloseTo(54.6436);
    expect(specialist.registeredLng).toBeCloseTo(25.0486);
    expect(specialist.lat).not.toBe(specialist.registeredLat);
    expect(specialist.lng).not.toBe(specialist.registeredLng);
  });

  it("does not expose exact registered coordinates or street-level areas in public listings", async () => {
    const { getSpecialists } = await import("../lib/specialists");
    const specialists = await getSpecialists();
    const [specialist] = specialists;

    expect(specialist).toBeDefined();
    expect(specialist).not.toHaveProperty("registeredLat");
    expect(specialist).not.toHaveProperty("registeredLng");
    expect(specialist).not.toHaveProperty("streetArea");
    expect(specialist.approximateLocation).toBe(specialist.town);
  });

  it("returns only approved photos from public profile mapping", async () => {
    const { profileRowToSpecialist } = await import("../lib/db-mappers");
    const specialist = profileRowToSpecialist({
      id: "photo-safe",
      display_name: "Photo Safe",
      company_name: null,
      phone: "+37063601230",
      whatsapp_number: null,
      email: "photo@example.lt",
      base_city: "Vilnius",
      radius_km: 25,
      latitude: 54.6872,
      longitude: 25.2797,
      description: "Pakankamai ilgas aprasymas viesam profiliui ir nuotrauku filtravimo testui.",
      review_score: null,
      review_count: null,
      verification_labels: null,
      public_status: "public",
      approval_status: "approved",
      is_demo: false,
      source: "self-registration",
      service_area_label: null,
      service_categories: { name: "Apdaila", slug: "apdaila" },
      profile_services: [],
      operating_areas: [],
      profile_photos: [
        { id: "approved-photo", label: "Approved", url: "https://example.lt/approved.jpg", moderation_status: "approved", sort_order: 1 },
        { id: "pending-photo", label: "Pending", url: "https://example.lt/pending.jpg", moderation_status: "pending", sort_order: 2 },
        { id: "rejected-photo", label: "Rejected", url: "https://example.lt/rejected.jpg", moderation_status: "rejected", sort_order: 3 }
      ],
      reviews: []
    });

    expect(specialist.photoUrls).toEqual(["https://example.lt/approved.jpg"]);
    expect(specialist.photos).toEqual(["Approved"]);
  });
});
