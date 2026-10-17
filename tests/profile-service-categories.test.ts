import { describe, expect, it } from "vitest";
import { profileRowToSpecialist, toPublicSafeSpecialist, type ProfileRow } from "../lib/db-mappers";
import { profileJsonLd } from "../lib/seo";

// Synthetic selected taxonomy, not a production mutation.
const plumbing = { name: "Santechnika", slug: "santechnika" };
const electric = { name: "Elektra ir apsaugos sistemos", slug: "elektra-ir-apsauga" };
const pipe = { name: "Vamzdynų montavimas", slug: "vamzdynu-montavimas" };
const wire = { name: "Elektros instaliacija", slug: "elektros-instaliacija" };
const base: ProfileRow = {
  id: "public-multitrade-example", display_name: "Rasa", company_name: null,
  phone: "", whatsapp_number: null, email: "", base_city: "Vilnius", radius_km: 20,
  latitude: null, longitude: null, description: "Montuoju vamzdžius ir elektros instaliaciją.",
  review_score: null, review_count: null, verification_labels: [], public_status: "public",
  approval_status: "approved", source: "self-registration", service_area_label: null,
  public_contact_consent_at: "2026-01-01T00:00:00Z", service_categories: plumbing,
};
const services = (profile: ReturnType<typeof profileRowToSpecialist>) =>
  (profileJsonLd(profile)!.mainEntity.makesOffer as { itemOffered: Record<string, unknown> }[]).map((offer) => offer.itemOffered);

describe("public service-category identity", () => {
  it("uses each selected service's real category, not the specialist's primary category", () => {
    const profile = profileRowToSpecialist({ ...base, profile_services: [
      { service_categories: plumbing, service_subcategories: pipe },
      { service_categories: [electric], service_subcategories: [wire] },
    ] });
    expect(profile.trade).toBe(plumbing.name);
    expect(profile.categoryNames).toEqual([plumbing.name, electric.name]);
    expect(profile.serviceCategoryNames).toEqual({ [pipe.name]: plumbing.name, [wire.name]: electric.name });
    expect(services(profile)).toEqual([
      expect.objectContaining({ name: pipe.name, category: plumbing.name }),
      expect.objectContaining({ name: wire.name, category: electric.name }),
    ]);
    expect(toPublicSafeSpecialist(profile).serviceCategoryNames).toEqual(profile.serviceCategoryNames);
  });

  it("omits unknown category associations rather than borrowing the primary category", () => {
    const profile = profileRowToSpecialist({ ...base, profile_services: [{ service_subcategories: wire }] });
    expect(profile.subcategoryNames).toEqual([wire.name]);
    expect(services(profile)[0]).not.toHaveProperty("category");
    const legacy = { ...profile, serviceCategoryNames: undefined };
    expect(services(legacy)[0]).not.toHaveProperty("category");
  });

  it("keeps legitimate services but abstains on ambiguous same-label category mappings", () => {
    const profile = profileRowToSpecialist({ ...base, profile_services: [
      { service_categories: plumbing, service_subcategories: pipe },
      { service_categories: electric, service_subcategories: { ...wire, name: pipe.name } },
    ] });
    expect(profile.serviceCategoryNames).toBeUndefined();
    expect(services(profile)).toHaveLength(1);
    expect(services(profile)[0].name).toBe(pipe.name);
    expect(services(profile)[0]).not.toHaveProperty("category");
  });
});
