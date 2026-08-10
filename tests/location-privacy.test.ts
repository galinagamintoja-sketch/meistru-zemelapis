import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { profileRowToSpecialist, toPublicSafeSpecialist, type ProfileRow } from "../lib/db-mappers";

const intendedBrowserColumns = [
  "id", "display_name", "company_name", "phone", "whatsapp_number", "email", "base_city",
  "radius_km", "service_category_id", "description", "service_area_label", "review_score",
  "review_count", "verification_labels", "public_status", "approval_status", "source",
  "public_latitude", "public_longitude"
];

const row = {
  id: "11111111-1111-4111-8111-111111111111", display_name: "Meistras", company_name: null,
  phone: "+37060000000", whatsapp_number: null, email: "m@example.lt", base_city: "Vilnius",
  radius_km: 30, latitude: 54.6872, longitude: 25.2797, public_latitude: 54.698,
  public_longitude: 25.295, description: null, review_score: null, review_count: null,
  verification_labels: [], public_status: "public", approval_status: "approved", source: "self-registration",
  service_area_label: null, public_contact_consent_at: "2026-01-01T00:00:00Z"
} satisfies ProfileRow;

describe("public location privacy", () => {
  it("uses stored public coordinates, not a profile-id calculation", () => {
    const specialist = profileRowToSpecialist(row);
    expect({ lat: specialist.lat, lng: specialist.lng }).toEqual({ lat: row.public_latitude, lng: row.public_longitude });
    expect({ lat: specialist.lat, lng: specialist.lng }).not.toEqual({ lat: row.latitude, lng: row.longitude });
  });

  it("removes exact coordinates from public payloads", () => {
    const publicProfile = toPublicSafeSpecialist(profileRowToSpecialist(row));
    expect(publicProfile).not.toHaveProperty("registeredLat");
    expect(publicProfile).not.toHaveProperty("registeredLng");
  });

  it("generates and stores random 1–2 km positions in the database", () => {
    const migration = readFileSync("supabase/migrations/027_public_locations_photo_monitoring_report_limits.sql", "utf8");
    expect(migration).toContain("distance_km := 1.0 + random()");
    expect(migration).toContain("add column if not exists public_latitude");
    expect(migration).toContain("revoke select on public.tradesperson_profiles");
    expect(migration).not.toContain("new.id");
  });

  it("grants browser roles only an explicit public profile column allowlist", () => {
    const migration = readFileSync("supabase/migrations/027_public_locations_photo_monitoring_report_limits.sql", "utf8");
    const grant = migration.match(/grant select \(([\s\S]*?)\)\s+on public\.tradesperson_profiles to anon, authenticated;/i);
    expect(grant, "explicit profile column grant should exist").not.toBeNull();
    const grantedColumns = grant![1].split(",").map((column) => column.trim()).filter(Boolean);
    expect(grantedColumns).toEqual(intendedBrowserColumns);
    for (const privateColumn of ["latitude", "longitude", "registered_address", "street_name", "postcode", "house_number_private", "google_place_id", "admin_notes", "hypothetical_future_internal_column"]) {
      expect(grantedColumns).not.toContain(privateColumn);
    }
    expect(migration).not.toContain("information_schema.columns");
    expect(migration).not.toContain("string_agg(quote_ident(column_name)");
  });

  it("keeps browser profile rows restricted to approved public profiles", () => {
    const migration = readFileSync("supabase/migrations/027_public_locations_photo_monitoring_report_limits.sql", "utf8");
    expect(migration).toContain('create policy "Browser can read approved public profiles"');
    expect(migration).toMatch(/approval_status\s*=\s*'approved'/);
    expect(migration).toMatch(/public_status\s*=\s*'public'/);
  });
});
