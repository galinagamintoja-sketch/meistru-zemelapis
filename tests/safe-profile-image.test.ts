import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import SafeProfileImage, { rememberFailedProfileImage, safeProfileImageInitial } from "../components/SafeProfileImage";

describe("SafeProfileImage", () => {
  it("keeps useful alt text on a loadable image", () => {
    const html = renderToStaticMarkup(createElement(SafeProfileImage, {
      src: "https://example.lt/work.jpg",
      alt: "Edgaro darbų nuotrauka",
      specialistName: "Edgaras",
      trade: "Baldų gamyba"
    }));

    expect(html).toContain("<img");
    expect(html).toContain('alt="Edgaro darbų nuotrauka"');
    expect(html).toContain('loading="lazy"');
  });

  it("does not render a broken image or raw alt text after a URL has failed", () => {
    const brokenUrl = "https://example.lt/permanently-broken.jpg";
    rememberFailedProfileImage(brokenUrl);
    const html = renderToStaticMarkup(createElement(SafeProfileImage, {
      src: brokenUrl,
      alt: "Raw alt must stay hidden",
      specialistName: "Edgaras",
      trade: "Baldų gamyba",
      fallbackText: "Nuotraukos nėra"
    }));

    expect(html).not.toContain("<img");
    expect(html).not.toContain("Raw alt must stay hidden");
    expect(html).toContain("Nuotraukos nėra");
    expect(html).toContain(">E<");
  });

  it("uses the trade initial when the specialist name is missing", () => {
    expect(safeProfileImageInitial("", "Santechnika")).toBe("S");
  });
});
