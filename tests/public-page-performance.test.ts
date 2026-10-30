import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { publicCardImage } from "../lib/public-card-image";
import { createPublicTaxonomyCache } from "../lib/public-job-taxonomy-cache";
import PublicPageLoading from "../components/PublicPageLoading";

const filters = { trade: "", service: "", area: "", period: "all", contactOnly: false };
const taxonomy = { trades: [{ id: "one", name: "Santechnika", count: 3 }], areas: [], services: [] };

describe("public page performance boundaries", () => {
  it("keeps archive client navigation without background archive work during homepage loading", () => {
    for (const file of ["HomepagePreviewV2", "HomepageAnswers", "SiteFooter"]) {
      const source = readFileSync(`components/${file}.tsx`, "utf8");
      expect(source).toMatch(/<Link\b[^>]*href="\/darbu-skelbimai"[^>]*prefetch=\{false\}/);
    }
  });
  it("resizes a real large legacy camera image to a small decodable card without changing the original", async () => {
    const buffer = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#254a68" } }).jpeg({ quality: 95 }).toBuffer();
    const original = new Blob([new Uint8Array(buffer)], { type: "image/jpeg" });
    const result = await publicCardImage(original);
    const metadata = await sharp(Buffer.from(await result.arrayBuffer())).metadata();
    expect(result.type).toBe("image/webp");
    expect(metadata.width).toBe(480);
    expect(metadata.height).toBe(320);
    expect(result.size).toBeLessThan(original.size);
    expect(original.type).toBe("image/jpeg");
    expect(await original.arrayBuffer()).toEqual(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  });
  it("never enlarges small photos and preserves unsupported legacy fallback", async () => {
    const buffer = await sharp({ create: { width: 32, height: 24, channels: 3, background: "red" } }).png().toBuffer();
    const result = await publicCardImage(new Blob([new Uint8Array(buffer)], { type: "image/png" }));
    expect((await sharp(Buffer.from(await result.arrayBuffer())).metadata()).width).toBe(32);
    const invalid = new Blob(["legacy unsupported"], { type: "image/jpeg" });
    expect(await publicCardImage(invalid)).toBe(invalid);
  });
  it("coalesces only identical public taxonomy work and isolates caller mutations", async () => {
    const load = vi.fn(async () => structuredClone(taxonomy));
    const cached = createPublicTaxonomyCache(load);
    const [one, two] = await Promise.all([cached(filters), cached(filters)]);
    expect(load).toHaveBeenCalledTimes(1);
    one!.trades[0].count = 99;
    expect(two!.trades[0].count).toBe(3);
    expect((await cached(filters))!.trades[0].count).toBe(3);
    for (const changed of [{ area: "vilnius" }, { trade: "other" }, { service: "other" }, { period: "1d" }, { contactOnly: true }]) await cached({ ...filters, ...changed });
    expect(load).toHaveBeenCalledTimes(6);
  });
  it("expires public counts after 15 seconds and never caches unavailable results", async () => {
    let now = 0;
    const load = vi.fn(async () => structuredClone(taxonomy));
    const cached = createPublicTaxonomyCache(load, () => now);
    await cached(filters); now = 14_999; await cached(filters);
    expect(load).toHaveBeenCalledTimes(1);
    now = 15_000; await cached(filters); expect(load).toHaveBeenCalledTimes(2);
    cached.clear(); await cached(filters); expect(load).toHaveBeenCalledTimes(3);
    const fail = vi.fn(async () => null);
    const unavailable = createPublicTaxonomyCache(fail);
    expect(await unavailable(filters)).toBeNull(); expect(await unavailable(filters)).toBeNull();
    expect(fail).toHaveBeenCalledTimes(2);
  });
  it("does not gate real homepage search behind a root loading shell", () => {
    expect(existsSync("app/loading.tsx")).toBe(false);
    expect(readFileSync("app/darbu-skelbimai/loading.tsx", "utf8")).toContain("PublicPageLoading");
  });
  it("streams an accessible honest loading state rather than inventing profiles or jobs", () => {
    const html = renderToStaticMarkup(createElement(PublicPageLoading, { archive: true }));
    expect(html).toContain('aria-busy="true"'); expect(html).toContain('role="status"');
    expect(html).toContain("Darbų skelbimai"); expect(html).not.toContain("<article");
  });
});
