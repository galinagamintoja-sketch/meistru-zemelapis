import { createClient } from "@supabase/supabase-js";

const mode = process.argv[2];
const url = process.env.TAXONOMY_STAGING_URL;
const key = process.env.TAXONOMY_STAGING_SERVICE_KEY;
if (!url || !key || !["setup", "verify-cleanup"].includes(mode)) throw new Error("Missing staging configuration or mode");

const db = createClient(url, key, { auth: { persistSession: false } });
const marker = "qa-taxonomy-20260730";
const mergeSlugs = new Set([
  "vidaus-duru-montavimas", "langai-vidaus-duru-montavimas", "baldu-surinkimas", "meistras-baldu-surinkimas",
  "pilna-buto-apdaila", "remonto-darbai", "gipso-kartono-montavimas", "pertvaru-montavimas",
  "rozeciu-montavimas", "jungikliu-montavimas", "rekuperacijos-sistemos", "vedinimo-sistemos",
  "naujo-stogo-irengimas", "stogo-dangos-keitimas", "angu-irengimas", "angu-pjovimas",
  "laiptu-gamyba", "laiptu-montavimas", "stoginiu-statyba", "pergoles", "pavesines",
  "tvoru-montavimas", "vartu-montavimas", "sienu-ardymas", "pertvaru-ardymas",
  "spynu-keitimas", "duru-rankenu-keitimas", "santechnikos-remontas", "smulkus-santechnikos-darbai",
  "elektros-instaliacijos-remontas", "smulkus-elektros-darbai", "lietaus-nuvedimo-sistemos",
  "lietaus-nuotekos", "griovimo-darbai"
]);

const must = (result, label) => {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
};

async function clean() {
  const profiles = must(await db.from("tradesperson_profiles").select("id").like("email", `${marker}%`), "find fixtures");
  const ids = profiles.map((row) => row.id);
  if (ids.length) must(await db.from("tradesperson_profiles").delete().in("id", ids), "delete profiles");
  must(await db.from("enquiries").delete().eq("client_email", `${marker}@example.invalid`), "delete enquiry");
}

async function setup() {
  await clean();
  const categories = must(await db.from("service_categories").select("id,slug").eq("is_active", true), "categories");
  const categoryBySlug = new Map(categories.map((row) => [row.slug, row.id]));
  const services = must(await db.from("service_subcategories").select("id,slug,service_category_id").eq("is_active", true), "services");
  const bySlug = new Map(services.map((row) => [row.slug, row]));
  for (const slug of ["pilna-buto-apdaila", "remonto-darbai", "langai-vidaus-duru-montavimas"]) {
    if (!bySlug.has(slug)) throw new Error(`Missing fixture service ${slug}`);
  }
  const stable26 = services.filter((row) => !mergeSlugs.has(row.slug)).slice(0, 26);
  if (stable26.length !== 26) throw new Error("Need 26 non-merged services");
  const profileRows = [
    { display_name: marker, phone: "+37060000001", email: `${marker}-duplicates@example.invalid`, base_city: "Vilnius", radius_km: 150, service_category_id: categoryBySlug.get("vidaus-apdaila"), source: "admin-created" },
    { display_name: marker, phone: "+37060000002", email: `${marker}-shared@example.invalid`, base_city: "Vilnius", radius_km: 150, service_category_id: categoryBySlug.get("vidaus-apdaila"), source: "admin-created" },
    { display_name: marker, phone: "+37060000003", email: `${marker}-over25@example.invalid`, base_city: "Vilnius", radius_km: 150, service_category_id: stable26[0].service_category_id, source: "admin-created" }
  ];
  const inserted = must(await db.from("tradesperson_profiles").insert(profileRows).select("id,email"), "insert profiles");
  const idByEmail = new Map(inserted.map((row) => [row.email, row.id]));
  const serviceRows = [
    ...["pilna-buto-apdaila", "remonto-darbai"].map((slug) => ({
      tradesperson_profile_id: idByEmail.get(`${marker}-duplicates@example.invalid`),
      service_category_id: bySlug.get(slug).service_category_id,
      service_subcategory_id: bySlug.get(slug).id
    })),
    {
      tradesperson_profile_id: idByEmail.get(`${marker}-shared@example.invalid`),
      service_category_id: categoryBySlug.get("vidaus-apdaila"),
      service_subcategory_id: bySlug.get("langai-vidaus-duru-montavimas").id
    },
    ...stable26.map((service) => ({
      tradesperson_profile_id: idByEmail.get(`${marker}-over25@example.invalid`),
      service_category_id: service.service_category_id,
      service_subcategory_id: service.id
    }))
  ];
  must(await db.from("profile_services").insert(serviceRows), "insert profile services");
  must(await db.from("enquiries").insert({
    event_type: "message", client_email: `${marker}@example.invalid`, source_city: "Vilnius",
    source_service: "remonto-darbai", service_category_slug: "vidaus-apdaila",
    service_subcategory_slug: "remonto-darbai", privacy_consent_at: new Date().toISOString()
  }), "insert enquiry");
  console.log(JSON.stringify({ marker, before: { profiles: 3, profileServices: serviceRows.length, enquiries: 1, overLimitServices: 26 } }));
}

async function verifyCleanup() {
  const profiles = must(await db.from("tradesperson_profiles").select("id,email").like("email", `${marker}%`), "profiles after");
  const ids = profiles.map((row) => row.id);
  const services = must(await db.from("profile_services").select("tradesperson_profile_id,service_subcategory_id,service_subcategories(slug)").in("tradesperson_profile_id", ids), "services after");
  const enquiries = must(await db.from("enquiries").select("source_service,service_subcategory_slug").eq("client_email", `${marker}@example.invalid`), "enquiry after");
  const aliases = must(await db.from("service_subcategory_aliases").select("alias_slug").in("alias_slug", ["remonto-darbai", "langai-vidaus-duru-montavimas"]), "aliases");
  const sharedProfile = profiles.find((row) => row.email.includes("-shared@"));
  const sharedCategories = must(await db.from("profile_category_assignments").select("service_categories(slug)").eq("tradesperson_profile_id", sharedProfile.id), "shared categories");
  const overProfile = profiles.find((row) => row.email.includes("-over25@"));
  const overCount = services.filter((row) => row.tradesperson_profile_id === overProfile.id).length;
  const duplicateProfile = profiles.find((row) => row.email.includes("-duplicates@"));
  const duplicateCount = services.filter((row) => row.tradesperson_profile_id === duplicateProfile.id).length;
  const report = {
    after: { profiles: profiles.length, profileServices: services.length, enquiries: enquiries.length, overLimitServices: overCount },
    assertions: {
      duplicateAliasesDeduplicated: duplicateCount === 1,
      sharedSecondaryWorkAreaPreserved: sharedCategories.some((row) => row.service_categories?.slug === "vidaus-apdaila"),
      over25Preserved: overCount === 26,
      enquiryCanonicalized: enquiries[0]?.source_service === "pilna-busto-apdaila-ir-remontas" && enquiries[0]?.service_subcategory_slug === "pilna-busto-apdaila-ir-remontas",
      oldSlugsAliased: aliases.length === 2
    }
  };
  if (profiles.length !== 3 || enquiries.length !== 1 || Object.values(report.assertions).some((value) => !value)) {
    throw new Error(`Migration assertions failed: ${JSON.stringify(report)}`);
  }
  await clean();
  const remaining = must(await db.from("tradesperson_profiles").select("id").like("email", `${marker}%`), "cleanup proof");
  console.log(JSON.stringify({ ...report, cleanup: { remainingProfiles: remaining.length, realDataChanged: false } }));
}

await (mode === "setup" ? setup() : verifyCleanup());
