import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(process.cwd(), "components/HomepagePreviewV2.tsx"), "utf8");

describe("homepage v2 discovery flow", () => {
  it("uses the agreed homepage message", () => {
    expect(source).toContain("Patikimi meistrai");
    expect(source).toContain("jūsų mieste");
  });

  it("defaults to the list and offers near-me search without a manual radius control", () => {
    expect(source).toContain('useState<ViewMode>("list")');
    expect(source).toContain("Rodyti specialistus netoli manęs");
    expect(source).not.toContain("Paieškos spindulys");
  });

  it("starts nearby search at 25 km and expands an empty result to 50 km", () => {
    expect(source).toContain("const nearbyInitialRadiusKm = 25");
    expect(source).toContain("const nearbyExpandedRadiusKm = 50");
    expect(source).toContain("!searchPoint || nearbyRadiusKm !== nearbyInitialRadiusKm || nearbyInitialMatches.length");
  });

  it("keeps the specialist photo in the map popup and profile-first actions", () => {
    expect(source).toContain("photoWrap.append(photo)");
    expect(source).toContain('link.textContent = "Peržiūrėti profilį"');
    expect(source).toContain('href={`/meistrai/${profileSeoSlug(specialist)}`}');
  });
});
