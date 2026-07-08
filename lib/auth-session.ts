import crypto from "crypto";

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

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET ?? process.env.ADMIN_TOKEN ?? getGoogleClientId();
}
