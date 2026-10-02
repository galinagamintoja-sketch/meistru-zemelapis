import { createHash, timingSafeEqual } from "node:crypto";

export function validJobsImportBearer(request: Request) {
  const expected = process.env.LOCALPRO_JOBS_IMPORT_TOKEN;
  const supplied = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
  if (!expected || !supplied) return false;
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
