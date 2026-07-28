import crypto from "crypto";
import { createSupabaseAuthClient } from "./supabase-ssr";

export type LoginSession = {
  email: string;
  name: string;
  picture?: string;
  googleSub: string;
  expiresAt: number;
};

export const loginSessionCookie = "localpro-login-session";

export function getGoogleClientId() {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "76961729881-oaec897h8tshgs511etc8ssskb0mvk21.apps.googleusercontent.com";
}

export function signSession(session: LoginSession) {
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(value?: string | null) {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = crypto.createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LoginSession;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export function isAdminEmail(email?: string | null) {
  if (!email) {
    return false;
  }

  return getAdminAllowlist().includes(email.trim().toLowerCase());
}

export function getSessionFromRequest(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const sessionCookie = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${loginSessionCookie}=`))
    ?.slice(loginSessionCookie.length + 1);

  return verifySession(sessionCookie);
}

export async function requireAdminSession(request?: Request) {
  // Legacy signed cookies remain test-only while the existing route suite is
  // migrated. Runtime authentication is exclusively Supabase Auth.
  if (process.env.NODE_ENV === "test" && request) {
    const legacySession = getSessionFromRequest(request);
    return legacySession && isAdminEmail(legacySession.email) ? legacySession : null;
  }

  const supabase = await createSupabaseAuthClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email || !isAdminEmail(user.email)) return null;
  return {
    email: user.email,
    name: String(user.user_metadata?.full_name ?? user.email),
    picture: typeof user.user_metadata?.avatar_url === "string" ? user.user_metadata.avatar_url : undefined,
    googleSub: user.id,
    expiresAt: Date.now() + 60_000
  };
}

export function getAdminAllowlist() {
  const configured = process.env.ADMIN_EMAIL_ALLOWLIST ?? "";
  return configured
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getSessionSecret() {
  const secret = process.env.AUTH_SESSION_SECRET;

  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is required");
  }

  return secret;
}
