import { statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATEGORY_SOCIAL_IMAGE, HOME_METADATA, PROFILE_SOCIAL_IMAGE, SITE_URL } from "../lib/seo";

describe("LocalPro social metadata", () => {
  it("uses the canonical non-www production origin", () => {
    expect(SITE_URL).toBe("https://localpro.lt");
    expect(HOME_METADATA.alternates?.canonical).toBe("https://localpro.lt");
  });

  it("declares the requested homepage metadata and large social card", () => {
    expect(HOME_METADATA.title).toBe("Meistrai jūsų mieste – raskite specialistą | LocalPro.lt");
    expect(HOME_METADATA.description).toBe("Ieškote meistro? LocalPro.lt raskite elektrikus, santechnikus ir apdailos specialistus savo mieste. Peržiūrėkite profilius ir susisiekite tiesiogiai.");
    expect(HOME_METADATA.openGraph).toMatchObject({
      title: "Reikia meistro? Rask šalia. | LocalPro.lt",
      description: "Atrask elektrikus, santechnikus ir apdailos specialistus savo mieste. Rask meistrą su LocalPro.lt.",
      type: "website",
      siteName: "LocalPro.lt",
      locale: "lt_LT",
      url: "https://localpro.lt"
    });
    expect(HOME_METADATA.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("ships the versioned 1200 by 630 fallback image", () => {
    expect(CATEGORY_SOCIAL_IMAGE).toBe(PROFILE_SOCIAL_IMAGE);
    expect(PROFILE_SOCIAL_IMAGE.url).toBe("https://localpro.lt/brand/localpro-social-v1.png");
    expect(PROFILE_SOCIAL_IMAGE.width).toBe(1200);
    expect(PROFILE_SOCIAL_IMAGE.height).toBe(630);
    expect(PROFILE_SOCIAL_IMAGE.type).toBe("image/png");
    expect(statSync("public/brand/localpro-social-v1.png").size).toBeGreaterThan(100_000);
  });
});
