import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tradespersonAreasUpdateSchema, tradespersonProfileUpdateSchema } from "../lib/tradesperson-profile-schema";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("tradesperson dashboard security", () => {
  it("protects the entire meistras route tree with server-verified Supabase users", () => {
    const proxy = read("proxy.ts");
    expect(proxy).toContain('matcher: ["/meistras/:path*"]');
    expect(proxy).toContain("supabase.auth.getUser()");
  });

  it("derives ownership from auth_user_id and never public email", () => {
    const account = read("lib/tradesperson-account.ts");
    expect(account).toContain('.eq("auth_user_id", authUserId)');
    expect(account).not.toContain('.eq("email"');
  });

  it("stores only hashed, expiring, single-use claim tokens", () => {
    const migration = read("supabase/migrations/012_tradesperson_auth_and_claims.sql");
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("expires_at > now()");
    expect(migration).toContain("used_at is null");
    expect(migration).not.toMatch(/\btoken\s+text/);
  });

  it("replaces profile claiming with authenticated one-profile onboarding", () => {
    const migration = read("supabase/migrations/018_authenticated_self_registration.sql");
    expect(migration).toContain("tradesperson_profiles_one_per_user");
    expect(migration).toContain("revoke all on function claim_tradesperson_profile(text) from public, anon, authenticated");
    const registration = read("app/api/tradesperson/register/route.ts");
    expect(registration).toContain("auth.auth.getUser()");
    expect(registration).toContain("user_id: localUser.id");
    expect(registration).toContain('public_status: "public"');
    expect(registration).toContain('approval_status: "approved"');
    expect(registration).toContain('approvalStatus: "approved"');
    expect(read("components/unlinked-account.tsx")).not.toContain("/meistras/susieti");
  });

  it("returns new authenticated users to registration after Google callback", () => {
    const callback = read("app/auth/callback/route.ts");
    expect(callback).toContain("getLinkedTradespersonProfile(user.id)");
    expect(callback).toContain('new URL("/?register=1#register", url.origin)');
    const home = read("components/LocalProApp.tsx");
    expect(home).toContain("registrationAuthenticated");
    expect(home).toContain("Tęsti su Google");
    expect(home).toContain('window.location.assign(registration.data.dashboardUrl ?? "/meistras/uzklausos")');
  });

  it("keeps admin runtime authentication on Supabase Auth", () => {
    const auth = read("lib/auth-session.ts");
    expect(auth).toContain("supabase.auth.getUser()");
    expect(auth).toContain('process.env.NODE_ENV === "test"');
  });

  it("validates editable public fields and safe operating areas", () => {
    expect(tradespersonProfileUpdateSchema.safeParse({ displayName: "A", companyName: "", phone: "1", whatsappNumber: "", publicEmail: "bad", description: "short" }).success).toBe(false);
    expect(tradespersonAreasUpdateSchema.safeParse({ baseCity: "Vilnius", cities: ["Vilnius"], radiusKm: 30 }).success).toBe(true);
    expect(tradespersonAreasUpdateSchema.safeParse({ baseCity: "Vilnius", cities: ["Vilnius"], radiusKm: 999 }).success).toBe(false);
    expect(tradespersonAreasUpdateSchema.safeParse({ baseCity: "Vilnius", registeredAddress: "Gedimino pr. 1, Vilnius", googlePlaceId: "place", latitude: 54.6872, longitude: 25.2797, radiusKm: 75 }).success).toBe(true);
    expect(tradespersonAreasUpdateSchema.safeParse({ baseCity: "Vilnius", registeredAddress: "Gedimino pr. 1, Vilnius", latitude: 54.6872, longitude: 25.2797, radiusKm: 25 }).success).toBe(false);
  });

  it("requires moderation only for gallery photos", () => {
    const photos = read("app/api/meistras/photos/route.ts");
    expect(photos).toContain('rpc("submit_pending_profile_photo"');
    expect(read("supabase/migrations/017_dashboard_acceptance_hardening.sql")).toContain("'pending'");
    expect(read("app/api/meistras/profile/route.ts")).not.toContain("moderation_status");
    expect(read("app/api/meistras/services/route.ts")).not.toContain("moderation_status");
    expect(read("app/api/meistras/areas/route.ts")).not.toContain("moderation_status");
  });

  it("locks down and atomically handles dashboard replacement writes", () => {
    const migration = read("supabase/migrations/017_dashboard_acceptance_hardening.sql");
    expect(migration).toContain("revoke all on function approve_profile_photo_replacement(uuid) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function approve_profile_photo_replacement(uuid) to service_role");
    expect(migration).toContain("profile_photos_one_pending_replacement");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("is_primary = replaced.is_primary");
    expect(read("app/api/meistras/services/route.ts")).toContain('rpc("replace_tradesperson_services"');
    expect(read("app/api/meistras/areas/route.ts")).toContain('rpc("replace_tradesperson_location"');
  });

  it("uses only the five approved dashboard sections", () => {
    const navigation = read("components/tradesperson-navigation.tsx");
    for (const label of ["Užklausos", "Mano profilis", "Nuotraukos", "Paslaugos", "Paskyra"]) expect(navigation).toContain(label);
    expect(navigation).not.toContain("Apžvalga");
    expect(navigation).not.toContain("Darbo zona");
    expect(read("app/meistras/page.tsx")).toContain('redirect("/meistras/uzklausos")');
  });

  it("keeps enquiry status per specialist and gates arbitrary request access", () => {
    const migration = read("supabase/migrations/013_tradesperson_request_inbox_and_profile_fields.sql");
    expect(migration).toContain("unique (enquiry_id, tradesperson_profile_id)");
    const detail = read("app/api/meistras/requests/[id]/route.ts");
    expect(detail).toContain("job.tradesperson_profile_id !== profile.id && !evaluation");
    expect(detail).not.toContain("source_address");
  });

  it("keeps every actionable request state discoverable in the inbox", () => {
    const inbox = read("components/request-inbox.tsx");
    const route = read("app/api/meistras/requests/route.ts");
    for (const state of ["new", "viewed", "interested", "contacted", "rejected", "archived"]) {
      expect(inbox).toContain(`["${state}"`);
    }
    expect(route).not.toContain('status === "interested" ? "viewed"');
    expect(inbox).toContain('role="alert"');
    expect(inbox).toContain("Bandyti dar kartą");
  });

  it("includes reference-style completion and moderation summaries", () => {
    expect(read("app/meistras/profilis/page.tsx")).toContain("Profilio užpildymas");
    expect(read("app/globals.css")).toContain(".profile-status-banner { grid-template-columns: minmax(0, 1fr); }");
    const photos = read("components/photo-uploader.tsx");
    expect(photos).toContain('aria-label="Nuotraukų filtrai"');
    for (const label of ["Visos", "Patvirtintos", "Laukia", "Atmestos"]) expect(photos).toContain(label);
  });

  it("supports Supabase email auth without linking by public email", () => {
    const emailRoute = read("app/api/auth/email/route.ts");
    expect(emailRoute).toContain("signInWithPassword");
    expect(emailRoute).toContain("signUp");
    expect(emailRoute).toContain("resetPasswordForEmail");
    expect(emailRoute).toContain("updateUser({ password })");
    expect(emailRoute).not.toContain("tradesperson_profiles");
    expect(read("app/auth/callback/route.ts")).toContain("exchangeCodeForSession");
  });

  it("keeps privacy requests server-managed and internal IDs out of account UI", () => {
    const page = read("app/meistras/paskyra/page.tsx");
    expect(page).not.toContain("{user.id}");
    expect(page).not.toContain("{profile.id}");
    expect(read("supabase/migrations/016_tradesperson_privacy_requests.sql")).toContain("enable row level security");
    expect(read("app/api/meistras/account-requests/route.ts")).toContain("requireOwnedProfile");
  });

  it("contains all requested broad service categories", () => {
    const taxonomy = read("supabase/migrations/015_localpro_service_taxonomy.sql");
    for (const category of ["Vidaus apdaila", "Santechnika", "Elektra ir apsaugos sistemos", "Šildymas, vėdinimas ir kondicionavimas", "Stogai ir skardinimas", "Fasadai ir šiltinimas", "Statyba ir konstrukcijos", "Langai, durys ir laiptai", "Medžio darbai ir baldai", "Lauko ir sklypo darbai", "Griovimas ir atliekų išvežimas", "Meistras į namus", "Projektavimas ir darbų priežiūra"]) expect(taxonomy).toContain(category);
  });

  it("disambiguates the dashboard taxonomy relationship", () => {
    expect(read("app/meistras/paslaugos/page.tsx")).toContain(
      "service_subcategories!service_subcategories_service_category_id_fkey"
    );
  });

  it("keeps legacy category rows but removes them from active public selectors", () => {
    const migration = read("supabase/migrations/019_deactivate_legacy_service_categories.sql");
    expect(migration).toContain("set is_active = false");
    expect(migration.match(/'[^']+'/g)).toHaveLength(13);
    expect(migration).not.toContain("delete from service_categories");
  });
});
