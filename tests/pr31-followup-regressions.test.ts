import { describe, expect, it } from "vitest";
import { authEmailPayload } from "../components/email-auth-form";
import { legacyProfileSeoSlug, profileSeoSlug } from "../lib/seo";
import { resolveServicesCategoryIds } from "../lib/services-category-resolution";
import type { Specialist } from "../lib/types";

describe("PR 31 follow-up regressions", () => {
  it("keeps the pre-normalization profile slug as a resolvable alias", () => {
    const normalized = { id: "profile-1", name: "Linas R.", companyName: null, categorySlug: "apdaila", trade: "Vidaus apdaila", town: "Lentvaris" } as Specialist;
    expect(legacyProfileSeoSlug(normalized)).not.toBe(profileSeoSlug(normalized));
    expect(legacyProfileSeoSlug(normalized)).toContain("vidaus-apdaila");
  });

  it("omits irrelevant auth fields for recovery actions", () => {
    const recovery = new FormData();
    recovery.set("email", "meistras@example.lt");
    recovery.set("password", "");
    expect(authEmailPayload("recovery", recovery, "/meistras")).toEqual({
      action: "recovery", email: "meistras@example.lt", next: "/meistras"
    });
    const password = new FormData();
    password.set("password", "naujas-slaptažodis");
    expect(authEmailPayload("update-password", password, "/meistras")).toEqual({
      action: "update-password", password: "naujas-slaptažodis", next: "/meistras"
    });
  });

  it("derives active work areas from normalized services when assignments are retired", () => {
    expect(resolveServicesCategoryIds({
      activeCategoryIds: ["electrical"],
      assignedCategoryIds: ["retired-electrical"],
      serviceCategoryIds: ["electrical", "electrical"],
      legacyCategoryId: "retired-electrical"
    })).toEqual({ selectedCategoryIds: ["electrical"], unresolved: false });
  });

  it("preserves valid assignments and reports ambiguous legacy replacements", () => {
    expect(resolveServicesCategoryIds({
      activeCategoryIds: ["electrical", "plumbing"],
      assignedCategoryIds: ["electrical"],
      serviceCategoryIds: ["plumbing"],
      legacyCategoryId: "retired"
    })).toEqual({ selectedCategoryIds: ["electrical"], unresolved: false });
    expect(resolveServicesCategoryIds({
      activeCategoryIds: ["electrical", "plumbing"],
      assignedCategoryIds: ["retired"],
      serviceCategoryIds: ["electrical", "plumbing"],
      legacyCategoryId: "retired"
    })).toEqual({ selectedCategoryIds: [], unresolved: true });
  });
});
