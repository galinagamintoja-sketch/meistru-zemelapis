import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("protects business evidence, revokes name changes and preserves profiles through the real migration", async () => {
  const db = new PGlite();
  const id = "a107ec60-6859-4f4b-abcd-8feca3947894";
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.tradesperson_profiles(id uuid primary key, company_name text, display_name text);
      insert into public.tradesperson_profiles values ('${id}', 'MB Tvirti namai', 'Rasa');`);
    const before = (await db.query("select * from tradesperson_profiles")).rows;
    const sql = readFileSync("supabase/migrations/036_verified_profile_business_identity.sql", "utf8");
    await db.exec(sql);
    await db.exec(sql); // safe to reapply; no proof or profile reconstruction
    expect((await db.query("select * from tradesperson_profiles")).rows).toEqual(before);
    expect((await db.query("select * from profile_business_verifications")).rows).toEqual([]);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await expect(db.query("select * from profile_business_verifications")).rejects.toThrow(/permission denied/);
      await expect(db.exec(`insert into profile_business_verifications(profile_id,verified_name,evidence_reference,verification_method,verified_by)
        values ('${id}','MB Tvirti namai','private-reviewed-record','registry_record','admin')`)).rejects.toThrow(/permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    await expect(db.exec(`insert into profile_business_verifications(profile_id,verified_name,evidence_reference,verification_method,verified_by)
      values ('${id}','MB Tvirti namai','private-reviewed-record','owner_claim','admin')`)).rejects.toThrow(/check constraint/);
    await db.exec(`insert into profile_business_verifications(profile_id,verified_name,evidence_reference,verification_method,verified_by)
      values ('${id}','MB Tvirti namai','private-reviewed-record','registry_record','verified-admin-identity')`);
    expect((await db.query<{ revoked_at: string | null }>("select revoked_at from profile_business_verifications")).rows[0].revoked_at).toBeNull();
    await db.exec("reset role");
    await db.exec("grant select, update(company_name,display_name) on tradesperson_profiles to authenticated; set role authenticated;");
    await db.exec(`update tradesperson_profiles set display_name='Rasa Statybininkė' where id='${id}'`);
    await db.exec("reset role");
    expect((await db.query<{ revoked_at: string | null }>("select revoked_at from profile_business_verifications")).rows[0].revoked_at).toBeNull();
    // The trigger can revoke evidence during an ordinary owner update without granting evidence access.
    await db.exec(`set role authenticated; update tradesperson_profiles set company_name='MB Changed' where id='${id}'; reset role;`);
    const revoked = (await db.query<{ revoked_at: string | null }>("select revoked_at from profile_business_verifications")).rows[0].revoked_at;
    expect(revoked).not.toBeNull();
    await db.exec(`update tradesperson_profiles set company_name='MB Tvirti namai' where id='${id}'`);
    expect((await db.query<{ revoked_at: string | null }>("select revoked_at from profile_business_verifications")).rows[0].revoked_at).toEqual(revoked);
    await db.exec(`delete from tradesperson_profiles where id='${id}'`);
    expect((await db.query("select * from profile_business_verifications")).rows).toEqual([]);
  } finally { await db.close(); }
}, 30000);
