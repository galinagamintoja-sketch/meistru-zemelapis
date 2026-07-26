import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tradespersonAreasUpdateSchema, tradespersonProfileUpdateSchema } from "../lib/tradesperson-profile-schema";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("tradesperson dashboard security", () => {
  it("protects the entire meistras route tree with server-verified Supabase users", () => {
    const proxy = read("proxy.ts");
    expect(proxy).toContain('matcher: ["/meistras/:path*"]');
    expect(proxy).toContain("supabase.auth.getUser()");
  });

  it("derives ownership from auth_user_id and never public email", () => {
    const account = read("lib/tradesperson-account.ts");
    expect(account).toContain('.eq("auth_user_id", authUserId)');
    expect(account).not.toContain('.eq("email"');
  });

  it("stores only hashed, expiring, single-use claim tokens", () => {
    const migration = read("supabase/migrations/012_tradesperson_auth_and_claims.sql");
    expect(migration).toContain("token_hash text not null unique");
    expect(migration).toContain("expires_at > now()");
    expect(migration).toContain("used_at is null");
    expect(migration).not.toMatch(/\btoken\s+text/);
  });

  it("keeps admin runtime authentication on Supabase Auth", () => {
    const auth = read("lib/auth-session.ts");
    expect(auth).toContain("supabase.auth.getUser()");
    expect(auth).toContain('process.env.NODE_ENV === "test"');
  });

  it("validates editable public fields and safe operating areas", () => {
    expect(tradespersonProfileUpdateSchema.safeParse({ displayName: "A", companyName: "", phone: "1", whatsappNumber: "", publicEmail: "bad", description: "short" }).success).toBe(false);
    expect(tradespersonAreasUpdateSchema.safeParse({ baseCity: "Vilnius", cities: ["Vilnius"], radiusKm: 30 }).success).toBe(true);
    expect(tradespersonAreasUpdateSchema.safeParse({ baseCity: "Vilnius", cities: ["Vilnius"], radiusKm: 999 }).success).toBe(false);
  });

  it("requires moderation only for gallery photos", () => {
    const photos = read("app/api/meistras/photos/route.ts");
    expect(photos).toContain('moderation_status: "pending"');
    expect(read("app/api/meistras/profile/route.ts")).not.toContain("moderation_status");
    expect(read("app/api/meistras/services/route.ts")).not.toContain("moderation_status");
    expect(read("app/api/meistras/areas/route.ts")).not.toContain("moderation_status");
  });

  it("uses only the five approved dashboard sections", () => {
    const shell = read("components/tradesperson-shell.tsx");
    for (const label of ["Užklausos", "Mano profilis", "Nuotraukos", "Paslaugos", "Paskyra"]) expect(shell).toContain(label);
    expect(shell).not.toContain("Apžvalga");
    expect(shell).not.toContain("Darbo zona");
    expect(read("app/meistras/page.tsx")).toContain('redirect("/meistras/uzklausos")');
  });

  it("keeps enquiry status per specialist and gates arbitrary request access", () => {
    const migration = read("supabase/migrations/013_tradesperson_request_inbox_and_profile_fields.sql");
    expect(migration).toContain("unique (enquiry_id, tradesperson_profile_id)");
    const detail = read("app/api/meistras/requests/[id]/route.ts");
    expect(detail).toContain("job.tradesperson_profile_id !== profile.id && !evaluation");
    expect(detail).not.toContain("source_address");
  });
});
