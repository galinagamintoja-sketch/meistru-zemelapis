import { describe, expect, it } from "vitest";
import { importSchema, normalizeFacebookPostUrl, validatePostedAt } from "../lib/public-jobs-import";
import { readFeedCursor, signFeedCursor } from "../lib/public-jobs-cursor";

const base = {
  schema_version: 1, source_platform: "facebook", source_url: "https://www.facebook.com/groups/123/posts/456/",
  source_visibility: "public", request_type: "work_request", title: "Vonios plytelių klojimas",
  summary: "Ieškomas meistras vonios sienų ir grindų plytelėms kloti Lentvaryje.",
  has_contact_number: true,
  trade_ids: ["c5ed13e2-734e-47c6-a4bb-0b993e0c7c7e"], area_ids: ["lentvaris"],
  posted_at: "2026-09-20T10:00:00+03:00"
};

describe("public jobs import contract", () => {
  it("accepts the narrow work-request shape and rejects extra source text/contact", () => {
    expect(importSchema.safeParse(base).success).toBe(true);
    expect(importSchema.safeParse({ ...base, has_contact_number: "yes" }).success).toBe(false);
    expect(importSchema.safeParse({ ...base, full_post: "copied original" }).success).toBe(false);
    expect(importSchema.safeParse({ ...base, summary: `${base.summary} +37061234567` }).success).toBe(false);
    expect(importSchema.safeParse({ ...base, area_ids: ["lentvaris", "lentvaris"] }).success).toBe(false);
    expect(importSchema.safeParse({ ...base, posted_at: "2026-02-30T10:00:00+02:00" }).success).toBe(false);
  });

  it("normalizes a post variant and rejects deceptive or non-post URLs", () => {
    expect(normalizeFacebookPostUrl("https://m.facebook.com/groups/123/permalink/456/?fbclid=x#top"))
      .toEqual({ source_url: "https://www.facebook.com/groups/123/posts/456/", source_identity: "facebook:group:123:456", url_post_id: "456" });
    expect(normalizeFacebookPostUrl("https://www.facebook.com/story.php?story_fbid=456&id=123&fbclid=x"))
      .toEqual(normalizeFacebookPostUrl("https://www.facebook.com/123/posts/456/"));
    expect(normalizeFacebookPostUrl("https://facebook.com.evil.test/groups/123/posts/456")).toBeNull();
    expect(normalizeFacebookPostUrl("https://www.facebook.com/groups/123")).toBeNull();
    expect(normalizeFacebookPostUrl("https://www.facebook.com/share/p/abc")).toBeNull();
    expect(normalizeFacebookPostUrl("http://www.facebook.com/groups/123/posts/456")).toBeNull();
  });

  it("calculates age from the original instant with an exclusive expiry boundary", () => {
    const now = Date.parse("2026-09-23T12:00:00Z");
    expect(validatePostedAt(new Date(now - 13 * 86_400_000).toISOString(), now)).toBe("ok");
    expect(validatePostedAt(new Date(now - 14 * 86_400_000).toISOString(), now)).toBe("too_old");
    expect(validatePostedAt(new Date(now - 15 * 86_400_000).toISOString(), now)).toBe("too_old");
    expect(validatePostedAt(new Date(now + 6 * 60_000).toISOString(), now)).toBe("future_date");
  });

  it("binds cursors to a signature", () => {
    const cursor = signFeedCursor({ snapshot: "2026-09-23T12:00:00Z", posted: "2026-09-22T12:00:00Z",
      id: "c5ed13e2-734e-47c6-a4bb-0b993e0c7c7e", filter: "||all" }, "test-secret");
    expect(readFeedCursor(cursor, "test-secret")?.filter).toBe("||all");
    expect(readFeedCursor(`${cursor}x`, "test-secret")).toBeNull();
  });
});
