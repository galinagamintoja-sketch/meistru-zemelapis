import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { categoriesFromAssignments, MAX_PROFILE_SERVICES, MAX_WORK_AREAS, uniqueServices } from "../lib/service-taxonomy";
import { registrationSchema } from "../lib/validators";
import { tradespersonServicesUpdateSchema } from "../lib/tradesperson-profile-schema";
import { evaluateCandidate, type MatchCandidate } from "../lib/matching";

const migration = readFileSync(new URL("../supabase/migrations/020_normalize_service_taxonomy.sql", import.meta.url), "utf8");
const initialTaxonomy = readFileSync(new URL("../supabase/migrations/015_localpro_service_taxonomy.sql", import.meta.url), "utf8");

const categoryNames = [
  "Vidaus apdaila",
  "Santechnika",
  "Elektra ir apsaugos sistemos",
  "Šildymas, vėdinimas ir kondicionavimas",
  "Stogai ir skardinimas",
  "Fasadai ir šiltinimas",
  "Statyba ir konstrukcijos",
  "Langai, durys ir laiptai",
  "Medžio darbai ir baldai",
  "Lauko ir sklypo darbai",
  "Griovimas ir atliekų išvežimas",
  "Meistras į namus",
  "Projektavimas ir darbų priežiūra"
];

const canonicalServices = [
  "Vidaus durų montavimas",
  "Baldų surinkimas",
  "Pilna būsto apdaila ir remontas",
  "Gipso kartono ir pertvarų montavimas",
  "Rozečių ir jungiklių montavimas",
  "Vėdinimo ir rekuperacijos sistemos",
  "Stogo įrengimas ir dangos keitimas",
  "Angų pjovimas ir įrengimas",
  "Laiptų gamyba ir montavimas",
  "Stoginės, pergolės ir pavėsinės",
  "Tvorų ir vartų montavimas",
  "Sienų ir pertvarų ardymas",
  "Spynų ir durų furnitūros keitimas",
  "Santechnikos remontas ir smulkūs darbai",
  "Elektros remontas ir smulkūs darbai"
];

describe("service taxonomy normalization", () => {
  it("preserves all 13 requested work areas", () => {
    for (const name of categoryNames) expect(initialTaxonomy).toContain(`'${name}'`);
    expect(categoryNames).toHaveLength(13);
  });

  it("defines every requested canonical service and safely repoints stored relationships", () => {
    for (const name of canonicalServices) expect(migration).toContain(`'${name}'`);
    expect(migration).toContain("update profile_services");
    expect(migration).toContain("update enquiries");
    expect(migration).toContain("profile_services_profile_subcategory_unique");
    expect(migration).not.toMatch(/delete from tradesperson_profiles/i);
    expect(migration).not.toMatch(/delete from enquiries/i);
  });

  it("shows one canonical identity under multiple work areas without double-counting", () => {
    const shared = { id: "service-1", name: "Vidaus durų montavimas", slug: "vidaus-duru-montavimas", is_active: true };
    const categories = categoriesFromAssignments([
      { id: "inside", name: "Vidaus apdaila", slug: "vidaus-apdaila", service_category_assignments: [{ service_subcategories: shared }] },
      { id: "doors", name: "Langai, durys ir laiptai", slug: "langai-durys-laiptai", service_category_assignments: [{ service_subcategories: shared }] }
    ]);
    expect(categories[0].subcategories[0].id).toBe(categories[1].subcategories[0].id);
    expect(uniqueServices(categories.flatMap((category) => category.subcategories))).toHaveLength(1);
  });

  it("allows 25 unique services in registration and dashboard editing, but not 26", () => {
    const ids = Array.from({ length: MAX_PROFILE_SERVICES }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    expect(tradespersonServicesUpdateSchema.safeParse({ subcategoryIds: ids }).success).toBe(true);
    expect(tradespersonServicesUpdateSchema.safeParse({ subcategoryIds: [...ids, "00000000-0000-4000-8000-999999999999"] }).success).toBe(false);

    const base = {
      name: "Test Meistras", phone: "+37061234567", email: "test@example.lt", address: "Trakų g. 10, Lentvaris",
      trade: "Vidaus apdaila", categorySlugs: ["vidaus-apdaila"], description: "Pakankamai ilgas aprašymas, skirtas patikrinti paslaugų pasirinkimo ribą registracijos formoje.",
      travelRange: "25", consentAccepted: true, termsAccepted: true, privacyAcknowledged: true, publicContactConsent: true
    };
    const services = Array.from({ length: MAX_PROFILE_SERVICES }, (_, index) => `paslauga-${index}`);
    expect(registrationSchema.safeParse({ ...base, subcategorySlugs: services }).success).toBe(true);
    expect(registrationSchema.safeParse({ ...base, subcategorySlugs: [...services, "paslauga-26"] }).success).toBe(false);
    expect(MAX_WORK_AREAS).toBe(13);
  });

  it("matches a shared canonical service through either relevant work area", () => {
    const candidate: MatchCandidate = {
      id: "profile", display_name: "Meistras", phone: "+37061234567", email: "m@example.lt", base_city: "Vilnius",
      radius_km: 150, latitude: 54.6872, longitude: 25.2797, public_status: "public", approval_status: "approved",
      public_contact_consent_at: new Date().toISOString(),
      service_categories: { slug: "vidaus-apdaila" },
      profile_services: [{ service_categories: { slug: "vidaus-apdaila" }, service_subcategories: { slug: "vidaus-duru-montavimas" } }]
    };
    expect(evaluateCandidate({ categorySlug: "langai-durys-laiptai", subcategorySlug: "vidaus-duru-montavimas", city: "Vilnius" }, candidate).matched).toBe(true);
  });
});
