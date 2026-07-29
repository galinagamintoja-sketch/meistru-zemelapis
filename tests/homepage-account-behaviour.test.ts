import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import LocalProApp, { performHomepageLogout } from "../components/LocalProApp";
import type { HomepageAccountState } from "../lib/homepage-account-state";

const renderState = (accountState: HomepageAccountState, registrationOnly = false) =>
  renderToStaticMarkup(
    createElement(LocalProApp, { initialSpecialists: [], categories: [], accountState, registrationOnly })
  );

describe("homepage account behaviour", () => {
  it("renders the exact logged-out navigation without a registration form", () => {
    const html = renderState({ authenticated: false, hasProfile: false, isAdmin: false });
    for (const label of ["Pateikti darbų užklausą", "Meistro registracija", "Prisijungti"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain('<a href="#search">Rasti specialistą</a>');
    expect(html).not.toContain('<a href="#how">Kaip veikia</a>');
    expect(html).not.toContain("LocalPro specialisto registracijos forma");
    expect(html).not.toContain("#register");
    expect(html).not.toContain("Profilio peržiūra");
  });

  it("renders one unambiguous specialist account state", () => {
    const html = renderState({
      authenticated: true,
      hasProfile: true,
      isAdmin: false,
      displayName: "Testo meistras",
      email: "masked@example.lt"
    });
    expect(html).toContain("Prisijungta kaip");
    expect(html).toContain("Meistro paskyra");
    expect(html).toContain("Atsijungti");
    expect(html).toContain('aria-label="Atidaryti paskyros meniu"');
    expect(html).toContain('class="mobile-account-summary-copy"');
    expect(html).not.toContain("Meistro registracija");
    expect(html).not.toContain("Tęsti registraciją");
  });

  it("renders registration continuation for an authenticated user without a profile", () => {
    const homepage = renderState({
      authenticated: true,
      hasProfile: false,
      isAdmin: false,
      email: "masked@example.lt"
    });
    expect(homepage).toContain("Tęsti registraciją");
    expect(homepage).toContain("Atsijungti");
    expect(homepage).not.toContain("Meistro paskyra");

    const registration = renderState({
      authenticated: true,
      hasProfile: false,
      isAdmin: false,
      email: "masked@example.lt"
    }, true);
    expect(registration).toContain("LocalPro specialisto registracijos forma");
  });

  it("renders only server-provided administrator controls and requires deliberate specialist registration", () => {
    const homepage = renderState({
      authenticated: true,
      hasProfile: false,
      isAdmin: true,
      email: "admin@example.lt"
    });
    expect(homepage).toContain("Administravimas");
    expect(homepage).toContain("Tęsti registraciją");

    const registration = renderState({
      authenticated: true,
      hasProfile: false,
      isAdmin: true,
      email: "admin@example.lt"
    }, true);
    expect(registration).toContain("Meistro profilis nebus sukurtas automatiškai");
    expect(registration).not.toContain("LocalPro specialisto registracijos forma");
  });

  it("logs out through the secure endpoint and returns to freshly rendered homepage", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const navigate = vi.fn();
    await expect(performHomepageLogout(fetcher as typeof fetch, navigate)).resolves.toBe(true);
    expect(fetcher).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
    expect(navigate).toHaveBeenCalledWith("/");
  });
});
