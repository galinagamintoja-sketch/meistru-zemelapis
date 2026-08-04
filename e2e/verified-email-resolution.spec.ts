import { createClient, type Session } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const protectionBypass = process.env.VERCEL_PROTECTION_BYPASS;
const marker = `qa-browser-email-${Date.now()}`;
const authIds: string[] = [];
let uniqueEmail = "";
let ambiguousEmail = "";
let unrelatedEmail = "";
let uniqueProfileId = "";
const uniquePrivateName = `PRIVATE-UNIQUE-${Date.now()}`;
const ambiguousPrivateNames = [`PRIVATE-AMBIGUOUS-A-${Date.now()}`, `PRIVATE-AMBIGUOUS-B-${Date.now()}`];

test.skip(!baseURL || !supabaseUrl || !anonKey || !serviceKey, "Requires hosted Preview and development Supabase environment.");
const admin = createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });

async function createAuth(label: string) {
  const email = `${marker}-${label}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { qa_marker: marker } });
  if (error || !data.user) throw error ?? new Error("Auth fixture creation failed");
  authIds.push(data.user.id);
  return email;
}

async function createProfile(label: string, email: string, phoneSuffix: string) {
  const { data, error } = await admin.from("tradesperson_profiles").insert({
    display_name: `${marker}-${label}`,
    phone: `+3706${phoneSuffix}`,
    email,
    base_city: "Vilnius",
    public_status: "private",
    approval_status: "pending",
    source: "admin-created"
  }).select("id").single();
  if (error || !data) throw error ?? new Error("Profile fixture creation failed");
  return data.id;
}

async function sessionFor(email: string) {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (linkError || !link.properties.hashed_token) throw linkError ?? new Error("Magic link failed");
  const publicClient = createClient(supabaseUrl!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await publicClient.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error || !data.session) throw error ?? new Error("Session fixture failed");
  return data.session;
}

async function useSession(page: Page, session: Session) {
  const preview = new URL(baseURL!);
  const projectRef = new URL(supabaseUrl!).hostname.split(".")[0];
  const name = `sb-${projectRef}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const chunks = encoded.length <= 3180 ? [{ name, value: encoded }] : Array.from({ length: Math.ceil(encoded.length / 3180) }, (_, index) => ({
    name: `${name}.${index}`,
    value: encoded.slice(index * 3180, (index + 1) * 3180)
  }));
  await page.context().clearCookies();
  await page.context().addCookies(chunks.map((chunk) => ({ ...chunk, domain: preview.hostname, path: "/", secure: true, httpOnly: false, sameSite: "Lax" as const })));
}

test.describe.serial("hosted verified-email resolution browser flow", () => {
  test.use({
    extraHTTPHeaders: protectionBypass ? { "x-vercel-protection-bypass": protectionBypass } : undefined
  });
  test.beforeAll(async () => {
    uniqueEmail = await createAuth("unique");
    ambiguousEmail = await createAuth("ambiguous");
    unrelatedEmail = await createAuth("unrelated");
    uniqueProfileId = await createProfile(uniquePrivateName, ` ${uniqueEmail.toUpperCase()} `, "8100001");
    await createProfile(ambiguousPrivateNames[0], ambiguousEmail, "8100002");
    await createProfile(ambiguousPrivateNames[1], ` ${ambiguousEmail.toUpperCase()} `, "8100003");
  });

  test.afterAll(async () => {
    const { data: profiles } = await admin.from("tradesperson_profiles").select("id").like("display_name", `${marker}%`);
    if (profiles?.length) await admin.from("tradesperson_profiles").delete().in("id", profiles.map((row) => row.id));
    if (authIds.length) {
      await admin.from("account_resolution_audit").delete().in("auth_user_id", authIds);
      await admin.from("users").delete().in("auth_user_id", authIds);
      for (const id of authIds) await admin.auth.admin.deleteUser(id);
    }
  });

  test("unique match stays generic, links once, and remains idempotent", async ({ page }) => {
    const consoleErrors: string[] = [];
    const failedResponses: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${new URL(response.url()).pathname}`); });
    await useSession(page, await sessionFor(uniqueEmail));
    await page.goto("/meistro-registracija");
    await expect(page).toHaveURL(/\/meistras\/susieti$/);
    await expect(page.getByRole("heading", { name: "Galite atidaryti savo LocalPro paskyrą." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Atidaryti paskyrą" })).toBeVisible();
    const confirmation = page.locator(".unlinked-account");
    await expect(confirmation).not.toContainText(uniquePrivateName);
    await expect(confirmation).not.toContainText("+37068100001");
    await expect(confirmation).not.toContainText(uniqueEmail);
    await page.screenshot({ path: "artifacts/verified-email-unique-confirmation.png", fullPage: true });
    await page.getByRole("button", { name: "Atidaryti paskyrą" }).click();
    await expect(page).toHaveURL(/\/meistras\/uzklausos$/);
    await page.reload();
    await expect(page).toHaveURL(/\/meistras\/uzklausos$/);
    await page.goto("/meistro-registracija");
    await expect(page).toHaveURL(/\/meistras\/uzklausos$/);
    const { data: owned } = await admin.from("tradesperson_profiles").select("id,user_id").eq("id", uniqueProfileId).single();
    const { data: users } = await admin.from("users").select("id").eq("auth_user_id", authIds[0]);
    expect(owned?.user_id).toBeTruthy();
    expect(users).toHaveLength(1);
    expect(consoleErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
  });

  test("ambiguous match shows administrator decision without private details", async ({ page }) => {
    await useSession(page, await sessionFor(ambiguousEmail));
    await page.goto("/meistro-registracija");
    await expect(page).toHaveURL(/\/meistras\/susieti$/);
    await expect(page.getByText("Reikia administratoriaus sprendimo")).toBeVisible();
    const decision = page.locator(".unlinked-account");
    for (const privateName of ambiguousPrivateNames) await expect(decision).not.toContainText(privateName);
    await expect(decision).not.toContainText("+37068100002");
    await expect(decision).not.toContainText("+37068100003");
    await expect(decision).not.toContainText(ambiguousEmail);
    await expect(page.getByRole("button", { name: "Atidaryti paskyrą" })).toHaveCount(0);
    await page.screenshot({ path: "artifacts/verified-email-ambiguous.png", fullPage: true });
  });

  test("unrelated user cannot access the linked profile and normal registration remains available", async ({ page }) => {
    await useSession(page, await sessionFor(unrelatedEmail));
    await page.goto("/meistras/profilis");
    await expect(page.getByText("Užbaikite registraciją")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(uniquePrivateName);
    await page.goto("/meistro-registracija");
    await expect(page.getByRole("form", { name: "LocalPro specialisto registracijos forma" })).toBeVisible();
  });

  test("public homepage, map/profile API, and admin login screen still respond", async ({ page, request }) => {
    await page.context().clearCookies();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/");
    await expect(page.locator(".real-map")).toBeVisible();
    const specialists = await request.get("/api/specialists");
    expect(specialists.ok()).toBe(true);
    await page.goto("/admin");
    await expect(page.getByText("LocalPro admin").first()).toBeVisible();
  });
});
