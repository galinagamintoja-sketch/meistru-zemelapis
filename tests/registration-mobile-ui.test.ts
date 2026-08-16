import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../components/LocalProApp.tsx", import.meta.url), "utf8");
const autocomplete = readFileSync(new URL("../components/AddressAutocomplete.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

describe("registration mobile UI regressions", () => {
  it("allows the two services available in a single category", () => {
    expect(page).toContain("draft.subcategorySlugs.length < 2");
    expect(page).toContain("Pasirinkite bent 2 konkrečias paslaugas.");
    expect(page).toContain('selectionCounter("Paslaugos", formState.subcategorySlugs.length, MAX_PROFILE_SERVICES)');
    expect(page).toContain("Pasiekėte 25 paslaugų limitą.");
    expect(page).toContain("window.confirm");
    expect(page).toContain("Pašalinus darbo sritį, šios paslaugos taip pat bus pašalintos.");
    expect(page).toContain("disabled={!formState.subcategorySlugs.includes(subcategory.slug) && formState.subcategorySlugs.length >= MAX_PROFILE_SERVICES}");
  });

  it("keeps manual URL import collapsed and starts without an empty URL row", () => {
    expect(page).toContain("photoUrls: []");
    expect(page).toContain("<summary>Išplėstiniai nustatymai: nuotraukų URL</summary>");
    expect(page).not.toContain('photoUrls: [""]');
  });

  it("shows removable local thumbnails before registration is submitted", () => {
    expect(page).toContain('className="registration-selected-photos"');
    expect(page).toContain("src={photo.previewUrl}");
    expect(page).toContain("removePhotoUpload(index)");
  });

  it("labels the description counter as a minimum", () => {
    expect(page).toContain("ženklų; mažiausiai 80");
  });
  it("keeps mobile address suggestions scrollable, bounded, and readable inside registration", () => {
    expect(styles).toMatch(/\.address-suggestions\s*\{[^}]*max-height:\s*min\(320px,\s*50vh\)/);
    expect(styles).toMatch(/\.address-suggestions\s*\{[^}]*overflow-y:\s*auto/);
    expect(styles).toMatch(/\.address-suggestions\s*\{[^}]*-webkit-overflow-scrolling:\s*touch/);
    expect(styles).toMatch(/\.registration-form \.address-suggestions button\s*\{[^}]*background:\s*#fff/);
    expect(styles).toMatch(/\.registration-form \.address-suggestions button\s*\{[^}]*color:\s*var\(--ink\)/);
  });

  it("does not select a suggestion on pointer-down and starts without a highlighted result", () => {
    expect(autocomplete).not.toContain("onPointerDown");
    expect(autocomplete).toContain("setActiveIndex(-1);");
    expect(autocomplete).not.toContain("setActiveIndex(nextSuggestions.length ? 0 : -1)");
    expect(autocomplete).toContain("onClick={() => void selectSuggestion(suggestion)}");
  });
});
