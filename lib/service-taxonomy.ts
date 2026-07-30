import type { Category } from "./types";

export const MAX_PROFILE_CATEGORIES = 8;
export const MAX_PROFILE_SERVICES = 25;
export const MIN_PROFILE_SERVICES = 2;

export const SERVICE_SLUG_ALIASES: Record<string, string> = {
  "langai-vidaus-duru-montavimas": "vidaus-duru-montavimas",
  "meistras-baldu-surinkimas": "baldu-surinkimas",
  "pilna-buto-apdaila": "pilna-busto-apdaila-ir-remontas",
  "remonto-darbai": "pilna-busto-apdaila-ir-remontas",
  "gipso-kartono-montavimas": "gipso-kartono-ir-pertvaru-montavimas",
  "pertvaru-montavimas": "gipso-kartono-ir-pertvaru-montavimas",
  "rozeciu-montavimas": "rozeciu-ir-jungikliu-montavimas",
  "jungikliu-montavimas": "rozeciu-ir-jungikliu-montavimas",
  "rekuperacijos-sistemos": "vedinimo-ir-rekuperacijos-sistemos",
  "vedinimo-sistemos": "vedinimo-ir-rekuperacijos-sistemos",
  "naujo-stogo-irengimas": "stogo-irengimas-ir-dangos-keitimas",
  "stogo-dangos-keitimas": "stogo-irengimas-ir-dangos-keitimas",
  "angu-irengimas": "angu-pjovimas-ir-irengimas",
  "angu-pjovimas": "angu-pjovimas-ir-irengimas",
  "laiptu-gamyba": "laiptu-gamyba-ir-montavimas",
  "laiptu-montavimas": "laiptu-gamyba-ir-montavimas",
  "stoginiu-statyba": "stogines-pergoles-ir-pavesines",
  "pergoles": "stogines-pergoles-ir-pavesines",
  "pavesines": "stogines-pergoles-ir-pavesines",
  "tvoru-montavimas": "tvoru-ir-vartu-montavimas",
  "vartu-montavimas": "tvoru-ir-vartu-montavimas",
  "sienu-ardymas": "sienu-ir-pertvaru-ardymas",
  "pertvaru-ardymas": "sienu-ir-pertvaru-ardymas",
  "spynu-keitimas": "spynu-ir-duru-furnituros-keitimas",
  "duru-rankenu-keitimas": "spynu-ir-duru-furnituros-keitimas",
  "santechnikos-remontas": "santechnikos-remontas-ir-smulkus-darbai",
  "smulkus-santechnikos-darbai": "santechnikos-remontas-ir-smulkus-darbai",
  "elektros-instaliacijos-remontas": "elektros-remontas-ir-smulkus-darbai",
  "smulkus-elektros-darbai": "elektros-remontas-ir-smulkus-darbai",
  "lietaus-nuvedimo-sistemos": "stogo-latakai-ir-lietvamzdziai",
  "lietaus-nuotekos": "lietaus-nuoteku-tinklai-sklype",
  "griovimo-darbai": "pastatu-ir-konstrukciju-griovimas"
};

export const canonicalServiceSlug = (slug?: string | null) => slug ? SERVICE_SLUG_ALIASES[slug] ?? slug : slug;

export const CANONICAL_SERVICE_NAMES: Record<string, string> = {
  "vidaus-duru-montavimas": "Vidaus durų montavimas",
  "baldu-surinkimas": "Baldų surinkimas",
  "pilna-busto-apdaila-ir-remontas": "Pilna būsto apdaila ir remontas",
  "gipso-kartono-ir-pertvaru-montavimas": "Gipso kartono ir pertvarų montavimas",
  "rozeciu-ir-jungikliu-montavimas": "Rozečių ir jungiklių montavimas",
  "vedinimo-ir-rekuperacijos-sistemos": "Vėdinimo ir rekuperacijos sistemos",
  "stogo-irengimas-ir-dangos-keitimas": "Stogo įrengimas ir dangos keitimas",
  "angu-pjovimas-ir-irengimas": "Angų pjovimas ir įrengimas",
  "laiptu-gamyba-ir-montavimas": "Laiptų gamyba ir montavimas",
  "stogines-pergoles-ir-pavesines": "Stoginės, pergolės ir pavėsinės",
  "tvoru-ir-vartu-montavimas": "Tvorų ir vartų montavimas",
  "sienu-ir-pertvaru-ardymas": "Sienų ir pertvarų ardymas",
  "spynu-ir-duru-furnituros-keitimas": "Spynų ir durų furnitūros keitimas",
  "santechnikos-remontas-ir-smulkus-darbai": "Santechnikos remontas ir smulkūs darbai",
  "elektros-remontas-ir-smulkus-darbai": "Elektros remontas ir smulkūs darbai",
  "stogo-latakai-ir-lietvamzdziai": "Stogo latakai ir lietvamzdžiai",
  "lietaus-nuoteku-tinklai-sklype": "Lietaus nuotekų tinklai sklype",
  "pastatu-ir-konstrukciju-griovimas": "Pastatų ir konstrukcijų griovimas"
};

export const selectionCounter = (label: "Darbo sritys" | "Paslaugos", selected: number, maximum: number) =>
  `${label}: pasirinkta ${selected} iš ${maximum} · liko ${Math.max(0, maximum - selected)}`;

export const SERVICE_CATEGORY_ALIASES: Record<string, string[]> = {
  "vidaus-duru-montavimas": ["vidaus-apdaila", "langai-durys-laiptai"],
  "baldu-surinkimas": ["medzio-darbai-ir-baldai", "meistras-i-namus"],
  "angu-pjovimas-ir-irengimas": ["statyba-ir-konstrukcijos", "griovimas-ir-atlieku-isvezimas"],
  "stogines-pergoles-ir-pavesines": ["statyba-ir-konstrukcijos", "medzio-darbai-ir-baldai"],
  "santechnikos-remontas-ir-smulkus-darbai": ["santechnika", "meistras-i-namus"],
  "elektros-remontas-ir-smulkus-darbai": ["elektra-ir-apsauga", "meistras-i-namus"]
};

type AssignmentCategoryRow = {
  id: string;
  name: string;
  slug: string;
  service_category_assignments?: Array<{
    service_subcategories?: { id: string; name: string; slug: string; is_active?: boolean } | Array<{ id: string; name: string; slug: string; is_active?: boolean }> | null;
  }> | null;
};

export function categoriesFromAssignments(rows: AssignmentCategoryRow[]): Category[] {
  const representative = new Map<string, { id: string; name: string; slug: string }>();
  for (const row of rows) {
    for (const assignment of row.service_category_assignments ?? []) {
      const values = Array.isArray(assignment.service_subcategories) ? assignment.service_subcategories : assignment.service_subcategories ? [assignment.service_subcategories] : [];
      for (const service of values) {
        if (service.is_active === false) continue;
        const slug = canonicalServiceSlug(service.slug) ?? service.slug;
        const normalized = { id: service.id, slug, name: CANONICAL_SERVICE_NAMES[slug] ?? service.name };
        if (!representative.has(slug) || service.slug === slug) representative.set(slug, normalized);
      }
    }
  }
  return rows.map((category) => {
    const seen = new Set<string>();
    const subcategories = (category.service_category_assignments ?? []).flatMap((assignment) => {
      const values = Array.isArray(assignment.service_subcategories)
        ? assignment.service_subcategories
        : assignment.service_subcategories
          ? [assignment.service_subcategories]
          : [];
      return values
        .map((service) => representative.get(canonicalServiceSlug(service.slug) ?? service.slug)!)
        .filter((service) => Boolean(service) && !seen.has(service.slug) && Boolean(seen.add(service.slug)));
    });
    return { id: category.id, name: category.name, slug: category.slug, subcategories };
  });
}

export function categoriesFromLegacy(rows: Array<{ id: string; name: string; slug: string; service_subcategories?: Array<{ id: string; name: string; slug: string; is_active?: boolean }> | null }>) {
  return categoriesFromAssignments(rows.map((category) => ({
    id: category.id,
    name: category.name,
    slug: category.slug,
    service_category_assignments: (category.service_subcategories ?? []).map((service) => ({ service_subcategories: service }))
  })));
}

export function uniqueServices<T extends { id: string }>(services: T[]) {
  return Array.from(new Map(services.map((service) => [service.id, service])).values());
}

export function selectedWorkAreaCount(categories: Category[], selectedServiceSlugs: string[]) {
  const selected = new Set(selectedServiceSlugs);
  return categories.filter((category) => category.subcategories.some((service) => selected.has(service.slug))).length;
}
