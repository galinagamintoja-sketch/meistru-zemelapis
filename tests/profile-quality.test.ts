import { describe, expect, it } from "vitest";
import { profileQualityWarnings } from "../lib/profile-quality";
import type { Specialist } from "../lib/types";

const base = { id: "one", name: "Jonas", town: "Vilnius", description: "Tvarkingai atlieku įvairius statybos darbus klientams visoje Vilniaus apskrityje.", photoUrls: ["/work.webp"] } as Specialist;

const mismatchWarning = "Patikrinkite aprašymo ir pasirinktų paslaugų atitiktį: aprašyme minima svetainių kūrimo veikla, bet ji nenurodyta tarp pasirinktų paslaugų";
const plumber = {
  ...base, trade: "Santechnika", categorySlug: "santechnika", categorySlugs: ["santechnika"],
  categoryNames: ["Santechnika"], subcategorySlugs: ["vamzdynu-montavimas"],
  subcategoryNames: ["Vamzdynų montavimas"], description: "Kuriu internetines svetaines klientams."
} as Specialist;

describe("description/service consistency warnings", () => {
  it.each([
    "Kuriu internetines svetaines klientams.",
    "Internetinių svetainių kūrimas ir programavimas.",
    "SVETAINIŲ KŪRIMAS. Individualūs sprendimai verslui.",
    "I offer website development and web design.",
    "I build websites for small businesses."
  ])("flags clear website-development copy on a plumbing profile: %s", (description) => {
    expect(profileQualityWarnings({ ...plumber, description })).toEqual([mismatchWarning]);
  });

  it("recognizes legacy primary category aliases", () => {
    expect(profileQualityWarnings({ ...plumber, categorySlug: "apdaila" })).toContain(mismatchWarning);
  });

  it.each([
    { categorySlugs: ["santechnika", "svetainiu-kurimas"] },
    { categoryNames: ["Santechnika", "Programavimas"] },
    { subcategorySlugs: ["vamzdynu-montavimas", "website-development"] },
    { subcategoryNames: ["Vamzdynų montavimas", "Internetinių svetainių kūrimas"] }
  ])("accepts supported secondary digital work: %j", (selection) => {
    expect(profileQualityWarnings({ ...plumber, ...selection })).toEqual([]);
  });

  it.each([
    "Montuoju vamzdžius ir kuriu internetines svetaines.",
    "Dažau sienas, montuoju baldus. Kuriu svetaines.",
    "I provide plumbing and website development.",
    "Atlieku elektros instaliacijos darbus ir santechnikos remontą."
  ])("does not penalize multi-trade descriptions: %s", (description) => {
    expect(profileQualityWarnings({ ...plumber, description,
      categorySlugs: ["santechnika", "elektra"], subcategoryNames: ["Vamzdynų montavimas", "Elektros instaliacija"] })).toEqual([]);
  });

  it.each([
    "Svetainių kūrimo paslaugų neteikiu.",
    "Nekuriu internetinių svetainių.",
    "I do not offer website development.",
    "Website development is not a service I offer.",
    "I don't build websites.",
    "Anksčiau kūriau internetines svetaines.",
    "Previously I offered website development.",
    "Svetainių kūrimą atlieka mūsų partneriai.",
    "I recommend a partner for website development.",
    "Darbų pavyzdžiai mano internetinėje svetainėje.",
    "Patikimai ir kruopščiai padedu namų savininkams.",
    "", "Kuriu individualius sprendimus."
  ])("abstains on negated, ambiguous or non-offer copy: %s", (description) => {
    expect(profileQualityWarnings({ ...plumber, description })).toEqual([]);
  });

  it("abstains on unknown primary categories rather than inventing a taxonomy", () => {
    expect(profileQualityWarnings({ ...plumber, categorySlug: "other" })).toEqual([]);
  });

  it("returns deterministic advisory text without rewriting profile fields or selections", () => {
    const profile = structuredClone(plumber);
    const before = structuredClone(profile);
    const first = profileQualityWarnings(profile);
    expect(first).toEqual([mismatchWarning]);
    expect(profileQualityWarnings(profile)).toEqual(first);
    expect(profile).toEqual(before);
  });
});

describe("profile content quality", () => {
  it("flags missing photos, address-shaped locality, repeated copy and duplicate names", () => {
    const profile = { ...base, photoUrls: [], town: "bažnyčios g.23", description: "Atlieku dažymo darbus. Atlieku dažymo darbus." };
    const duplicate = { ...base, id: "two" };
    expect(profileQualityWarnings(profile, [profile, duplicate])).toEqual(expect.arrayContaining([
      "Trūksta darbų nuotraukų", "Aprašyme kartojasi tas pats sakinys", "Vieša vietovė panaši į adresą", "Yra kitas profilis tokiu pačiu vardu"
    ]));
  });
});
