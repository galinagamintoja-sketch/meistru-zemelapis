import { describe, expect, it } from "vitest";
import { approximatePublicCoordinates, distanceKm } from "../lib/geo";

describe("public location privacy", () => {
  it("places every public marker 0.5–1 km from its private coordinates", () => {
    const privatePoint = { lat: 54.6872, lng: 25.2797 };

    for (let index = 0; index < 200; index += 1) {
      const publicPoint = approximatePublicCoordinates(`profile-${index}`, privatePoint);
      const offset = distanceKm(privatePoint, publicPoint);

      expect(offset).toBeGreaterThanOrEqual(0.49);
      expect(offset).toBeLessThanOrEqual(1.01);
    }
  });

  it("returns a stable public marker for the same profile", () => {
    const privatePoint = { lat: 54.6436, lng: 25.0486 };
    expect(approximatePublicCoordinates("stable-profile", privatePoint))
      .toEqual(approximatePublicCoordinates("stable-profile", privatePoint));
  });
});
