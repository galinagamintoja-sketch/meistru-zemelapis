import { describe, expect, it } from "vitest";
import { getHomepageAccountState, homepageAccountDestination } from "../lib/homepage-account-state";

describe("homepage account state", () => {
  it("distinguishes logged-out, unlinked, linked and administrator states", () => {
    expect(getHomepageAccountState(null, false, false)).toEqual({
      authenticated: false, hasProfile: false, isAdmin: false
    });
    expect(getHomepageAccountState("auth-user", false, false)).toEqual({
      authenticated: true, hasProfile: false, isAdmin: false
    });
    expect(getHomepageAccountState("auth-user", true, false)).toEqual({
      authenticated: true, hasProfile: true, isAdmin: false
    });
    expect(getHomepageAccountState("auth-admin", true, true)).toEqual({
      authenticated: true, hasProfile: true, isAdmin: true
    });
  });

  it("sends an existing profile away from registration and leaves new users on the homepage", () => {
    expect(homepageAccountDestination({ authenticated: true, hasProfile: true, isAdmin: false }, true))
      .toBe("/meistras/uzklausos");
    expect(homepageAccountDestination({ authenticated: true, hasProfile: false, isAdmin: false }, true))
      .toBeNull();
  });
});
