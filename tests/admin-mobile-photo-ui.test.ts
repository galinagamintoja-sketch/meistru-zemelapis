import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("../app/admin/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("mobile admin photo UI regressions", () => {
  it("uses the gallery picker without a camera capture input", () => {
    expect(page).toContain("Pridėti nuotraukas");
    expect(page).toContain('accept="image/jpeg,image/png,image/webp" multiple');
    expect(page).not.toContain('capture="environment"');
    expect(page).not.toContain("Fotografuoti");
  });

  it("does not expose obsolete targets, URL guidance, or signed photo values", () => {
    expect(page).not.toContain("#admin-services");
    expect(page).not.toContain("Naudokite viešus URL");
    expect(page).not.toContain("Pagrindinė vieša nuotrauka:");
    expect(page).not.toContain("{photo.url}</");
  });

  it("uses profile-specific photo targets and labelled compact actions", () => {
    expect(page).toContain('id={`admin-photos-${profile.id}`}');
    expect(page).toContain('return `#admin-photos-${profileId}`');
    expect(page).toContain('aria-haspopup="menu"');
    expect(page).toContain('role="menuitem"');
    expect(css).toContain(".admin-photo-menu summary::-webkit-details-marker");
    expect(css).toContain(".admin-photo-menu button { width: 100%");
  });
});
