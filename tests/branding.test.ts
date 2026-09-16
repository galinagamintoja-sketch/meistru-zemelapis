import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("LocalPro brand assets", () => {
  it("ships full and icon-only variants and declares them in global metadata", () => {
    expect(statSync("public/brand/localpro-logo.png").size).toBeGreaterThan(10_000);
    expect(statSync("public/brand/localpro-icon.png").size).toBeGreaterThan(10_000);
    const layout = read("app/layout.tsx");
    expect(layout).toContain('/brand/localpro-icon.png');
    expect(statSync("public/brand/localpro-social-v1.png").size).toBeGreaterThan(100_000);
  });

  it("uses the shared brand component across public, account, request and admin surfaces", () => {
    for (const path of [
      "components/LocalProApp.tsx",
      "components/LocalProPreviewBrand.tsx",
      "components/tradesperson-shell.tsx",
      "app/login/page.tsx",
      "app/request/page.tsx",
      "app/admin/page.tsx",
      "app/[profession]/[location]/page.tsx"
    ]) expect(read(path)).toContain("LocalProBrand");
  });

  it("does not retain the old map-pin or text-badge logo markup", () => {
    const sources = [
      read("components/LocalProApp.tsx"),
      read("components/LocalProPreviewBrand.tsx"),
      read("components/tradesperson-shell.tsx"),
      read("app/login/page.tsx")
    ].join("\n");
    expect(sources).not.toContain('className="brand-mark"');
    expect(sources).not.toContain('viewBox="0 0 44 52"');
  });
});
