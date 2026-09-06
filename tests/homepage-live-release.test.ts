import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { profileRowToSpecialist, type ProfileRow } from "../lib/db-mappers";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("homepage live release", () => {
  it("serves the approved homepage component at the root", () => {
    expect(read("app/page.tsx")).toContain("<HomepagePreviewV2");
  });

  it("puts the selected primary photo first", () => {
    const base = {
      id: "profile-1", display_name: "Meistras", company_name: null, phone: "+37060000000", whatsapp_number: null,
      email: "meistras@example.lt", base_city: "Vilnius", radius_km: 25, latitude: null, longitude: null,
      description: "Patyręs meistras", review_score: 0, review_count: 0, verification_labels: [], public_status: "public",
      approval_status: "approved", source: "self-registration", service_area_label: null, operating_areas: [], reviews: []
    } satisfies Omit<ProfileRow, "profile_photos">;
    const specialist = profileRowToSpecialist({ ...base, profile_photos: [
      { id: "first", label: "Pirma", url: "/first.jpg", moderation_status: "approved", sort_order: 0, is_primary: false },
      { id: "primary", label: "Pagrindinė", url: "/primary.jpg", moderation_status: "approved", sort_order: 3, is_primary: true }
    ] });
    expect(specialist.photoUrls).toEqual(["/primary.jpg", "/first.jpg"]);
  });

  it("does not fall back to demo profiles in production profile routes", () => {
    const source = read("app/meistrai/[slug]/page.tsx");
    expect(source).toContain('process.env.NODE_ENV === "production"');
    expect(source).toContain('process.env.LOCALPRO_SEED_MODE !== "true"');
  });
});
