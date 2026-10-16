import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import type { Specialist } from "../lib/types";
import { profileJsonLd, profileMetadata, profilePath, safeJsonLd, SITE_URL } from "../lib/seo";
import { applyBusinessVerification, withVerifiedBusinessIdentity } from "../lib/profile-business-identity";
import { createServerSupabase } from "../lib/supabase";
import { getPublicSpecialistBySeoSlug } from "../lib/specialists";
import Page, { generateMetadata } from "../app/meistrai/[slug]/page";
import { tradespersonProfileUpdateSchema } from "../lib/tradesperson-profile-schema";

vi.mock("../lib/supabase", () => ({ createServerSupabase: vi.fn() }));
vi.mock("../lib/specialists", () => ({ getPublicSpecialistBySeoSlug: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw Error("NOT_FOUND"); }, permanentRedirect: (url: string) => { throw Error(`REDIRECT:${url}`); } }));
vi.mock("../components/PublicProfileGallery", () => ({ default: ({ photoUrls }: { photoUrls: string[] }) => createElement("div", null, photoUrls.join(" ")) }));
vi.mock("../components/profile-report-form", () => ({ ProfileReportForm: () => null }));

// Synthetic public fixtures; never inserted into production.
const individual: Specialist = {
  id: "private-database-id", name: "Rasa Statybininkė", companyName: null,
  trade: "Statyba ir konstrukcijos", categorySlug: "statyba-ir-konstrukcijos",
  subcategorySlugs: ["individualiu-namu-statyba", "pamatu-irengimas"],
  subcategoryNames: ["Individualių namų statyba", "Pamatų įrengimas"],
  town: "Vilnius", operatingCities: ["Vilnius", "Trakų rajonas"], radius: 50,
  lat: 54.6, lng: 25.2, registeredLat: 54.600001, registeredLng: 25.200001,
  streetArea: "Private street 99", verification: ["contact"], verificationLabel: "Kontaktas patvirtintas",
  rating: 4.99, reviewCount: 999, color: "#37503f", phone: "+37060000000", whatsapp: "37060000000",
  email: "private@localpro.lt", serviceArea: "Vilnius, Trakų rajonas",
  description: "Atliekame individualių namų statybos ir pamatų įrengimo darbus Vilniuje bei Trakų rajone pagal suderintą darbų apimtį.",
  photos: [], photoUrls: ["/api/public/profile-photos/photo-public", "https://images.localpro.lt/work.jpg"], reviews: [],
  status: "approved", publicStatus: "public", publicContactConsentAt: "2026-08-01T00:00:00Z", isDemo: false, source: "self-registration"
};
const proof = { verified_name: "MB Tvirti namai", verified_at: "2026-01-01T00:00:00Z", revoked_at: null };
const business = () => applyBusinessVerification({ ...individual, companyName: proof.verified_name }, proof);
const props = (profile: Specialist) => ({ params: Promise.resolve({ slug: profilePath(profile).split("/").pop()! }), searchParams: Promise.resolve({ return: "/?service=anything#results" }) });
const parsed = (profile: Specialist) => JSON.parse(safeJsonLd(profileJsonLd(profile)));
beforeEach(() => vi.resetAllMocks());

describe("public specialist structured data", () => {
  it("keeps an individual Person and uses public trade/service labels without inferred specialties", () => {
    const data = parsed(individual);
    expect(data["@type"]).toBe("ProfilePage");
    expect(data.mainEntity).toMatchObject({ "@type": "Person", name: individual.name, jobTitle: individual.trade, description: individual.description });
    expect(data.mainEntity.knowsAbout).toEqual(individual.subcategoryNames);
    expect(data.mainEntity.makesOffer.map((offer: { itemOffered: { name: string } }) => offer.itemOffered.name)).toEqual(individual.subcategoryNames);
    expect(data.mainEntity.makesOffer[0].itemOffered.areaServed).toEqual(individual.operatingCities.map((name) => ({ "@type": "Place", name })));
    expect(data.mainEntity).not.toHaveProperty("areaServed"); // areaServed belongs to Service, not Person
    expect(data.mainEntity.image).toEqual([`${SITE_URL}/api/public/profile-photos/photo-public`, "https://images.localpro.lt/work.jpg"]);
    expect(data.url).toBe(profileMetadata(individual).alternates?.canonical);
    expect(data.mainEntity["@id"]).toBe(`${data.url}#specialist`);
    expect(data.mainEntity.makesOffer[0].itemOffered.provider).toEqual({ "@id": data.mainEntity["@id"] });
  });
  it("does not promote a company name, legal-form prefix or contact badges to a business", () => {
    const data = parsed({ ...individual, companyName: "UAB Unverified", verification: ["contact", "portfolio", "whatsapp", "business-verified"] });
    expect(data.mainEntity["@type"]).toBe("Person");
    expect(data.mainEntity.name).toBe(individual.name);
    expect(data.name).toContain("UAB Unverified");
  });
  it("uses Organization only for an evidence-verified matching business name, without inventing a location", () => {
    const profile = business();
    const data = parsed(profile);
    expect(data.mainEntity).toMatchObject({ "@type": "Organization", name: proof.verified_name, description: profile.description });
    expect(data.mainEntity).not.toHaveProperty("jobTitle");
    expect(data.mainEntity.areaServed).toEqual(profile.operatingCities.map((name) => ({ "@type": "Place", name })));
    expect(data.mainEntity.makesOffer).toHaveLength(2);
    expect(data.url).toBe(profileMetadata(profile).alternates?.canonical);
    expect(data.mainEntity).not.toHaveProperty("address");
    expect(data.mainEntity["@type"]).not.toBe("LocalBusiness");
    expect(safeJsonLd(data)).not.toContain("verifiedAt");
  });
  it("rechecks projected proof against the current name and date at serialization time", () => {
    for (const profile of [
      { ...business(), companyName: "MB Changed" },
      { ...business(), verifiedBusiness: { name: proof.verified_name, verifiedAt: "invalid" } },
      { ...business(), verifiedBusiness: { name: proof.verified_name, verifiedAt: "2999-01-01T00:00:00Z" } }
    ]) expect(parsed(profile).mainEntity["@type"]).toBe("Person");
  });
  it("does not invent a person when only an unverified company name is present", () => {
    expect(profileJsonLd({ ...individual, name: "", companyName: proof.verified_name })).toBeNull();
    expect(parsed({ ...business(), name: "" }).mainEntity["@type"]).toBe("Organization");
  });
  it.each([
    ["revoked", { ...proof, revoked_at: "2026-02-01T00:00:00Z" }],
    ["different name", { ...proof, verified_name: "MB Someone else" }],
    ["invalid date", { ...proof, verified_at: "bad" }],
    ["future date", { ...proof, verified_at: "2999-01-01T00:00:00Z" }],
    ["missing evidence", null]
  ])("fails closed on %s evidence", (_, row) => {
    const profile = applyBusinessVerification(business(), row);
    expect(profile).not.toHaveProperty("verifiedBusiness");
    expect(parsed(profile).mainEntity["@type"]).toBe("Person");
  });
  it.each([
    { status: "pending" }, { status: "rejected" }, { status: "suspended" }, { publicStatus: "private" },
    { publicStatus: undefined }, { publicContactConsentAt: null }, { isDemo: true }, { email: "qa@example.com" }
  ] as Partial<Specialist>[]) ("omits all JSON-LD for nonpublic/unapproved profiles: %j", (change) => {
    expect(profileJsonLd({ ...individual, ...change })).toBeNull();
    expect(profileJsonLd({ ...business(), ...change })).toBeNull();
  });
  it("never exposes private fields, raw IDs, ratings, qualifications, street addresses or coordinates", () => {
    for (const profile of [individual, business()]) {
      const json = safeJsonLd(profileJsonLd(profile));
      for (const secret of [profile.email, profile.phone, profile.id, profile.streetArea!, String(profile.registeredLat), String(profile.registeredLng)]) expect(json).not.toContain(secret);
      const entity = parsed(profile).mainEntity;
      for (const key of ["aggregateRating", "review", "address", "geo", "hasCredential", "award", "telephone", "email", "legalName", "identifier", "memberOf"]) expect(entity).not.toHaveProperty(key);
    }
  });
  it("omits service slugs and fallback artwork when public service labels/photos are missing", () => {
    const entity = parsed({ ...individual, subcategoryNames: undefined, photoUrls: undefined }).mainEntity;
    expect(entity).not.toHaveProperty("knowsAbout");
    expect(entity).not.toHaveProperty("makesOffer");
    expect(entity).not.toHaveProperty("image");
  });
  it("excludes malformed, credential-bearing, signed/private and executable image URLs", () => {
    const entity = parsed({ ...individual, photoUrls: ["https://[invalid", "javascript:alert(1)", "data:image/png,x", "https://user:pass@host.lt/p.jpg", "https://host.lt/storage/v1/object/sign/profile-photos/x?token=secret", "https://host.lt/photo?X-Amz-Signature=secret", individual.photoUrls![0]] }).mainEntity;
    expect(entity.image).toEqual([`${SITE_URL}${individual.photoUrls![0]}`]);
  });
  it("escapes script termination in structured data while retaining the original JSON text", () => {
    const description = '</script><script>alert("x")</script>';
    const json = safeJsonLd(profileJsonLd({ ...individual, description }));
    expect(json).not.toContain("</script>");
    expect(JSON.parse(json).mainEntity.description).toBe(description);
  });
});

describe("private verification projection", () => {
  it("queries only the reviewed name/date/revocation, never evidence or reviewer identity", async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: proof, error: null }) };
    const from = vi.fn().mockReturnValue(query);
    vi.mocked(createServerSupabase).mockReturnValue({ from } as never);
    const profile = await withVerifiedBusinessIdentity({ ...individual, companyName: proof.verified_name });
    expect(from).toHaveBeenCalledWith("profile_business_verifications");
    expect(query.select).toHaveBeenCalledWith("verified_name,verified_at,revoked_at");
    expect(query.eq).toHaveBeenCalledWith("profile_id", individual.id);
    expect(profile.verifiedBusiness).toEqual({ name: proof.verified_name, verifiedAt: proof.verified_at });
  });
  it("does not query evidence for an individual", async () => {
    const from = vi.fn();
    vi.mocked(createServerSupabase).mockReturnValue({ from } as never);
    expect(await withVerifiedBusinessIdentity(individual)).not.toHaveProperty("verifiedBusiness");
    expect(from).not.toHaveBeenCalled();
  });
  it.each(["missing migration", "database exception"]) ("uses Person if %s", async (mode) => {
    const maybeSingle = mode === "missing migration" ? vi.fn().mockResolvedValue({ data: null, error: { code: "42P01" } }) : vi.fn().mockRejectedValue(Error("offline"));
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle };
    vi.mocked(createServerSupabase).mockReturnValue({ from: () => query } as never);
    expect(parsed(await withVerifiedBusinessIdentity(business())).mainEntity["@type"]).toBe("Person");
  });
  it("owner profile edits cannot submit verified-business metadata", () => {
    const result = tradespersonProfileUpdateSchema.safeParse({ displayName: individual.name, companyName: proof.verified_name, phone: individual.phone, whatsappNumber: individual.whatsapp, publicEmail: individual.email, description: individual.description, primaryCategoryId: "a107ec60-6859-4f4b-abcd-8feca3947894", experienceYears: 5, languages: ["Lietuvių"], publicContactConsent: true, labourRateUnit: "agreed", labourRateAmount: null, serviceLabourRates: [], verifiedBusiness: business().verifiedBusiness });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("verifiedBusiness");
  });
});

describe("actual profile page rendering", () => {
  it.each(["individual", "business"]) ("renders matching public HTML, canonical metadata and JSON-LD for %s", async (kind) => {
    const profile = kind === "business" ? business() : individual;
    vi.mocked(getPublicSpecialistBySeoSlug).mockResolvedValue(profile);
    const html = renderToStaticMarkup(await Page(props(profile)));
    const scripts = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    const data = JSON.parse(scripts[0][1]);
    expect(data.mainEntity["@type"]).toBe(kind === "business" ? "Organization" : "Person");
    expect(html).toContain(`<h1>${data.name}</h1>`);
    expect(html).toContain(profile.description);
    for (const name of profile.subcategoryNames!) expect(html).toContain(`<li>${name}</li>`);
    expect(html).toContain(profile.operatingCities.join(", "));
    expect((await generateMetadata(props(profile))).alternates?.canonical).toBe(data.url);
    expect(data.url).not.toContain("return=");
  });
  it.each([{ status: "pending" }, { publicStatus: "private" }, { publicContactConsentAt: null }] as Partial<Specialist>[]) ("returns not-found and noindex even if upstream accidentally returns a protected record: %j", async (change) => {
    const profile = { ...business(), ...change };
    vi.mocked(getPublicSpecialistBySeoSlug).mockResolvedValue(profile);
    await expect(Page(props(profile))).rejects.toThrow("NOT_FOUND");
    expect((await generateMetadata(props(profile))).robots).toEqual({ index: false, follow: false });
  });
  it("keeps the canonical redirect for legacy slugs", async () => {
    vi.mocked(getPublicSpecialistBySeoSlug).mockResolvedValue(individual);
    await expect(Page({ ...props(individual), params: Promise.resolve({ slug: "old-slug" }) })).rejects.toThrow(`REDIRECT:${profilePath(individual)}`);
  });
});
