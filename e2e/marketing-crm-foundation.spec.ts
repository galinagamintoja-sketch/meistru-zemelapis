import { expect, test } from "@playwright/test";

const contacts = [{
  id: "contact-1", display_name: "Jonas Petrauskas", company_name: "JP Apdaila", trade: "Vidaus apdaila", area: "Vilnius",
  status: "new", created_at: "2026-09-18T10:00:00Z",
  marketing_contact_identities: [{ identity_type: "phone", raw_value: "8 612 34567", normalized_value: "+37061234567", is_valid: true }],
  marketing_contact_sources: [{ source_label: "Meistrai Vilniuje", post_url: "https://example.com/post" }]
}];
const overview = {
  mode: "database", counts: { new: 7, registered: 3 }, queue: [
    { id: "queue-1", status: "queued", due_at: "2026-09-19T09:00:00Z", marketing_drafts: { body: "Sveiki, kviečiame susikurti LocalPro profilį.", marketing_contacts: { display_name: "Jonas Petrauskas" } } }
  ],
  conversations: [{ id: "conversation-1", needs_reply: true, unread_count: 1, marketing_contacts: { display_name: "Asta Kazlauskienė" }, marketing_messages: [{ id: "message-1", channel: "email", direction: "inbound", body: "Sveiki, norėčiau sužinoti daugiau." }] }],
  drafts: [{ id: "draft-1", body: "Sveiki, kviečiame prisijungti prie LocalPro.", channel: "telegram", draft_type: "initial", status: "draft", revision: 1, marketing_contacts: { display_name: "Jonas Petrauskas" } }],
  settings: { outreach_rules: { newContactsPerDay: 5, proactiveMessagesPerDay: 20, delayDays: 4, windowStart: "09:00", windowEnd: "18:00", maximumAttempts: 3, globalPause: true } }
};

async function mockMarketing(page: import("@playwright/test").Page) {
  await page.route("**/api/admin/marketing/contacts**", (route) => route.fulfill({ json: { mode: "database", contacts } }));
  await page.route("**/api/admin/marketing/overview", (route) => route.fulfill({ json: overview }));
}

test("marketing CRM desktop overview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await mockMarketing(page);
  await page.goto("/admin/marketing");
  await expect(page.getByRole("heading", { name: "Ryšių su meistrais centras" })).toBeVisible();
  await expect(page.getByText("Globalus pristabdymas įjungtas")).toBeVisible();
  await page.screenshot({ path: "artifacts/marketing-crm-desktop.png", fullPage: true });
});

test("marketing CRM Android contacts", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockMarketing(page);
  await page.goto("/admin/marketing");
  await page.getByRole("button", { name: "Kontaktai" }).click();
  await expect(page.getByRole("heading", { name: "Importuoti kontaktus" })).toBeVisible();
  await expect(page.getByText("Jonas Petrauskas")).toBeVisible();
  await page.screenshot({ path: "artifacts/marketing-crm-mobile.png", fullPage: true });
});
