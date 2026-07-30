import { describe, expect, it } from "vitest";
import {
  LITHUANIA_BOUNDS,
  clampToLithuania,
  getResponsiveLithuaniaMinZoom,
  isInsideLithuania
} from "../lib/lithuania-map";

describe("Lithuania map territory", () => {
  it("uses LocalPro's accepted Lithuania coordinate area", () => {
    expect(LITHUANIA_BOUNDS).toEqual([[53.8, 20.5], [56.5, 27]]);
  });

  it("clamps search centres on every side of Lithuania", () => {
    expect(clampToLithuania({ lat: 60, lng: 23 })).toEqual({ lat: 56.5, lng: 23 });
    expect(clampToLithuania({ lat: 50, lng: 23 })).toEqual({ lat: 53.8, lng: 23 });
    expect(clampToLithuania({ lat: 55, lng: 30 })).toEqual({ lat: 55, lng: 27 });
    expect(clampToLithuania({ lat: 55, lng: 18 })).toEqual({ lat: 55, lng: 20.5 });
    expect(isInsideLithuania({ lat: 55.1, lng: 23.9 })).toBe(true);
  });

  it("uses the container-aware inside-bounds zoom without exceeding max zoom", () => {
    expect(getResponsiveLithuaniaMinZoom({ getBoundsZoom: (_bounds, inside) => inside ? 7 : 5, getMaxZoom: () => 15 })).toBe(7);
    expect(getResponsiveLithuaniaMinZoom({ getBoundsZoom: () => 18, getMaxZoom: () => 15 })).toBe(15);
  });
});
