import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { descriptivePhotoLabel, profilePhotoAlt, specialistPhotoAlt } from "../lib/photo-alt";
import { profileRowToSpecialist, toPublicSafeSpecialist, type ProfileRow } from "../lib/db-mappers";
import PublicProfileGallery from "../components/PublicProfileGallery";
import SafeProfileImage, { rememberFailedProfileImage } from "../components/SafeProfileImage";

const name = "Jonas";
const first = "/api/public/profile-photos/alt-first";
const second = "/api/public/profile-photos/alt-second";
const card = `${first}?variant=card`;
const label = "Vonios sienų plytelių apdaila";

function row(): ProfileRow {
  return {
    id: "alt-profile", display_name: name, company_name: null,
    phone: "", whatsapp_number: null, email: "", base_city: "Vilnius", radius_km: 20,
    latitude: null, longitude: null, description: null, review_score: null, review_count: null,
    verification_labels: [], public_status: "public", approval_status: "approved",
    source: "self-registration", service_area_label: null,
    profile_photos: [
      { id: "no-url", label: "No URL label", url: null, sort_order: -2 },
      { id: "second", label: "IMG_1234.jpg", url: second, sort_order: 0 },
      { id: "first", label, url: first, card_url: card, sort_order: 5, is_primary: true },
      { id: "pending", label: "Pending label", url: "/pending-alt", sort_order: -1, moderation_status: "pending" },
      { id: "removed", label: "Removed label", url: "/removed-alt", sort_order: -1, removed_from_profile_at: "2026-01-01" },
    ],
  };
}

describe("truthful public photo alt text", () => {
  it("uses a meaningful label without adding services, location or SEO keywords", () => {
    expect(profilePhotoAlt(name, `  ${label}\n `, 0)).toBe(label);
  });

  it.each([null, "", "  ", "IMG_1234.jpg", "PXL_20260101", "work.WEBP", "https://example.lt/work.jpg", "/private/path.jpg", "C:\\photos\\work.jpg", "data:image/jpeg;base64,abc"])("falls back honestly for non-descriptive label %s", (value) => {
    expect(descriptivePhotoLabel(value)).toBeUndefined();
    expect(profilePhotoAlt(name, value, 1)).toBe("Jonas darbų nuotrauka 2");
  });

  it("preserves approved primary-first URL ordering and attaches labels by URL, not legacy photos index", () => {
    const profile = profileRowToSpecialist(row());
    expect(profile.photoUrls).toEqual([first, second]);
    expect(profile.cardPhotoUrls).toEqual([card, second]);
    expect(profile.photoLabels).toEqual({ [first]: label, [card]: label });
    expect(profilePhotoAlt(name, profile.photoLabels?.[second], 1)).toBe("Jonas darbų nuotrauka 2");
    const safe = toPublicSafeSpecialist(profile);
    expect(safe.photoRecords).toBeUndefined();
    expect(safe.photoLabels).toEqual(profile.photoLabels);
    expect(JSON.stringify(safe.photoLabels)).not.toMatch(/Pending|Removed|No URL/);
  });

  it("resolves card and original labels identically and keeps illustrations explicit", () => {
    const profile = profileRowToSpecialist(row());
    expect(specialistPhotoAlt(profile, card)).toBe(label);
    expect(specialistPhotoAlt(profile, first)).toBe(label);
    expect(specialistPhotoAlt(profile, second)).toBe("Jonas darbų nuotrauka 2");
    expect(specialistPhotoAlt(profile, "/trade-defaults/santechnika.webp")).toBe("Paslauga iliustracinė nuotrauka");
  });

  it("renders labelled hero and thumbnail consistently, and numbers an unlabelled photo", () => {
    const profile = profileRowToSpecialist(row());
    const html = renderToStaticMarkup(createElement(PublicProfileGallery, {
      name, trade: "Apdaila", categorySlug: "vidaus-apdaila", photoUrls: profile.photoUrls!, photoLabels: profile.photoLabels,
    }));
    expect(html.match(new RegExp(`alt="${label}"`, "g"))).toHaveLength(2);
    expect(html).toContain('alt="Jonas darbų nuotrauka 2"');
    expect(html).not.toContain("IMG_1234");
    expect(html).toContain(`src="${first}"`);
    expect(html).toContain(`src="${second}"`);
  });

  it("supports callers without labels and retains the explicit illustration placeholder", () => {
    const props = { name, trade: "Apdaila", categorySlug: "vidaus-apdaila" };
    const html = renderToStaticMarkup(createElement(PublicProfileGallery, { ...props, photoUrls: [first] }));
    expect(html.match(/alt="Jonas darbų nuotrauka 1"/g)).toHaveLength(2);
    const empty = renderToStaticMarkup(createElement(PublicProfileGallery, { ...props, photoUrls: [] }));
    expect(empty).toContain('alt="Apdaila iliustracinė nuotrauka"');
    expect(empty).not.toContain('class="public-profile-gallery"');
  });

  it("resolves alt for the actual fallback image rather than describing the failed image", () => {
    const broken = "/api/public/profile-photos/alt-broken";
    rememberFailedProfileImage(broken);
    const profile = profileRowToSpecialist(row());
    const html = renderToStaticMarkup(createElement(SafeProfileImage, {
      src: broken, fallbackSrcs: [second], alt: label, altForSrc: (src) => specialistPhotoAlt(profile, src),
    }));
    expect(html).toContain(`src="${second}"`);
    expect(html).toContain('alt="Jonas darbų nuotrauka 2"');
    expect(html).not.toContain(`alt="${label}"`);
  });

  it("uses the same alt resolver for the interactive lightbox, hero and thumbnails", () => {
    // Server rendering cannot open a dialog. Guard its shared resolver wiring here;
    // deployed browser coverage exercises the actual navigation separately.
    const source = readFileSync("components/PublicProfileGallery.tsx", "utf8");
    expect(source).toContain("photoUrls.length ? photoAlt(0)");
    expect(source).toContain("alt={photoAlt(index)}");
    expect(source).toContain("alt={photoAlt(activeIndex)}");
  });

  it("updates DOM map popup alt when an approved fallback URL is selected", () => {
    const source = readFileSync("components/HomepagePreviewV2.tsx", "utf8");
    expect(source).toContain("photo.alt = specialistPhotoAlt(specialist, photoUrl)");
    expect(source).toContain("photo.alt = specialistPhotoAlt(specialist, candidates[candidateIndex])");
  });
});
