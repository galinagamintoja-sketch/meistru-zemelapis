import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isSameOrigin, loginEmailMatches } from "../lib/account-deletion";

const root = process.cwd();
const migration = readFileSync(resolve(root, "supabase/migrations/025_automatic_account_deletion.sql"), "utf8");
const ownerRoute = readFileSync(resolve(root, "app/api/meistras/account-requests/route.ts"), "utf8");
const workerRoute = readFileSync(resolve(root, "app/api/internal/account-deletions/run/route.ts"), "utf8");
const service = readFileSync(resolve(root, "lib/account-deletion.ts"), "utf8");

describe("automatic account deletion security and lifecycle", () => {
  it("matches the confirmation email case-insensitively after trimming", () => {
    expect(loginEmailMatches({ email: "Owner@Example.lt" } as never, "  owner@example.LT ")).toBe(true);
    expect(loginEmailMatches({ email: "owner@example.lt" } as never, "other@example.lt")).toBe(false);
  });

  it("rejects cross-origin owner mutations", () => {
    expect(isSameOrigin(new Request("https://localpro.lt/api/meistras/account-requests", { headers: { origin: "https://evil.example" } }))).toBe(false);
    expect(isSameOrigin(new Request("https://localpro.lt/api/meistras/account-requests", { headers: { origin: "https://localpro.lt" } }))).toBe(true);
  });

  it("uses one atomic scheduling operation and preserves the original active request", () => {
    expect(ownerRoute).toContain('supabase.rpc("schedule_account_deletion"');
    expect(migration).toContain("statement_timestamp() + interval '7 days'");
    expect(migration).toContain("existing_request_reused");
    expect(migration).toMatch(/if active_request\.id is not null[\s\S]*return query[\s\S]*return;/i);
    expect(migration).toMatch(/insert into public\.account_privacy_requests[\s\S]*update public\.tradesperson_profiles[\s\S]*public_status = 'private'/i);
  });

  it("allows only one active deletion and indexes due work", () => {
    expect(migration).toMatch(/create unique index[\s\S]*where request_type = 'account_deletion'[\s\S]*status in \('pending', 'processing', 'failed'\)/i);
    expect(migration).toContain("account_privacy_requests_due_deletions");
  });

  it("locks all SECURITY DEFINER functions to service role and a fixed search path", () => {
    const definerCount = (migration.match(/security definer/gi) ?? []).length;
    const safePaths = (migration.match(/set search_path = pg_catalog, public, pg_temp/gi) ?? []).length;
    expect(definerCount).toBe(6);
    expect(safePaths).toBe(definerCount);
    for (const signature of [
      "schedule_account_deletion(uuid)", "cancel_account_deletion(uuid, boolean)",
      "claim_due_account_deletions(integer, uuid, integer)", "delete_account_application_data(uuid, uuid)",
      "fail_account_deletion(uuid, uuid, text)", "complete_account_deletion(uuid, uuid)"
    ]) expect(migration).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
  });

  it("claims due work concurrently and recovers expired leases", () => {
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("worker_lease_expired");
    expect(migration).toContain("lease_expires_at < statement_timestamp()");
    expect(migration).toMatch(/status in \('pending', 'failed'\)[\s\S]*scheduled_deletion_at <= statement_timestamp\(\)/i);
  });

  it("cannot process cancelled requests or cancel processing requests", () => {
    expect(migration).toMatch(/status in \('pending', 'failed'\)/i);
    expect(migration).toContain("deletion_already_processing");
    expect(migration).not.toMatch(/status in \([^)]*cancelled[^)]*\)[\s\S]{0,200}for update skip locked/i);
  });

  it("deletes storage before application data and Auth, then minimises completion", () => {
    const storage = service.indexOf("removeOwnedProfileStorage");
    const database = service.indexOf('supabase.rpc("delete_account_application_data"');
    const auth = service.indexOf("supabase.auth.admin.deleteUser");
    const complete = service.indexOf('supabase.rpc("complete_account_deletion"');
    expect(storage).toBeLessThan(database);
    expect(database).toBeLessThan(auth);
    expect(auth).toBeLessThan(complete);
    expect(migration).toMatch(/status = 'completed'[\s\S]*auth_user_id = null[\s\S]*tradesperson_profile_id = null/i);
  });

  it("protects the worker with a server-only secret and returns aggregate counts", () => {
    expect(workerRoute).toContain("process.env.CRON_SECRET");
    expect(workerRoute).toContain("Bearer ${secret}");
    expect(workerRoute).not.toMatch(/NEXT_PUBLIC_.*SECRET/);
    expect(service).toContain("claimed: claims.length");
  });
});
