import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SafeProfileImage, { rememberFailedProfileImage } from "../components/SafeProfileImage";
import { specialistPhotoCandidates } from "../lib/specialist-photos";

const mocks = vi.hoisted(() => ({ photo: {} as Record<string, unknown>, download: vi.fn() }));
vi.mock("../lib/supabase", () => ({ createServerSupabase: () => ({
  from: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: mocks.photo, error: null }) };
    return query;
  },
  storage: { from: () => ({ download: mocks.download }) }
}) }));
import { GET } from "../app/api/public/profile-photos/[id]/route";
const id = "7c96fe6e-0a81-4976-9153-fb109be5adba";
const original = `/api/public/profile-photos/${id}`;
const thumbnail = `${original}?variant=card`;

beforeEach(() => {
  mocks.photo = { storage_path: "original.webp", card_storage_path: "card.webp", moderation_status: "approved", removed_from_profile_at: null,
    tradesperson_profiles: { public_status: "public", approval_status: "approved", is_demo: false, public_contact_consent_at: "2026-01-01" } };
  mocks.download.mockReset().mockResolvedValue({ data: new Blob(["image"], { type: "image/webp" }), error: null });
});

describe("approved specialist photo display", () => {
  it("serves managed card photos directly without the failing Next image optimiser", () => {
    const html = renderToStaticMarkup(createElement(SafeProfileImage, { src: thumbnail, alt: "Portfolio" }));
    expect(html).toContain(`src="${thumbnail}"`);
    expect(html).not.toContain("/_next/image");
  });
  it("tries an approved original instead of initials or illustration when the thumbnail fails", () => {
    const broken = "/api/public/profile-photos/broken-card?variant=card";
    rememberFailedProfileImage(broken);
    const html = renderToStaticMarkup(createElement(SafeProfileImage, { src: broken, fallbackSrcs: [original], alt: "Portfolio" }));
    expect(html).toContain(`src="${original}"`);
    expect(html).not.toContain("safe-profile-image-fallback");
    expect(html).not.toContain("trade-defaults");
  });
  it("includes approved portfolio photos even without a primary/card photo and excludes rejected/removed records", () => {
    expect(specialistPhotoCandidates({ photos: ["Portfolio label"], photoRecords: [
      { id: "a", url: original, label: "Work", moderationStatus: "approved", removedAt: null },
      { id: "b", url: "/pending", label: null, moderationStatus: "pending", removedAt: null },
      { id: "c", url: "/removed", label: null, moderationStatus: "approved", removedAt: "2026-01-01" },
    ] })).toEqual([original]);
  });
  it("selects the card then original, deduplicates, and never adds illustrative images to approved-photo candidates", () => {
    expect(specialistPhotoCandidates({ cardPhotoUrls: [thumbnail], photoUrls: [original, original], photos: ["Filename.webp"] })).toEqual([thumbnail, original]);
    expect(specialistPhotoCandidates({ photos: ["Darbų pavyzdžiai laukiami"] })).toEqual([]);
  });
  it("supports legacy external photo URLs without an optimiser allowlist", () => {
    const html = renderToStaticMarkup(createElement(SafeProfileImage, { src: "https://legacy.example.lt/work.jpg", alt: "Work" }));
    expect(html).toContain('src="https://legacy.example.lt/work.jpg"');
    expect(html).not.toContain("/_next/image");
  });
  it("falls back to the original if the stored thumbnail object is missing", async () => {
    mocks.download.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
    const r = await GET(new Request(`https://localpro.lt${thumbnail}`), { params: Promise.resolve({ id }) });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/webp");
    expect(mocks.download.mock.calls.map(([p]) => p)).toEqual(["card.webp", "original.webp"]);
  });
  it("works for existing approved uploads that never had a thumbnail", async () => {
    mocks.photo.card_storage_path = null;
    const r = await GET(new Request(`https://localpro.lt${thumbnail}`), { params: Promise.resolve({ id }) });
    expect(r.status).toBe(200);
    expect(mocks.download).toHaveBeenCalledWith("original.webp");
  });
  it.each(["pending", "rejected"])("never exposes %s portfolio photos", async (status) => {
    mocks.photo.moderation_status = status;
    const r = await GET(new Request(`https://localpro.lt${thumbnail}`), { params: Promise.resolve({ id }) });
    expect(r.status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("keeps removed photos and private profiles inaccessible", async () => {
    mocks.photo.removed_from_profile_at = "2026-01-01";
    expect((await GET(new Request(`https://localpro.lt${thumbnail}`), { params: Promise.resolve({ id }) })).status).toBe(404);
    mocks.photo.removed_from_profile_at = null;
    (mocks.photo.tradesperson_profiles as Record<string, unknown>).public_status = "private";
    expect((await GET(new Request(`https://localpro.lt${thumbnail}`), { params: Promise.resolve({ id }) })).status).toBe(404);
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
