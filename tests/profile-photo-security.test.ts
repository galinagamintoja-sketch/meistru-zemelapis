import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProfileRow } from "../lib/db-mappers";

const createSignedUrl = vi.fn();

vi.mock("../lib/supabase", () => ({
  createServerSupabase: () => ({
    storage: {
      from: () => ({ createSignedUrl })
    }
  })
}));

function profileWithPhotos(): ProfileRow {
  return {
    id: "profile-1",
    display_name: "Test",
    company_name: null,
    phone: "+37060000000",
    whatsapp_number: null,
    email: "test@example.lt",
    base_city: "Vilnius",
    radius_km: 25,
    latitude: null,
    longitude: null,
    description: null,
    review_score: null,
    review_count: null,
    verification_labels: [],
    public_status: "public",
    approval_status: "approved",
    source: "self-registration",
    service_area_label: null,
    profile_photos: [
      { id: "approved", label: null, url: null, storage_path: "profile-1/approved.jpg", moderation_status: "approved", sort_order: 1 },
      { id: "pending", label: null, url: null, storage_path: "profile-1/pending.jpg", moderation_status: "pending", sort_order: 2 },
      { id: "external", label: null, url: "https://example.lt/work.jpg", storage_path: null, moderation_status: "approved", sort_order: 3 }
    ]
  };
}

describe("managed profile photo access", () => {
  beforeEach(() => {
    createSignedUrl.mockReset();
    createSignedUrl.mockImplementation(async (path: string) => ({ data: { signedUrl: `https://signed.test/${path}` }, error: null }));
  });

  it("signs only approved managed photos for public responses", async () => {
    const { signManagedPhotoUrls } = await import("../lib/specialists");
    const rows = await signManagedPhotoUrls([profileWithPhotos()], false);

    expect(createSignedUrl).toHaveBeenCalledTimes(1);
    expect(rows[0].profile_photos?.[0].url).toContain("approved.jpg");
    expect(rows[0].profile_photos?.[1].url).toBeNull();
    expect(rows[0].profile_photos?.[2].url).toBe("https://example.lt/work.jpg");
  });

  it("signs pending managed photos only for authenticated admin review", async () => {
    const { signManagedPhotoUrls } = await import("../lib/specialists");
    const rows = await signManagedPhotoUrls([profileWithPhotos()], true);

    expect(createSignedUrl).toHaveBeenCalledTimes(2);
    expect(rows[0].profile_photos?.[1].url).toContain("pending.jpg");
  });
});
