import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TradespersonNavigation, tradespersonNavigation } from "../components/tradesperson-navigation";

vi.mock("next/navigation", () => ({ usePathname: () => "/meistras/nuotraukos" }));

describe("tradesperson dashboard navigation", () => {
  it("keeps the five approved destinations in the reference order", () => {
    expect(tradespersonNavigation.map(({ label }) => label)).toEqual(["Užklausos", "Mano profilis", "Nuotraukos", "Paslaugos", "Paskyra"]);
  });

  it("marks the current destination for assistive technology", () => {
    const html = renderToStaticMarkup(createElement(TradespersonNavigation));
    expect(html).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/meistras\/nuotraukos"/);
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("renders concise labels in the mobile navigation", () => {
    const html = renderToStaticMarkup(createElement(TradespersonNavigation, { mobile: true }));
    expect(html).toContain('aria-label="Mobilioji navigacija"');
    expect(html).toContain(">Profilis<");
  });
});
