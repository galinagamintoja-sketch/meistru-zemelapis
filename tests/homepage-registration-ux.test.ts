import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("homepage and dedicated registration UX", () => {
  it("uses the dedicated registration route everywhere in active application code", () => {
    const files = [
      "components/LocalProApp.tsx",
      "components/unlinked-account.tsx",
      "app/auth/callback/route.ts",
      "app/meistras/susieti/page.tsx"
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toContain("#register");
      expect(source).not.toContain("Tapti specialistu");
      expect(source).not.toContain("Registruotis nemokamai");
    }
    expect(read("components/LocalProApp.tsx")).toContain('href="/meistro-registracija">Meistro registracija</a>');
  });

  it("keeps registration off the homepage and redirects existing profile owners server-side", () => {
    const homepage = read("app/page.tsx");
    const registrationPage = read("app/meistro-registracija/page.tsx");
    expect(homepage).not.toContain("registrationOnly");
    expect(registrationPage).toContain("registrationOnly");
    expect(registrationPage).toContain('redirect("/meistras/uzklausos")');
    expect(registrationPage).toContain("getLinkedTradespersonProfile(user.id)");
  });

  it("shows server-resolved account actions and uses the secure logout endpoint", () => {
    const homepage = read("app/page.tsx");
    const app = read("components/LocalProApp.tsx");
    expect(homepage).toContain("createSupabaseAuthClient");
    expect(homepage).toContain("isAdminEmail(user?.email)");
    expect(app).toContain("Prisijungta kaip");
    expect(app).toContain('href="/meistras/uzklausos">Meistro paskyra');
    expect(app).toContain('href="/admin">Administravimas');
    expect(app).toContain('performHomepageLogout');
  });

  it("requires an explicit administrator choice and removes the old live preview", () => {
    const app = read("components/LocalProApp.tsx");
    expect(app).toContain("adminRegistrationAllowed");
    expect(app).toContain("Meistro profilis nebus sukurtas automatiškai");
    expect(app).not.toContain("Profilio peržiūra");
    expect(app).not.toContain("1. Užpildote formą");
    expect(app).not.toContain("2. Susiejame su paskyra");
    expect(app).not.toContain("4. Admin patvirtina tik nuotraukas");
  });
});
