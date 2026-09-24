import { z } from "zod";

export const JOB_MAX_AGE_DAYS = 14;
export const JOB_PAGE_SIZE = 6;
export const JOB_GUEST_REVEALS = 5;

const uuid = z.string().uuid();
const safeText = (max: number) => z.string().trim().min(1).max(max)
  .refine((value) => !/[<>]/u.test(value), "plain_text_required")
  .refine((value) => !/(?:https?:\/\/|www\.|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:\+?370|0)\s*6(?:[\s.-]*\d){7})/iu.test(value), "contact_or_link_not_allowed");

export const importSchema = z.object({
  schema_version: z.literal(1),
  source_platform: z.literal("facebook"),
  source_url: z.string().url().max(2048),
  source_post_id: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
  source_name: safeText(100).optional(),
  source_visibility: z.literal("public"),
  request_type: z.literal("work_request"),
  title: safeText(100).pipe(z.string().min(5)),
  summary: safeText(350).pipe(z.string().min(20)),
  has_contact_number: z.boolean(),
  trade_ids: z.array(uuid).min(1).max(6).refine((items) => new Set(items).size === items.length),
  area_ids: z.array(z.string().regex(/^[a-z0-9-]{2,80}$/)).min(1).max(6)
    .refine((items) => new Set(items).size === items.length),
  posted_at: z.string().datetime({ offset: true })
}).strict();

export type ImportPayload = z.infer<typeof importSchema>;

export type NormalizedSource = { source_url: string; source_identity: string; url_post_id: string };

/** Supports exact HTTPS post permalinks only; never performs a remote fetch or redirect. */
export function normalizeFacebookPostUrl(raw: string): NormalizedSource | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    !["facebook.com", "www.facebook.com", "m.facebook.com"].includes(url.hostname.toLowerCase())) return null;
  let path: string;
  try { path = decodeURIComponent(url.pathname).replace(/\/+$/u, ""); } catch { return null; }
  const group = /^\/groups\/([A-Za-z0-9._-]+)\/(?:permalink|posts)\/([0-9]+)$/u.exec(path);
  if (group) {
    const [, groupId, postId] = group;
    return {
      source_url: `https://www.facebook.com/groups/${groupId}/posts/${postId}/`,
      source_identity: `facebook:group:${groupId}:${postId}`,
      url_post_id: postId
    };
  }
  const page = /^\/([A-Za-z0-9._-]+)\/posts\/([0-9]+)$/u.exec(path);
  if (page) {
    const [, pageId, postId] = page;
    return {
      source_url: `https://www.facebook.com/${pageId}/posts/${postId}/`,
      source_identity: `facebook:page:${pageId}:${postId}`,
      url_post_id: postId
    };
  }
  if (path === "/story.php") {
    const postId = url.searchParams.get("story_fbid");
    const pageId = url.searchParams.get("id");
    if (postId && pageId && /^[0-9]+$/u.test(postId) && /^[0-9]+$/u.test(pageId)) {
      return {
        source_url: `https://www.facebook.com/${pageId}/posts/${postId}/`,
        source_identity: `facebook:page:${pageId}:${postId}`,
        url_post_id: postId
      };
    }
  }
  return null;
}

export function validatePostedAt(value: string, now = Date.now()): "ok" | "invalid_date" | "too_old" | "future_date" {
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return "invalid_date";
  if (date > now + 5 * 60_000) return "future_date";
  if (date + JOB_MAX_AGE_DAYS * 86_400_000 <= now) return "too_old";
  return "ok";
}

export function importFieldErrors(error: z.ZodError) {
  return error.issues.map((issue) => ({ field: issue.path.join(".") || "body",
    code: ["plain_text_required", "contact_or_link_not_allowed"].includes(issue.message) ? issue.message : issue.code }));
}
