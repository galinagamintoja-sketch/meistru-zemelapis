import { describe, expect, it, vi } from "vitest";
import { processClaimedAccountDeletion } from "../lib/account-deletion";

const claim = {
  request_id: "10000000-0000-4000-8000-000000000001",
  auth_user_id: "20000000-0000-4000-8000-000000000002",
  tradesperson_profile_id: "30000000-0000-4000-8000-000000000003",
  claim_token: "40000000-0000-4000-8000-000000000004",
  attempt_count: 1
};

describe("reusable account deletion service", () => {
  it("removes only the owned profile prefix, then database, Auth and completion", async () => {
    const order: string[] = [];
    let objects = [{ id: "object-1", name: "approved.webp" }, { id: "object-2", name: "pending.webp" }];
    const list = vi.fn(async (prefix: string) => {
      expect(prefix).toBe(claim.tradesperson_profile_id);
      return { data: objects, error: null };
    });
    const remove = vi.fn(async (paths: string[]) => {
      order.push("storage");
      expect(paths).toEqual([
        `${claim.tradesperson_profile_id}/approved.webp`,
        `${claim.tradesperson_profile_id}/pending.webp`
      ]);
      objects = [];
      return { data: [], error: null };
    });
    const rpc = vi.fn(async (name: string) => {
      order.push(name);
      if (name === "delete_account_application_data") return { data: [{ auth_user_id: claim.auth_user_id }], error: null };
      if (name === "complete_account_deletion") return { data: true, error: null };
      return { data: true, error: null };
    });
    const deleteUser = vi.fn(async () => { order.push("auth"); return { data: null, error: null }; });
    const supabase = { storage: { from: () => ({ list, remove }) }, rpc, auth: { admin: { deleteUser } } };

    await expect(processClaimedAccountDeletion(supabase as never, claim)).resolves.toEqual({ ok: true, storageObjectsRemoved: 2 });
    expect(order).toEqual(["storage", "delete_account_application_data", "auth", "complete_account_deletion"]);
    expect(deleteUser).toHaveBeenCalledWith(claim.auth_user_id);
  });

  it("treats already-missing Storage objects and Auth users as retry-safe", async () => {
    const rpc = vi.fn(async (name: string) => name === "delete_account_application_data"
      ? { data: [{ auth_user_id: claim.auth_user_id }], error: null }
      : { data: true, error: null });
    const supabase = {
      storage: { from: () => ({ list: async () => ({ data: [], error: null }), remove: vi.fn() }) },
      rpc,
      auth: { admin: { deleteUser: async () => ({ data: null, error: { message: "User not found" } }) } }
    };
    await expect(processClaimedAccountDeletion(supabase as never, claim)).resolves.toEqual({ ok: true, storageObjectsRemoved: 0 });
  });

  it("records only a safe retry state after partial failure", async () => {
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === "fail_account_deletion") {
        expect(args.p_safe_error).toBe("storage_delete_failed");
        return { data: true, error: null };
      }
      throw new Error("database must not run");
    });
    const supabase = {
      storage: { from: () => ({
        list: async () => ({ data: [{ id: "object-1", name: "photo.webp" }], error: null }),
        remove: async () => ({ data: null, error: { message: "provider details must not be persisted" } })
      }) },
      rpc,
      auth: { admin: { deleteUser: vi.fn() } }
    };
    await expect(processClaimedAccountDeletion(supabase as never, claim)).resolves.toEqual({ ok: false, error: "storage_delete_failed", storageObjectsRemoved: 0 });
    expect(rpc).toHaveBeenCalledWith("fail_account_deletion", expect.objectContaining({ p_safe_error: "storage_delete_failed" }));
  });
});
