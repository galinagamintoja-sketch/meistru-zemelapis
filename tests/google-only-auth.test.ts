import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { safeAuthNext } from "../lib/safe-auth-next";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("Google-only authentication", () => {
  it("accepts only local return destinations", () => {
    expect(safeAuthNext("/meistro-registracija?step=contact")).toBe("/meistro-registracija?step=contact");
    expect(safeAuthNext("https://attacker.example/path")).toBe("/meistras");
    expect(safeAuthNext("//attacker.example/path")).toBe("/meistras");
    expect(safeAuthNext(undefined)).toBe("/meistras");
  });

  it("keeps Google start and callback session exchange while removing password entry points", () => {
    expect(read("app/auth/google/route.ts")).toContain('provider: "google"');
    expect(read("app/auth/callback/route.ts")).toContain("exchangeCodeForSession");
    expect(read("app/login/page.tsx")).toContain("Tęsti su Google");
    expect(read("components/LocalProApp.tsx")).toContain("Tęsti su Google");
    for (const obsolete of ["components/email-auth-form.tsx", "app/api/auth/email/route.ts", "app/auth/atnaujinti-slaptazodi/page.tsx", "app/api/meistras/login-email/route.ts"])
      expect(fs.existsSync(path.join(root, obsolete))).toBe(false);
  });
});
