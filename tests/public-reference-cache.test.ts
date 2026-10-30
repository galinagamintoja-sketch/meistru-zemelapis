import { describe, expect, it, vi } from "vitest";
import { createPublicReferenceCache } from "../lib/public-reference-cache";

describe("public reference-only cache", () => {
  it("coalesces overlapping loads and isolates returned labels", async () => {
    const load = vi.fn(async () => [{ name: "Elektra" }]);
    const cached = createPublicReferenceCache(load, 60_000);
    const [a,b] = await Promise.all([cached(), cached()]);
    a[0].name = "mutated";
    expect(b[0].name).toBe("Elektra");
    expect((await cached())[0].name).toBe("Elektra");
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("expires at a fixed deadline rather than extending it on hits", async () => {
    let now = 0;
    const load = vi.fn(async () => ["label"]);
    const cached = createPublicReferenceCache(load, 60_000, () => now);
    await cached(); now = 59_999; await cached();
    expect(load).toHaveBeenCalledTimes(1);
    now = 60_000; await cached(); expect(load).toHaveBeenCalledTimes(2);
  });
  it("does not retain a failed request", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(["fresh"]);
    const cached = createPublicReferenceCache(load, 60_000);
    await expect(cached()).rejects.toThrow("offline");
    expect(await cached()).toEqual(["fresh"]);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it("does not allow a cleared in-flight request to overwrite newer labels", async () => {
    let finish!: (v: string[]) => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise<string[]>(r => {finish=r;})).mockResolvedValue(["new"]);
    const cached = createPublicReferenceCache<string[]>(load, 60_000);
    const old = cached(); await Promise.resolve(); cached.clear();
    expect(await cached()).toEqual(["new"]);
    finish(["old"]); await old;
    expect(await cached()).toEqual(["new"]);
  });
});
