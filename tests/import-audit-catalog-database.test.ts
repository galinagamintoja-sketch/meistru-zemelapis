import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { expect, it, vi } from "vitest";

const catalog = readFileSync("supabase/migrations/034_import_audit_service_catalog.sql", "utf8");
const correction = readFileSync("supabase/migrations/035_correct_siauliai_icf_service.sql", "utf8");

it("adds DB-generated services, corrects only the ICF association and preserves duplicate protection", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table service_categories(id uuid primary key default gen_random_uuid(), name text not null, slug text unique not null, sort_order integer default 100, is_active boolean default true);
      create table service_subcategories(id uuid primary key default gen_random_uuid(), service_category_id uuid references service_categories(id), name text not null, slug text unique not null, sort_order integer default 100, is_active boolean default true);
      create table service_category_assignments(service_category_id uuid references service_categories(id), service_subcategory_id uuid references service_subcategories(id), primary key(service_category_id,service_subcategory_id));`);
    await db.exec(readFileSync("supabase/migrations/015_localpro_service_taxonomy.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/031_public_jobs.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/032_public_jobs_contact_filter.sql", "utf8"));
    const beforeServices = (await db.query("select * from service_subcategories order by id")).rows;
    const serviceId = async (slug: string) => (await db.query<{ id: string }>("select id from service_subcategories where slug=$1", [slug])).rows[0].id;
    const wrong = await serviceId("karkasiniu-namu-statyba");
    const correct = await serviceId("individualiu-namu-statyba");
    const unrelated = await serviceId("betonavimas");
    const payload = {
      source_url: "https://www.facebook.com/groups/123/posts/2145257802786153/",
      source_identity: "facebook:group:123:2145257802786153", source_post_id: "2145257802786153",
      title: "ICF namo statyba Šiauliuose", summary: "Ieškau ICF namo statybos meistrų Šiauliuose pagal turimą projektą.",
      posted_at: new Date(Date.now() - 86_400_000).toISOString(), has_contact_number: true,
      trade_ids: [wrong, unrelated], area_ids: ["siauliai"]
    };
    const importJob = async (data: object) => (await db.query<{ result: { outcome: string; job_id: string } }>(
      "select import_public_job($1::jsonb,$2,$3) result", [JSON.stringify(data), "audit-test", randomUUID()])).rows[0].result;
    const first = await importJob(payload);
    expect(first.outcome).toBe("accepted");
    const other = await importJob({ ...payload, source_url: "https://www.facebook.com/groups/123/posts/789/", source_identity: "facebook:group:123:789", source_post_id: "789" });
    const beforeJobs = (await db.query("select * from public_jobs order by id")).rows;
    const beforeAudit = (await db.query("select * from public_job_import_audit order by id")).rows;
    await db.exec(catalog);
    await db.exec(correction);
    const additions = (await db.query<{ id: string; slug: string; is_active: boolean; category: string }>(
      `select s.id,s.slug,s.is_active,c.slug category from service_subcategories s join service_categories c on c.id=s.service_category_id
       where s.slug in ('dekoratyvinis-tinkavimas','pamatu-siltinimas','statybiniu-medziagu-pristatymas-ir-uznesimas') order by s.slug`)).rows;
    expect(additions).toHaveLength(3);
    expect(additions.map((s) => s.category)).toEqual(["vidaus-apdaila", "fasadai-ir-siltinimas", "statyba-ir-konstrukcijos"]);
    for (const service of additions) {
      expect(service.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(service.is_active).toBe(true);
      expect((await db.query("select * from service_category_assignments where service_subcategory_id=$1", [service.id])).rows).toHaveLength(1);
    }
    expect((await db.query("select * from service_subcategories where slug not in ('dekoratyvinis-tinkavimas','pamatu-siltinimas','statybiniu-medziagu-pristatymas-ir-uznesimas') order by id")).rows).toEqual(beforeServices);
    expect((await db.query("select * from public_jobs order by id")).rows).toEqual(beforeJobs);
    expect((await db.query("select * from public_job_import_audit order by id")).rows).toEqual(beforeAudit);
    const tradesFor = async (job: string) => (await db.query<{ trade_id: string }>("select trade_id from public_job_trades where job_id=$1 order by trade_id", [job])).rows.map((row) => row.trade_id);
    expect(await tradesFor(first.job_id)).toEqual([correct, unrelated].sort());
    expect(await tradesFor(other.job_id)).toEqual([wrong, unrelated].sort());
    await db.exec(catalog); await db.exec(correction);
    expect(await tradesFor(first.job_id)).toEqual([correct, unrelated].sort());
    expect((await db.query("select * from public_jobs order by id")).rows).toEqual(beforeJobs);
    expect(await importJob(payload)).toEqual({ outcome: "duplicate", job_id: first.job_id });
    expect(await tradesFor(first.job_id)).toEqual([correct, unrelated].sort());
    for (const service of additions) {
      const newJob = await importJob({ ...payload, source_post_id: service.id, source_url: `https://www.facebook.com/groups/123/posts/${service.id.replaceAll("-", "")}/`, source_identity: `test:${service.id}`, trade_ids: [service.id] });
      expect(newJob.outcome).toBe("accepted");
      const filtered = await db.query<{ id: string }>("select id from list_public_jobs($1,$2,null,null,null,now(),7,false)", [service.id, "siauliai"]);
      expect(filtered.rows.map((row) => row.id)).toEqual([newJob.job_id]);
    }
    // Exercise the real protected taxonomy handler using rows from the executed DB.
    vi.doMock("../lib/supabase", () => ({ createServerSupabase: () => ({ from: (table: string) => {
      const builder = {
        select: () => builder, eq: () => builder,
        order: async () => ({ error: null, data: table === "job_areas"
          ? (await db.query("select id,name,kind from job_areas where is_active order by name")).rows
          : (await db.query(`select s.id,s.name,s.slug,jsonb_build_object('id',c.id,'name',c.name,'slug',c.slug) category
              from service_subcategories s join service_categories c on c.id=s.service_category_id where s.is_active order by s.name`)).rows })
      }; return builder;
    } }) }));
    process.env.LOCALPRO_JOBS_IMPORT_TOKEN = "test-audit-import-token-with-more-than-32-characters";
    const { GET } = await import("../app/api/private/jobs/import/taxonomy/route");
    const response = await GET(new Request("http://localhost/api/private/jobs/import/taxonomy", { headers: { Authorization: `Bearer ${process.env.LOCALPRO_JOBS_IMPORT_TOKEN}` } }));
    expect(response.status).toBe(200);
    const taxonomy = await response.json();
    for (const service of additions) expect(taxonomy.trades).toContainEqual(expect.objectContaining({ id: service.id, slug: service.slug }));
    expect((await GET(new Request("http://localhost/api/private/jobs/import/taxonomy"))).status).toBe(401);
  } finally {
    delete process.env.LOCALPRO_JOBS_IMPORT_TOKEN;
    vi.doUnmock("../lib/supabase");
    await db.close();
  }
}, 30_000);

it("safely skips an absent post in preview and rolls back a mismatched-city correction", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create table public_jobs(id uuid primary key, source_post_id text);
      create table public_job_areas(job_id uuid, area_id text);
      create table public_job_trades(job_id uuid, trade_id uuid);`);
    await db.exec(correction);
    await db.query("insert into public_jobs values ($1,'2145257802786153')", [randomUUID()]);
    await expect(db.exec(correction)).rejects.toThrow("existing Šiauliai area");
    await db.exec("rollback");
    expect((await db.query("select * from public_jobs")).rows).toHaveLength(1);
    expect((await db.query("select * from public_job_trades")).rows).toHaveLength(0);
  } finally { await db.close(); }
}, 30_000);
