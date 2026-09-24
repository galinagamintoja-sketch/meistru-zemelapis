import { createHmac, timingSafeEqual } from "node:crypto";

export type FeedCursor = {
  snapshot: string;
  posted: string;
  id: string;
  filter: string;
};

export function signFeedCursor(value: FeedCursor, secret: string) {
  const body = Buffer.from(JSON.stringify(value)).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readFeedCursor(value: string, secret: string): FeedCursor | null {
  const [body, mac, extra] = value.split(".");
  if (!body || !mac || extra || body.length > 1000) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof parsed.snapshot !== "string" || typeof parsed.posted !== "string" ||
      typeof parsed.id !== "string" || typeof parsed.filter !== "string" ||
      !Number.isFinite(Date.parse(parsed.snapshot)) || !Number.isFinite(Date.parse(parsed.posted)) ||
      !/^[0-9a-f-]{36}$/i.test(parsed.id)) return null;
    return parsed;
  } catch { return null; }
}
