import { expect, test } from "@playwright/test";

const examples = [
  ["rozetė", "Rozečių ir jungiklių montavimas"],
  ["rozetes", "Rozečių ir jungiklių montavimas"],
  ["sutaisyti rozetę", "Rozečių ir jungiklių montavimas"],
  ["elektrikas", "Elektra ir apsaugos sistemos"],
  ["elektros gedimas", "Gedimų paieška"],
  ["varva kranas", "Santechnikos remontas ir smulkūs darbai"],
  ["plytelės", "Plytelių klijavimas"],
  ["stogo remontas", "Stogo remontas"]
] as const;

for (const viewport of [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 1000 }
]) {
  test(`${viewport.name}: searchable service combobox`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const combobox = page.getByRole("combobox", { name: "Kokio darbo reikia?" });
    const listbox = page.getByRole("listbox", { name: "Darbo sričių ir paslaugų pasiūlymai" });

    for (const [query, expected] of examples) {
      await combobox.fill(query);
      await expect(listbox.getByRole("option").first()).toContainText(expected);
    }

    await combobox.fill("plyteli klij");
    await expect(listbox.getByRole("option").first()).toContainText("Plytelių klijavimas");
    await combobox.press("Enter");
    await expect(combobox).toHaveValue("Plytelių klijavimas");

    await combobox.fill("stogo remontas");
    const firstId = await combobox.getAttribute("aria-activedescendant");
    await combobox.press("ArrowDown");
    await expect.poll(() => combobox.getAttribute("aria-activedescendant")).not.toBe(firstId);
    await combobox.press("ArrowUp");
    await combobox.press("Escape");
    await expect(combobox).toHaveAttribute("aria-expanded", "false");

    await combobox.fill("fortepijono derinimas");
    await expect(page.getByText("Atitinkančių paslaugų nerasta. Pabandykite kitą frazę.")).toBeVisible();
    await page.getByRole("button", { name: "Išvalyti darbo sritį" }).click();
    await expect(combobox).toHaveValue("");
    await expect(listbox.getByRole("option", { name: /Visos sritys/ })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `artifacts/service-search-${viewport.name}.png`, fullPage: true });
  });
}
