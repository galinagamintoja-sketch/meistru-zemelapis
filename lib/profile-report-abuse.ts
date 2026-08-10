import crypto from "node:crypto";

function secret() {
  return process.env.PROFILE_REPORT_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "local-test-only";
}

export function trustedClientIp(request: Request) {
  if (process.env.VERCEL) {
    return request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "vercel-unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "local-unknown";
}

function keyedHash(value: string) {
  return crypto.createHmac("sha256", secret()).update(value).digest("hex");
}

export function profileReportAbuseKeys(request: Request, report: { profileId: string; reason: string; details: string }) {
  const sourceHash = keyedHash(`ip:${trustedClientIp(request)}`);
  const normalizedDetails = report.details.trim().toLocaleLowerCase("lt-LT").replace(/\s+/g, " ");
  return {
    sourceHash,
    fingerprint: keyedHash(`report:${sourceHash}:${report.profileId}:${report.reason}:${normalizedDetails}`)
  };
}
