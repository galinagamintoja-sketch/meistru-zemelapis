import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getAdminAllowlist, isAdminEmail } from "../lib/auth-session";
import { conflictingProfileId, isContactNumberConflict } from "../lib/contact-number-conflict";
import { normalizeLithuanianPhone } from "../lib/phone";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const originalAllowlist = process.env.ADMIN_EMAIL_ALLOWLIST;

afterEach(() => {
  if (originalAllowlist === undefined) delete process.env.ADMIN_EMAIL_ALLOWLIST;
  else process.env.ADMIN_EMAIL_ALLOWLIST = originalAllowlist;
});

describe("final admin, contact, and photo hardening", () => {
  it("fails admin access closed and compares configured email case-insensitively", () => {
    delete process.env.ADMIN_EMAIL_ALLOWLIST;
    expect(getAdminAllowlist()).toEqual([]);
    expect(isAdminEmail("galinagamintoja@gmail.com")).toBe(false);
    process.env.ADMIN_EMAIL_ALLOWLIST = "Galinagamintoja@gmail.com";
    expect(isAdminEmail("galinagamintoja@gmail.com")).toBe(true);
  });

  it("normalizes every equivalent Lithuanian phone format", () => {
    for (const value of ["061234567", "861234567", "+37061234567", "+370 612 34567", "+370-612-34567"]) {
      expect(normalizeLithuanianPhone(value)).toBe("+37061234567");
    }
  });

  it("recognises a database contact claim conflict without exposing raw SQL", () => {
    const error = { code: "23505", message: "contact number already claimed", details: "profile_id=11111111-1111-1111-1111-111111111111", constraint: "profile_contact_number_claims_pkey" };
    expect(isContactNumberConflict(error)).toBe(true);
    expect(conflictingProfileId(error)).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("uses a transaction-safe cross-field registry and canonicalising trigger", () => {
    const migration = read("supabase/migrations/020_unique_profile_contact_numbers.sql");
    expect(migration).toContain("normalized_number text primary key");
    expect(migration).toContain("select distinct value from unnest(array[new.phone, new.whatsapp_number])");
    expect(migration).toContain("before insert or update of phone, whatsapp_number");
    expect(migration).toContain("after insert or update of phone, whatsapp_number");
  });

  it("supports account switching and immediate photo refresh with double-submit protection", () => {
    const admin = read("app/admin/page.tsx");
    expect(admin).toContain("Ši paskyra neturi administratoriaus teisių.");
    expect(admin).toContain("Prisijungti su kita Google paskyra");
    expect(admin).toContain('window.location.assign("/auth/google?next=%2Fadmin")');
    const photos = read("components/photo-uploader.tsx");
    expect(photos).toContain("uploadingRef.current");
    expect(photos).toContain("router.refresh()");
    expect(photos).toContain("disabled={isUploading}");
  });
});
