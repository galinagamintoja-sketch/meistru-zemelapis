import { beforeEach, describe, expect, it, vi } from "vitest";

const conversationId = "11111111-1111-4111-8111-111111111111";
const contactId = "22222222-2222-4222-8222-222222222222";

describe("marketing conversation linking API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("../lib/marketing/auth", () => ({
      requireMarketingAdminSession: async () => ({ email: "admin@example.test" })
    }));
  });

  it("validates identifiers before invoking the RPC", async () => {
    vi.doMock("../lib/marketing/supabase", () => ({
      createMarketingServerSupabase: () => ({ rpc: vi.fn() })
    }));
    const { POST } = await import("../app/api/admin/marketing/conversations/link/route");
    const response = await POST(new Request("http://localhost/api/admin/marketing/conversations/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId: "bad", contactId })
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_CONVERSATION_LINK" });
  });

  it("passes the explicit admin selection to the transactional RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { linked: true, needsReply: true }, error: null });
    vi.doMock("../lib/marketing/supabase", () => ({
      createMarketingServerSupabase: () => ({ rpc })
    }));
    const { POST } = await import("../app/api/admin/marketing/conversations/link/route");
    const response = await POST(new Request("http://localhost/api/admin/marketing/conversations/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, contactId })
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith("link_marketing_conversation_to_contact", {
      target_conversation_id: conversationId,
      target_contact_id: contactId,
      reviewer: "admin@example.test"
    });
  });

  it("maps database failures to a stable conflict response without leaking details", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "private database details", code: "P0001" }
    });
    vi.doMock("../lib/marketing/supabase", () => ({
      createMarketingServerSupabase: () => ({ rpc })
    }));
    const { POST } = await import("../app/api/admin/marketing/conversations/link/route");
    const response = await POST(new Request("http://localhost/api/admin/marketing/conversations/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId, contactId })
    }));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ code: "CONVERSATION_LINK_CONFLICT" });
    expect(JSON.stringify(body)).not.toContain("private database details");
  });
});
