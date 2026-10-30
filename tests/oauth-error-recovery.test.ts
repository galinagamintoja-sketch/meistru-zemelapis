import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ start: vi.fn(), exchange: vi.fn(), user: vi.fn() }));
vi.mock("../lib/supabase-ssr", () => ({ createSupabaseAuthClient: async () => ({ auth: { signInWithOAuth: auth.start, exchangeCodeForSession: auth.exchange, getUser: auth.user } }) }));
import { GET as start } from "../app/auth/google/route";
import { GET as callback } from "../app/auth/callback/route";

beforeEach(() => {
  vi.clearAllMocks();
  auth.start.mockResolvedValue({ data: { url: null }, error: { message: "PRIVATE_PROVIDER_DETAIL" } });
  auth.exchange.mockResolvedValue({ error: { message: "PRIVATE_PROVIDER_DETAIL" } });
  auth.user.mockResolvedValue({ data: { user: null }, error: null });
});

function request(code: boolean, next = "/darbu-skelbimai?period=7d") {
  const url = new URL("https://localpro.lt/auth/callback");
  if (code) url.searchParams.set("code", "PRIVATE_AUTH_CODE");
  url.searchParams.set("next", next);
  return new Request(url);
}
function destination(response: Response) {
  const raw = response.headers.get("location")!;
  expect(raw).not.toContain("PRIVATE");
  return new URL(raw);
}

describe("OAuth error recovery retains the safe archive journey", () => {
  it("preserves archive filters when OAuth start fails", async () => {
    const response = await start(request(false)); const url = destination(response);
    expect(url.pathname).toBe("/login"); expect(url.searchParams.get("error")).toBe("oauth_start");
    expect(url.searchParams.get("next")).toBe("/darbu-skelbimai?period=7d");
  });
  it.each([false, true])("preserves the intended page on a failed callback (code=%s)", async (code) => {
    const url = destination(await callback(request(code)));
    expect(url.pathname).toBe("/login"); expect(url.searchParams.get("error")).toBe("oauth_callback");
    expect(url.searchParams.get("next")).toBe("/darbu-skelbimai?period=7d");
  });
  it("also preserves next after a failed authenticated-user lookup", async () => {
    auth.exchange.mockResolvedValue({ error: null });
    const url = destination(await callback(request(true)));
    expect(url.searchParams.get("next")).toBe("/darbu-skelbimai?period=7d");
  });
  it("never turns error recovery into an external redirect or echoes unknown query data", async () => {
    const url = destination(await callback(request(false, "https://evil.invalid/PRIVATE")));
    expect(url.origin).toBe("https://localpro.lt"); expect(url.searchParams.get("next")).toBe("/meistras");
    expect([...url.searchParams.keys()].sort()).toEqual(["error", "next"]);
  });
});
