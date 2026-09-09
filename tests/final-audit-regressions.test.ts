import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { queuedPhotoStatus } from "../lib/photo-queue-status";
import { resolveEditorCategoryId } from "../lib/profile-editor-category";

describe("final audit regressions", () => {
  it("uses the normalized assigned trade instead of a stale legacy primary category", () => {
    expect(resolveEditorCategoryId({
      activeCategoryIds: ["interior", "electrical"],
      assignedCategoryIds: ["electrical"],
      serviceCategoryIds: ["electrical"],
      legacyCategoryId: "interior"
    })).toBe("electrical");
  });

  it("does not silently select the first option for an unmapped trade", () => {
    expect(resolveEditorCategoryId({
      activeCategoryIds: ["interior", "electrical"],
      assignedCategoryIds: [],
      serviceCategoryIds: [],
      legacyCategoryId: "retired-category"
    })).toBe("");
  });

  it("recomputes photo queue feedback after removal", () => {
    expect(queuedPhotoStatus(1)).toBe("1 nuotrauka optimizuota ir paruošta peržiūrai.");
    expect(queuedPhotoStatus(0)).toBe("Nuotraukų eilė tuščia.");
  });

  it("returns category visitors to URL-backed homepage results", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "app/[profession]/[location]/page.tsx"), "utf8");
    expect(source).toContain("categorySearchReturnPath");
    expect(source).toContain("#results");
    expect(source).not.toContain("/#mapSection");
  });

  it("uses a keyboard-reachable photo chooser", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "components/photo-uploader.tsx"), "utf8");
    expect(source).toContain('type="button"');
    expect(source).toContain("pickerRef.current?.click()");
    expect(source).toContain('className="visually-hidden-file-input"');
  });
});
