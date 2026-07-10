import { beforeEach, describe, expect, it, vi } from "vitest";

describe("public specialist listing", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.LOCALPRO_SEED_MODE = "true";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("returns only approved specialists publicly", async () => {
    const { getSpecialists } = await import("../lib/specialists");
    const specialists = await getSpecialists();

    expect(specialists.length).toBeGreaterThan(0);
    expect(specialists.every((specialist) => specialist.status === "approved")).toBe(true);
  });
});
