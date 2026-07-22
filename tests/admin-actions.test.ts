import { afterEach, describe, expect, it, vi } from "vitest";
import { adminActionErrorMessage, adminJsonRequest } from "../app/admin/page";

describe("admin action requests", () => {
  afterEach(() => vi.restoreAllMocks());

  it("handles non-JSON error responses without throwing during parsing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Upstream unavailable", { status: 502 })));
    const { response, data } = await adminJsonRequest("/api/admin/profiles");
    expect(response.status).toBe(502);
    expect(data.error).toBe("Upstream unavailable");
  });

  it("aborts a stalled request and reports a timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));

    await expect(adminJsonRequest("/api/admin/profiles", undefined, 5)).rejects.toMatchObject({ name: "AbortError" });
    expect(adminActionErrorMessage(new DOMException("Aborted", "AbortError"), "Tvirtinti nepavyko.")).toContain("12 sekundžių");
  });
});
