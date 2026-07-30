import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileForm } from "../components/tradesperson-forms";

describe("profile editor cleanup", () => {
  it("keeps editable fields but omits the duplicate public-profile preview panel", () => {
    const html = renderToStaticMarkup(createElement(ProfileForm, {
      categories: [{ id: "category-1", name: "Vidaus apdaila" }],
      initial: {
        displayName: "Testo meistras",
        companyName: "",
        primaryCategoryId: "category-1",
        experienceYears: 5,
        phone: "+37060000000",
        whatsappNumber: "+37060000000",
        publicEmail: "test@example.lt",
        description: "Pakankamai ilgas bandomasis specialisto aprašymas.",
        languages: ["Lietuvių"],
        publicContactConsent: true
      }
    }));

    expect(html).toContain("Pagrindinė informacija");
    expect(html).toContain("Trumpas aprašymas");
    expect(html).toContain("Išsaugoti pakeitimus");
    expect(html).not.toContain('class="profile-preview-panel"');
    expect(html).not.toContain("Viešas profilis");
  });
});
