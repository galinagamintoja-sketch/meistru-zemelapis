import crypto from "crypto";

export function signedCookie(email: string) {
  const session = {
    email,
    name: email,
    googleSub: "test-google-sub",
    expiresAt: Date.now() + 60_000
  };
  const payload = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.AUTH_SESSION_SECRET ?? "").update(payload).digest("base64url");
  return `localpro-login-session=${payload}.${signature}`;
}

export function adminPatchRequest(body: Record<string, unknown>, email = "admin@example.lt") {
  return new Request("http://localhost/api/admin/profiles", {
    method: "PATCH",
    headers: {
      cookie: signedCookie(email),
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

export function registrationPostRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/tradesperson/register", {
    method: "POST",
    body: JSON.stringify(body)
  });
}
