import { createClient, type Session } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const qaEmail = `qa-address-preview-${Date.now()}@example.invalid`;
test.skip(!baseURL || !supabaseUrl || !anonKey || !serviceKey, "Requires hosted Preview and development Supabase credentials.");
const admin = createClient(supabaseUrl ?? "https://invalid.example", serviceKey ?? "missing", { auth: { persistSession: false, autoRefreshToken: false } });
let authUserId = "";
let session: Session;

async function useSession(page: Page) {
  const preview = new URL(baseURL!);
  const projectRef = new URL(supabaseUrl!).hostname.split(".")[0];
  const name = `sb-${projectRef}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const chunks = encoded.length <= 3180 ? [{ name, value: encoded }] : Array.from({ length: Math.ceil(encoded.length / 3180) }, (_, index) => ({
    name: `${name}.${index}`,
    value: encoded.slice(index * 3180, (index + 1) * 3180)
  }));
  await page.context().addCookies(chunks.map((chunk) => ({ ...chunk, domain: preview.hostname, path: "/", secure: true, httpOnly: false, sameSite: "Lax" as const })));
}

test.beforeAll(async () => {
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email: qaEmail, email_confirm: true });
  if (createError || !created.user) throw createError ?? new Error("QA user creation failed");
  authUserId = created.user.id;
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: qaEmail });
  if (linkError || !link.properties.hashed_token) throw linkError ?? new Error("QA magic link failed");
  const publicClient = createClient(supabaseUrl!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await publicClient.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error || !data.session) throw error ?? new Error("QA session failed");
  session = data.session;
});

test.afterAll(async () => {
  if (authUserId) await admin.auth.admin.deleteUser(authUserId);
});

test("real Preview mobile touch scrolling and tap selection", async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedResponses: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  page.on("response", (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await useSession(page);
  await page.goto("/meistro-registracija?qa=0a44e58", { waitUntil: "domcontentloaded" });
  const input = page.getByRole("combobox", { name: "Registracijos adresas" });
  await expect(input).toBeVisible();
  await input.fill("Lentvaris");
  const list = page.getByRole("listbox");
  await page.waitForTimeout(3_000);
  if (!await list.isVisible()) {
    const diagnostics = await page.evaluate(() => ({
      googleScriptPresent: Boolean(document.querySelector("script[data-localpro-google-places]")),
      googleMapsPresent: Boolean(window.google?.maps),
      status: document.querySelector(".address-autocomplete .status-message")?.textContent ?? ""
    }));
    throw new Error(`Google Places diagnostics: ${JSON.stringify({ diagnostics, consoleErrors, failedResponses })}`);
  }
  await expect(list).toBeVisible({ timeout: 15_000 });
  const buttons = list.getByRole("button");
  expect(await buttons.count()).toBeGreaterThanOrEqual(4);
  await expect(input).not.toHaveAttribute("aria-activedescendant");
  const labels = await buttons.allTextContents();
  expect(labels.some((label) => /Lentvar/i.test(label))).toBe(true);
  for (const button of await buttons.all()) {
    const style = await button.evaluate((element) => {
      const computed = getComputedStyle(element);
      return { color: computed.color, background: computed.backgroundColor };
    });
    expect(style).toEqual({ color: "rgb(33, 29, 24)", background: "rgb(255, 255, 255)" });
  }
  const scrollMetrics = await list.evaluate((element) => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight }));
  expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
  const box = await list.boundingBox();
  expect(box).not.toBeNull();
  const before = await list.evaluate((element) => element.scrollTop);
  const cdp = await page.context().newCDPSession(page);
  const x = box!.x + box!.width / 2;
  const startY = box!.y + box!.height - 30;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY }] });
  for (let step = 1; step <= 12; step += 1) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: startY - step * 18 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(before);
  await expect(input).toHaveValue("Lentvaris");
  await expect(list).toBeVisible();
  const target = buttons.last();
  const targetLabel = (await target.textContent())!.trim();
  await target.click();
  await expect(list).toBeHidden();
  await expect(input).not.toHaveValue("Lentvaris");
  expect((await input.inputValue()).toLowerCase()).toContain(targetLabel.split(",")[0].toLowerCase());
  expect(consoleErrors).toEqual([]);
  expect(failedResponses).toEqual([]);
});

test("real Preview desktop keyboard selection", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await useSession(page);
  await page.goto("/meistro-registracija?qa=keyboard-0a44e58", { waitUntil: "domcontentloaded" });
  const input = page.getByRole("combobox", { name: "Registracijos adresas" });
  await input.fill("Lentvaris");
  await expect(page.getByRole("listbox")).toBeVisible({ timeout: 15_000 });
  await input.press("ArrowDown");
  await input.press("ArrowDown");
  await expect(input).toHaveAttribute("aria-activedescendant", /-1$/);
  await input.press("Enter");
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(input).not.toHaveValue("Lentvaris");
});
