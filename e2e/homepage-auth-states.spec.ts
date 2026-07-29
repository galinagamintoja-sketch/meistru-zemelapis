import { createClient, type Session } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const qaPrefix = `qa-homepage-${Date.now()}`;
const screenshotDir = "artifacts/homepage-auth";
let disposableAuthUserId = "";
let noProfileEmail = "";
let specialistEmail = "";

function requiredEnvironment(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for authenticated Preview QA.`);
  return value;
}

const supabaseUrl = requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = requiredEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
const adminEmail = process.env.QA_ADMIN_EMAIL ?? "";
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function sessionForEmail(email: string) {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link.properties.hashed_token) throw linkError ?? new Error("Magic-link token was not created.");
  const client = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error || !data.session) throw error ?? new Error("Preview session was not created.");
  return data.session;
}

async function useSession(page: Page, session: Session) {
  const previewUrl = new URL(requiredEnvironment("PLAYWRIGHT_BASE_URL"));
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const chunks = encoded.length <= 3180
    ? [{ name: cookieName, value: encoded }]
    : Array.from({ length: Math.ceil(encoded.length / 3180) }, (_, index) => ({
        name: `${cookieName}.${index}`,
        value: encoded.slice(index * 3180, (index + 1) * 3180)
      }));
  await page.context().clearCookies();
  await page.context().addCookies(chunks.map((chunk) => ({
    ...chunk,
    domain: previewUrl.hostname,
    path: "/",
    httpOnly: false,
    secure: previewUrl.protocol === "https:",
    sameSite: "Lax" as const
  })));
}

test.describe.serial("real Preview homepage authentication states", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeAll(async () => {
    noProfileEmail = `${qaPrefix}@example.lt`;
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: noProfileEmail,
      email_confirm: true,
      user_metadata: { name: "QA registracija" }
    });
    if (createError || !created.user) throw createError ?? new Error("Disposable Auth user was not created.");
    disposableAuthUserId = created.user.id;

    const { data: profile, error: profileError } = await admin
      .from("tradesperson_profiles")
      .select("user_id")
      .not("user_id", "is", null)
      .limit(1)
      .single();
    if (profileError || !profile?.user_id) throw profileError ?? new Error("Linked specialist profile was not found.");
    const { data: localUser, error: userError } = await admin
      .from("users")
      .select("auth_user_id")
      .eq("id", profile.user_id)
      .single();
    if (userError || !localUser?.auth_user_id) throw userError ?? new Error("Linked Auth user was not found.");
    const { data: authUser, error: authError } = await admin.auth.admin.getUserById(localUser.auth_user_id);
    if (authError || !authUser.user?.email) throw authError ?? new Error("Specialist Auth email was not found.");
    specialistEmail = authUser.user.email;
  });

  test.afterAll(async () => {
    if (disposableAuthUserId) await admin.auth.admin.deleteUser(disposableAuthUserId);
  });

  test("logged-out homepage and registration entry", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Patikimi meistrai jūsų mieste." })).toBeVisible();
    await expect(page.locator("summary", { hasText: "Meniu" })).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/01-logged-out-homepage.png`, fullPage: true });
    await page.getByRole("link", { name: "Meistro registracija" }).first().click();
    await expect(page).toHaveURL(/\/meistro-registracija$/);
  });

  test("authenticated user without a profile sees the form", async ({ page }) => {
    await useSession(page, await sessionForEmail(noProfileEmail));
    await page.goto("/");
    await expect(page.locator(".mobile-account-identity").getByText("Prisijungta kaip")).toBeVisible();
    await expect(page.getByLabel("Atidaryti paskyros meniu")).toContainText("Paskyra");
    await expect(page.getByText("Tęsti registraciją").first()).toBeAttached();
    await expect(page.getByText("Pasirinkite specialistą žemėlapyje arba sąraše.")).toHaveCount(0);
    await page.screenshot({ path: `${screenshotDir}/02-no-profile-homepage.png`, fullPage: true });
    await page.goto("/meistro-registracija");
    await expect(page.getByRole("form", { name: "LocalPro specialisto registracijos forma" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pasirinkite specialistą žemėlapyje arba sąraše." })).toBeHidden();
    await expect(page.getByText("Profilio peržiūra")).toHaveCount(0);
    await page.screenshot({ path: `${screenshotDir}/05-registration-form.png`, fullPage: true });
  });

  test("existing specialist sees account, logs out, and registration redirects", async ({ page }) => {
    await useSession(page, await sessionForEmail(specialistEmail));
    await page.goto("/");
    await expect(page.getByText("Meistro paskyra").first()).toBeAttached();
    await expect(page.getByText("Meistro registracija")).toHaveCount(0);
    await expect(page.getByLabel("Atidaryti paskyros meniu")).toBeVisible();
    await expect(page.getByLabel("Atidaryti paskyros meniu")).toContainText("Paskyra");
    await expect(page.getByLabel("Atidaryti paskyros meniu")).toHaveCSS("min-height", "44px");
    await expect(page.getByText("Pasirinkite specialistą žemėlapyje arba sąraše.")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: `${screenshotDir}/03-specialist-homepage.png`, fullPage: true });
    await page.goto("/meistro-registracija");
    await expect(page).toHaveURL(/\/meistras\/uzklausos$/);
    await page.goto("/");
    await page.getByLabel("Atidaryti paskyros meniu").click();
    await page.screenshot({ path: `${screenshotDir}/03b-specialist-account-menu.png` });
    await page.getByRole("button", { name: "Atsijungti" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("summary", { hasText: "Meniu" })).toBeVisible();
  });

  test("administrator state is server verified and registration is deliberate", async ({ page }) => {
    test.skip(!adminEmail, "QA_ADMIN_EMAIL is not configured.");
    await useSession(page, await sessionForEmail(adminEmail));
    await page.goto("/");
    await expect(page.getByText("Administravimas").first()).toBeAttached();
    await page.screenshot({ path: `${screenshotDir}/04-admin-homepage.png`, fullPage: true });
    await page.goto("/meistro-registracija");
    await expect(page.getByText("Meistro profilis nebus sukurtas automatiškai")).toBeVisible();
    await expect(page.getByRole("button", { name: "Registruotis kaip meistrui" })).toBeVisible();
  });
});
