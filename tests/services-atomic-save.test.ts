import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("atomic Services and Area save", () => {
  it("uses one authenticated endpoint and one database RPC", () => {
    const route = read("app/api/meistras/services-and-area/route.ts");
    expect(route).toContain("requireOwnedProfile");
    expect(route).toContain("accountMutationBlocked");
    expect(route).toContain("tradespersonServicesAndAreaUpdateSchema.safeParse");
    expect(route).toContain('rpc("replace_tradesperson_services_and_area"');
    expect(route).toContain('error.code === "22023"');
  });

  it("keeps category, service and area validation inside the transaction", () => {
    const migration = read("supabase/migrations/029_atomic_services_and_area.sql");
    expect(migration).toContain("Invalid work area selection");
    expect(migration).toContain("Invalid service selection");
    expect(migration).toContain("Service outside selected work areas");
    expect(migration).toContain("Invalid base city");
    expect(migration).toContain("Invalid registered address");
    expect(migration).toContain("Invalid coordinates");
    expect(migration).toContain("Invalid radius");
    expect(migration).toContain("array[5,10,20,25,30,50,75,100,150]");
    const firstWrite = migration.indexOf("delete from profile_category_assignments");
    for (const validationError of [
      "Invalid work area selection", "Invalid service selection", "Service outside selected work areas",
      "Invalid base city", "Invalid registered address", "Invalid coordinates", "Invalid radius"
    ]) expect(firstWrite).toBeGreaterThan(migration.indexOf(validationError));
  });

  it("performs both replacements in one Postgres function and exposes it only to service_role", () => {
    const migration = read("supabase/migrations/029_atomic_services_and_area.sql");
    expect(migration).toContain("delete from profile_category_assignments");
    expect(migration).toContain("delete from profile_services");
    expect(migration).toContain("update tradesperson_profiles");
    expect(migration).toContain("delete from operating_areas");
    expect(migration).toContain("grant execute on function replace_tradesperson_services_and_area");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("revoke all on function replace_tradesperson_services_and_area");
    expect(migration).toContain("language plpgsql");
  });
});
