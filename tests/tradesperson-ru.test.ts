import { describe, expect, it } from "vitest";
import { translateTradespersonText } from "../lib/tradesperson-ru";
import { readFileSync } from "node:fs";

describe("Russian tradesperson interface copy", () => {
  it("translates dashboard and trade names without changing surrounding whitespace", () => {
    expect(translateTradespersonText("  Mano profilis ")).toBe("  Мой профиль ");
    expect(translateTradespersonText("Santechnika")).toBe("Сантехника");
    expect(translateTradespersonText("Darbo sritys: pasirinkta 2 iš 8 · liko 6")).toBe("Направления: выбрано 2 из 8 · осталось 6");
  });

  it("leaves unknown user-provided content untouched", () => {
    expect(translateTradespersonText("Valentin Plumbing UAB")).toBe("Valentin Plumbing UAB");
  });

  it("covers the active trade taxonomy and normalized service names", () => {
    const initialTaxonomy = readFileSync("supabase/migrations/015_localpro_service_taxonomy.sql", "utf8");
    const categoryNames = [...initialTaxonomy.matchAll(/^\s*\('([^']+)', '[^']+', \d+\),?$/gm)].map((match) => match[1]);
    const serviceNames = [...initialTaxonomy.matchAll(/^\s*\('[^']+','([^']+)','[^']+'\),?$/gm)].map((match) => match[1]);
    const normalizedTaxonomy = readFileSync("supabase/migrations/021_normalize_service_taxonomy.sql", "utf8");
    const normalizedNames = [...normalizedTaxonomy.matchAll(/^\s*\('[^']+','[^']+','([^']+)','[^']+'\),?$/gm)].map((match) => match[1]);
    const untranslated = [...categoryNames, ...serviceNames, ...normalizedNames].filter((name) => translateTradespersonText(name) === name);
    expect(untranslated).toEqual([]);
  });
});
