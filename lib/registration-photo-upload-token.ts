import { createHmac, timingSafeEqual } from "node:crypto";

export type RegistrationPhotoUploadClaims = {
  profileId: string;
  storagePath: string;
  name: string;
  type: "image/jpeg" | "image/png" | "image/webp";
  size: number;
  expiresAt: number;
};

function signingSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Photo upload signing is unavailable.");
  return secret;
}

export function createRegistrationPhotoUploadToken(claims: RegistrationPhotoUploadClaims) {
  const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
  const signature = createHmac("sha256", signingSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyRegistrationPhotoUploadToken(token: string): RegistrationPhotoUploadClaims | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", signingSecret()).update(payload).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as RegistrationPhotoUploadClaims;
    if (!claims.profileId || !claims.storagePath || claims.expiresAt < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}
