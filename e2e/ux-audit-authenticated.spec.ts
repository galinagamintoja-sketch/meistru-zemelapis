import { createClient, type Session } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const qaId = `qa-ux-${Date.now()}`;
const longName = "Valentinas Labai Ilgą Prisijungusios Paskyros Vardą Turintis Statybos Specialistas";
const url = required("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
let authUserId = "";
let profileId = "";
let photoPath = "";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function useSession(page: Page, session: Session) {
  const host = new URL(required("PLAYWRIGHT_BASE_URL"));
  const ref = new URL(url).hostname.split(".")[0];
  const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const chunks = Array.from({ length: Math.ceil(encoded.length / 3180) }, (_, index) => ({
    name: encoded.length <= 3180 ? `sb-${ref}-auth-token` : `sb-${ref}-auth-token.${index}`,
    value: encoded.slice(index * 3180, (index + 1) * 3180)
  }));
  await page.context().addCookies(chunks.map((chunk) => ({ ...chunk, domain: host.hostname, path: "/", secure: true, sameSite: "Lax" as const })));
}

test.describe.serial("authenticated UX audit completion", () => {
  test.beforeAll(async () => {
    const email = `${qaId}@localpro.qa`;
    const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name: longName, full_name: longName } });
    if (created.error || !created.data.user) throw created.error ?? new Error("Disposable user creation failed");
    authUserId = created.data.user.id;

    const { data: category } = await admin.from("service_categories").select("id,name,slug").eq("is_active", true).limit(1).single();
    if (!category) throw new Error("Category fixture unavailable");
    const { data: subcategories } = await admin.from("service_subcategories").select("id").eq("service_category_id", category.id).eq("is_active", true).limit(2);
    if (!subcategories || subcategories.length < 2) throw new Error("Two service fixtures unavailable");
    const inserted = await admin.from("tradesperson_profiles").insert({
      display_name: "Gediminas Galerijos Meistras", phone: "+37060000001", email,
      base_city: "Vilnius", radius_km: 25, description: "Profesionaliai ir atsakingai atlieku statybos bei apdailos darbus Vilniuje, pateikiu aiškią darbų eigą ir garantiją.",
      service_category_id: category.id, public_status: "public", approval_status: "approved", is_demo: false,
      review_score: 5, review_count: 999,
      public_contact_consent_at: new Date().toISOString(), source: "admin-created"
    }).select("id").single();
    if (inserted.error || !inserted.data) throw inserted.error ?? new Error("Profile fixture failed");
    profileId = inserted.data.id;
    await admin.from("profile_services").insert(subcategories.map((item) => ({ tradesperson_profile_id: profileId, service_category_id: category.id, service_subcategory_id: item.id })));
    await admin.from("operating_areas").insert({ tradesperson_profile_id: profileId, city: "Vilnius", radius_km: 25 });
    photoPath = `${profileId}/${qaId}.webp`;
    const webp = Buffer.from("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v89WAAAAA==", "base64");
    const upload = await admin.storage.from("profile-photos").upload(photoPath, webp, { contentType: "image/webp", upsert: false });
    if (upload.error) throw upload.error;
    await admin.from("profile_photos").insert({ tradesperson_profile_id: profileId, storage_path: photoPath, label: qaId, moderation_status: "approved", sort_order: 0, is_primary: true });
  });

  test.afterAll(async () => {
    if (photoPath) await admin.storage.from("profile-photos").remove([photoPath]);
    if (profileId) await admin.from("tradesperson_profiles").delete().eq("id", profileId);
    if (authUserId) await admin.auth.admin.deleteUser(authUserId);
  });

  test("long authenticated account name reflows at narrow widths and 200% text", async ({ page }) => {
    const email = `${qaId}@localpro.qa`;
    const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (link.error || !link.data.properties.hashed_token) throw link.error ?? new Error("Session link failed");
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const verified = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.data.properties.hashed_token });
    if (verified.error || !verified.data.session) throw verified.error ?? new Error("Session failed");
    await useSession(page, verified.data.session);
    for (const width of [320, 360, 375, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/");
      await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
      await expect(page.locator(".mobile-account-identity")).toContainText(longName);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
  });

  test("approved gallery traps focus and returns it to the opener", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const profileLink = page.locator('a[href^="/meistrai/"]', { hasText: "Gediminas Galerijos Meistras" }).first();
    await expect(profileLink).toBeVisible();
    await profileLink.click();
    const opener = page.getByRole("button", { name: /Atidaryti .* darbų galeriją/ });
    await expect(opener).toBeVisible();
    await opener.click();
    const dialog = page.getByRole("dialog");
    const close = page.getByRole("button", { name: "Uždaryti galeriją" });
    await expect(dialog).toBeVisible();
    await expect(close).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Ankstesnė nuotrauka" })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(close).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
});
