import crypto from "node:crypto";
import { requireAdminSession } from "../auth-session";

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function requireMarketingImportAccess(request: Request) {
  const admin = await requireAdminSession(request);
  if (admin) return { actor: `admin:${admin.email}`, kind: "admin" as const };
  const configured = process.env.MARKETING_IMPORT_API_KEY;
  const supplied = request.headers.get("x-localpro-import-key");
  if (configured && supplied && safeEqual(configured, supplied)) {
    return { actor: "collection-agent", kind: "import_agent" as const };
  }
  return null;
}
