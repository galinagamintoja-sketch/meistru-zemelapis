import { describe, expect, it } from "vitest";
import { formatVerificationSummary } from "../lib/display";

describe("public specialist presentation", () => {
  it("does not invent a verification message when no genuine badge exists", () => {
    expect(formatVerificationSummary([])).toBe("");
  });
});
