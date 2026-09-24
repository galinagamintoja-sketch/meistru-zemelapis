import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../../../lib/supabase";
import { importFieldErrors, importSchema, normalizeFacebookPostUrl, validatePostedAt } from "../../../../../lib/public-jobs-import";

export const runtime = "nodejs";

function response(body: Record<string, unknown>, status: number, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function validBearer(request: Request) {
  const expected = process.env.LOCALPRO_JOBS_IMPORT_TOKEN;
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
  if (!expected || !supplied) return false;
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!process.env.LOCALPRO_JOBS_IMPORT_TOKEN) return response({ outcome: "unavailable", reason_code: "import_disabled" }, 503);
  if (!validBearer(request)) return response({ outcome: "unauthorized", reason_code: "invalid_credential" }, 401);
  const db = createServerSupabase();
  if (!db) return response({ outcome: "unavailable", reason_code: "database_unavailable" }, 503);
  const importer = "collector-v1";
  const attemptId = randomUUID();
  const audit = async (outcome: "rejected" | "conflict" | "failed" | "rate_limited", reason_code: string, source_identity?: string) => {
    const { error } = await db.from("public_job_import_audit").insert({ attempt_id: attemptId, importer, outcome, reason_code,
      source_identity: source_identity ?? null });
    return !error;
  };
  const reject = async (reason: string, status = 422, fields?: Array<{ field: string; code: string }>) => {
    if (!await audit(status === 409 ? "conflict" : "rejected", reason))
      return response({ outcome: "failed", reason_code: "audit_unavailable" }, 503);
    return response({ outcome: status === 409 ? "conflict" : "rejected", reason_code: reason, ...(fields ? { fields } : {}) }, status);
  };
  const { data: permitted, error: rateError } = await db.rpc("reserve_public_job_import", { importer_name: importer });
  if (rateError) return response({ outcome: "unavailable", reason_code: "rate_check_failed" }, 503);
  if (!permitted) { if (!await audit("rate_limited", "rate_limited")) return response({ outcome: "failed", reason_code: "audit_unavailable" }, 503);
    return response({ outcome: "rate_limited", reason_code: "rate_limited" }, 429, { "Retry-After": "60" }); }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return reject("content_type_required", 415);
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > 8192) return reject("body_too_large", 413);
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > 8192) return reject("body_too_large", 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return reject("invalid_json", 400); }
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) return reject("invalid_fields", 422, importFieldErrors(parsed.error));
  const source = normalizeFacebookPostUrl(parsed.data.source_url);
  if (!source) return reject("unsupported_source_url", 422, [{ field: "source_url", code: "unsupported" }]);
  if (parsed.data.source_post_id && parsed.data.source_post_id !== source.url_post_id)
    return reject("source_id_url_mismatch", 409);
  const dateStatus = validatePostedAt(parsed.data.posted_at);
  if (dateStatus !== "ok") return reject(dateStatus, 422, [{ field: "posted_at", code: dateStatus }]);
  const { data, error } = await db.rpc("import_public_job", {
    payload: { ...parsed.data, ...source }, importer_name: importer, request_id: attemptId
  });
  if (error) { await audit("failed", "storage_error", source.source_identity);
    return response({ outcome: "failed", reason_code: "storage_error" }, 503); }
  const result = data as { outcome?: string; reason_code?: string; job_id?: string } | null;
  if (result?.outcome === "accepted") return response({ outcome: "accepted", job_id: result.job_id }, 201);
  if (result?.outcome === "duplicate") return response({ outcome: "duplicate", job_id: result.job_id }, 200);
  if (result?.outcome === "conflict") { if (!await audit("conflict", "source_identity_conflict", source.source_identity))
      return response({ outcome: "failed", reason_code: "audit_unavailable" }, 503);
    return response({ outcome: "conflict", reason_code: result.reason_code }, 409); }
  if (!await audit("rejected", result?.reason_code ?? "unsupported_taxonomy", source.source_identity))
    return response({ outcome: "failed", reason_code: "audit_unavailable" }, 503);
  return response({ outcome: "rejected", reason_code: result?.reason_code ?? "unsupported_taxonomy" }, 422);
}
