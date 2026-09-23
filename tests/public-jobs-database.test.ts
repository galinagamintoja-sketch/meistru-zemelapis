import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

it("migrates jobs and keeps imports, expiry, moderation and guest allowance consistent", async () => {
  const db = new PGlite();
  const trade = "c5ed13e2-734e-47c6-a4bb-0b993e0c7c7e";
  const secondTrade = "c5ed13e2-734e-47c6-a4bb-0b993e0c7c7f";
  const requestId = "f7066aa2-255c-40be-aedf-8b089162af89";
  try {
    await db.exec("create role anon; create role authenticated; create role service_role; create table service_subcategories(id uuid primary key, name text not null, is_active boolean not null default true)");
    await db.exec(readFileSync("supabase/migrations/031_public_jobs.sql", "utf8"));
    const privileges = await db.query<{ anon_jobs: boolean; user_audit: boolean; anon_feed_rpc: boolean }>(
      "select has_table_privilege('anon','public.public_jobs','select') as anon_jobs, has_table_privilege('authenticated','public.public_job_import_audit','select') as user_audit, has_function_privilege('anon','public.list_public_jobs(uuid,text,timestamptz,timestamptz,uuid,timestamptz,integer)','execute') as anon_feed_rpc");
    expect(privileges.rows[0]).toEqual({ anon_jobs: false, user_audit: false, anon_feed_rpc: false });
    await db.query("insert into service_subcategories(id,name) values ($1,$2)", [trade, "Plytelių klojimas"]);
    await db.query("insert into service_subcategories(id,name) values ($1,$2)", [secondTrade, "Santechnikos remontas"]);
    const payload = {
      source_url: "https://www.facebook.com/groups/123/posts/456/", source_identity: "facebook:group:123:456",
      title: "Vonios plytelių klojimas", summary: "Ieškomas meistras vonios sienų ir grindų plytelėms kloti Lentvaryje.",
      posted_at: new Date(Date.now() - 13 * 86_400_000).toISOString(), trade_ids: [trade, secondTrade], area_ids: ["lentvaris"]
    };
    const importJob = async () => (await db.query<{ result: { outcome: string; job_id?: string } }>(
      "select import_public_job($1::jsonb,$2,$3) as result", [JSON.stringify(payload), "collector-v1", requestId])).rows[0].result;
    const first = await importJob();
    const duplicate = await importJob();
    expect(first.outcome).toBe("accepted");
    expect(duplicate).toEqual({ outcome: "duplicate", job_id: first.job_id });
    const stats = await db.query<{ result: { imports_today: number; duplicates_today: number } }>(
      "select public_job_daily_import_stats() as result");
    expect(stats.rows[0].result.imports_today).toBe(1);
    expect(stats.rows[0].result.duplicates_today).toBe(1);
    const stored = await db.query<{ posted_at: Date; expires_at: Date }>("select posted_at,expires_at from public_jobs");
    expect(stored.rows).toHaveLength(1);
    expect(+stored.rows[0].expires_at - +stored.rows[0].posted_at).toBe(14 * 86_400_000);
    const list = (filterTrade: string | null, filterArea: string | null) => db.query(
      "select * from list_public_jobs($1,$2,$3,$4,$5,$6,$7)",
      [filterTrade, filterArea, null, null, null, new Date().toISOString(), 7]);
    expect((await list(trade, "lentvaris")).rows).toHaveLength(1);
    expect((await list(secondTrade, "lentvaris")).rows).toHaveLength(1);
    expect((await list(trade, "vilnius")).rows).toHaveLength(0);
    expect((await db.query<{ changed: boolean }>("select moderate_public_job($1,$2,$3) as changed",
      [first.job_id, "admin@example.test", "hidden"])).rows[0].changed).toBe(true);
    expect((await list(null, null)).rows).toHaveLength(0);
    expect((await importJob()).outcome).toBe("duplicate");
    expect((await db.query<{ status: string }>("select status from public_jobs")).rows[0].status).toBe("hidden");

    const guest = "28c43516-2af5-4f84-a527-a4cb969c8090";
    await db.query("insert into public_job_guest_sessions(id,expires_at) values($1, now() + interval '1 day')", [guest]);
    const reveal = async (index: number, key: string) => (await db.query<{ permitted: boolean }>(
      "select consume_public_job_reveal($1,$2,$3) as permitted",
      [guest, `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, key])).rows[0].permitted;
    expect(await reveal(1, "cursor-1")).toBe(true);
    expect(await reveal(1, "cursor-1")).toBe(true);
    expect(await reveal(1, "different-cursor")).toBe(false);
    for (let index = 2; index <= 5; index++) expect(await reveal(index, `cursor-${index}`)).toBe(true);
    expect(await reveal(6, "cursor-6")).toBe(false);
    for (let index = 0; index < 30; index++) expect((await db.query<{ permitted: boolean }>(
      "select reserve_public_job_import($1) as permitted", ["collector-v1"])).rows[0].permitted).toBe(true);
    expect((await db.query<{ permitted: boolean }>("select reserve_public_job_import($1) as permitted",
      ["collector-v1"])).rows[0].permitted).toBe(false);
    await db.query("select cleanup_public_jobs()");
  } finally { await db.close(); }
});
