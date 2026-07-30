import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../components/LocalProApp.tsx", import.meta.url), "utf8");

describe("registration mobile UI regressions", () => {
  it("allows the two services available in a single category", () => {
    expect(page).toContain("draft.subcategorySlugs.length < 2");
    expect(page).toContain("Pasirinkite bent 2 konkrečias paslaugas.");
    expect(page).toContain("formState.subcategorySlugs.length}/{MAX_PROFILE_SERVICES}");
    expect(page).toContain("MAX_PROFILE_SERVICES - formState.subcategorySlugs.length");
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
});
