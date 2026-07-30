import { beforeEach, describe, expect, it, vi } from "vitest";

type StorageMetadata = { size: number; mimetype: string };

function installPhotoRouteSupabase(metadata: StorageMetadata) {
  const inserted: Array<Record<string, unknown>> = [];
  const removed: string[][] = [];

  vi.doMock("../lib/supabase", () => ({
    createServerSupabase: () => ({
      from: (table: string) => {
        const query = {
          select: () => query,
          eq: () => query,
          limit: async () => ({ data: [], error: null }),
          is: async () => ({ count: 0, error: null }),
          insert: async (values: Record<string, unknown>) => {
            inserted.push({ table, ...values });
            return { error: null };
          }
        };
        return query;
      },
      storage: {
        from: () => ({
          list: async () => ({
            data: [{ name: "photo.webp", metadata }],
            error: null
          }),
          remove: async (paths: string[]) => {
            removed.push(paths);
            return { error: null };
          }
        })
      }
    })
  }));

  return { inserted, removed };
}

describe("public registration photo finalization", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  });

  it("creates a private pending record only after server-reported size and type match", async () => {
    const state = installPhotoRouteSupabase({ size: 1000, mimetype: "image/webp" });
    const { createRegistrationPhotoUploadToken } = await import("../lib/registration-photo-upload-token");
    const token = createRegistrationPhotoUploadToken({
      profileId: "profile-id",
      storagePath: "profile-id/photo.webp",
      name: "photo.webp",
      type: "image/webp",
      size: 1000,
      expiresAt: Date.now() + 60_000
    });
    const { POST } = await import("../app/api/tradesperson/register/photos/route");
    const response = await POST(new Request("http://localhost/api/tradesperson/register/photos", {
      method: "POST",
      body: JSON.stringify({ action: "finalize", uploadToken: token })
    }));

    expect(response.status).toBe(200);
    expect(state.inserted).toContainEqual(expect.objectContaining({
      table: "profile_photos",
      storage_path: "profile-id/photo.webp",
      url: null,
      moderation_status: "pending"
    }));
    expect(state.removed).toEqual([]);
  });

  it("removes the object and refuses a mismatched server-reported file", async () => {
    const state = installPhotoRouteSupabase({ size: 999, mimetype: "image/webp" });
    const { createRegistrationPhotoUploadToken } = await import("../lib/registration-photo-upload-token");
    const token = createRegistrationPhotoUploadToken({
      profileId: "profile-id",
      storagePath: "profile-id/photo.webp",
      name: "photo.webp",
      type: "image/webp",
      size: 1000,
      expiresAt: Date.now() + 60_000
    });
    const { POST } = await import("../app/api/tradesperson/register/photos/route");
    const response = await POST(new Request("http://localhost/api/tradesperson/register/photos", {
      method: "POST",
      body: JSON.stringify({ action: "finalize", uploadToken: token })
    }));

    expect(response.status).toBe(400);
    expect(state.inserted).toEqual([]);
    expect(state.removed).toEqual([["profile-id/photo.webp"]]);
  });

  it("rejects expired or forged upload tokens", async () => {
    installPhotoRouteSupabase({ size: 1000, mimetype: "image/jpeg" });
    const { POST } = await import("../app/api/tradesperson/register/photos/route");
    const response = await POST(new Request("http://localhost/api/tradesperson/register/photos", {
      method: "POST",
      body: JSON.stringify({ action: "finalize", uploadToken: "forged.token" })
    }));
    expect(response.status).toBe(401);
  });
});
