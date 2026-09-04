import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const gallery = fs.readFileSync(path.join(process.cwd(), "components/PublicProfileGallery.tsx"), "utf8");
const profile = fs.readFileSync(path.join(process.cwd(), "app/meistrai/[slug]/page.tsx"), "utf8");

describe("public tradesperson profile gallery", () => {
  it("shows a compact hero image beneath the tradesperson name", () => {
    expect(profile).toContain("<PublicProfileGallery");
    expect(gallery).toContain('className="public-profile-hero-photo"');
  });

  it("keeps the compact hero placeholder when a profile has no image", () => {
    expect(gallery).toContain("disabled={!photoUrls.length}");
    expect(gallery).not.toContain("if (!photoUrls.length) return null");
  });

  it("opens every gallery image in an accessible viewer", () => {
    expect(gallery).toContain('role="dialog"');
    expect(gallery).toContain('aria-modal="true"');
    expect(gallery).toContain("setActiveIndex(index)");
    expect(gallery).toContain('event.key === "Escape"');
  });

  it("uses the shared preview logo and returns to preview search results", () => {
    expect(profile).toContain("<LocalProPreviewBrand />");
    expect(profile).toContain('href="/preview/homepage-v2#results"');
  });
});
