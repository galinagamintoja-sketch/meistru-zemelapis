import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/024_atomic_profile_visibility.sql"), "utf8");

describe("atomic profile visibility migration", () => {
  it("keeps the visibility update and audit insert in one database transaction", () => {
    expect(migration).toContain("update tradesperson_profiles");
    expect(migration).toContain("insert into admin_actions");
    expect(migration).toContain("for update");
  });

  it("is service-role-only and has an explicit safe search path", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_temp");
    expect(migration).toContain("revoke all on function set_owned_profile_visibility(uuid, boolean) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function set_owned_profile_visibility(uuid, boolean) to service_role");
  });

  it("is idempotent and refuses to publish an unapproved profile", () => {
    expect(migration).toContain("current_profile.public_status = target_status");
    expect(migration).toContain("return query select target_status::text, false");
    expect(migration).toContain("current_profile.approval_status <> 'approved'");
  });
});
