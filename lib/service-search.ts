import { SERVICE_SLUG_ALIASES } from "./service-taxonomy";
import type { Category } from "./types";

export type ServiceSearchOption = {
  id: string;
  kind: "category" | "service";
  slug: string;
  name: string;
  categoryName: string;
  searchTerms: string[];
};

const SEARCH_KEYWORDS: Record<string, string[]> = {
  "elektra-ir-apsauga": ["elektrikas", "elektros darbai", "elektros gedimas"],
  "gedimu-paieska": ["elektros gedimas", "elektros gedimai", "nera elektros"],
  "rozeciu-ir-jungikliu-montavimas": ["rozete", "rozetes", "sutaisyti rozete", "sugedo rozete"],
  "santechnika": ["santechnikas", "vandentiekis", "varva kranas"],
  "santechnikos-remontas-ir-smulkus-darbai": ["varva kranas", "sutaisyti krana", "santechnikos gedimas"],
  "plyteliu-klijavimas": ["plyteles", "plyteliu klojimas", "klijuoti plyteles"],
  "stogo-remontas": ["stogo remontas", "remontuoti stoga", "leidzia stogas"]
};

export function normalizeServiceSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("lt")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function slugWords(slug: string) {
  return slug.replaceAll("-", " ");
}

function aliasesFor(canonicalSlug: string) {
  return Object.entries(SERVICE_SLUG_ALIASES)
    .filter(([, canonical]) => canonical === canonicalSlug)
    .map(([alias]) => slugWords(alias));
}

function terms(...values: Array<string | string[]>) {
  return Array.from(new Set(values.flat().map(normalizeServiceSearchText).filter(Boolean)));
}

export function buildServiceSearchOptions(categories: Category[]): ServiceSearchOption[] {
  return categories.flatMap((category) => [
    {
      id: `category:${category.slug}`,
      kind: "category" as const,
      slug: category.slug,
      name: category.name,
      categoryName: "Darbo sritis",
      searchTerms: terms(category.name, slugWords(category.slug), SEARCH_KEYWORDS[category.slug] ?? [])
    },
    ...category.subcategories.map((service) => ({
      id: `service:${category.slug}:${service.slug}`,
      kind: "service" as const,
      slug: service.slug,
      name: service.name,
      categoryName: category.name,
      searchTerms: terms(
        service.name,
        slugWords(service.slug),
        category.name,
        aliasesFor(service.slug),
        SEARCH_KEYWORDS[service.slug] ?? []
      )
    }))
  ]);
}

function scoreTerm(term: string, query: string, queryTokens: string[]) {
  if (term === query) return 1000;
  if (term.startsWith(query)) return 800 - Math.min(100, term.length - query.length);
  if (term.includes(query)) return 650 - Math.min(100, term.indexOf(query));

  const termTokens = term.split(" ");
  let score = 0;
  for (const token of queryTokens) {
    if (termTokens.includes(token)) score += 120;
    else if (termTokens.some((candidate) => candidate.startsWith(token))) score += 90;
    else if (termTokens.some((candidate) => candidate.includes(token))) score += 55;
    else return 0;
  }
  return score + queryTokens.length * 10;
}

export function searchServiceOptions(options: ServiceSearchOption[], query: string, limit = 8) {
  const normalizedQuery = normalizeServiceSearchText(query);
  if (!normalizedQuery) return options.slice(0, limit);
  const queryTokens = normalizedQuery.split(" ");
  const bestBySlug = new Map<string, { option: ServiceSearchOption; score: number; order: number }>();

  options.forEach((option, order) => {
    const score = Math.max(0, ...option.searchTerms.map((term) => scoreTerm(term, normalizedQuery, queryTokens)));
    if (!score) return;
    const existing = bestBySlug.get(option.slug);
    if (!existing || score > existing.score) bestBySlug.set(option.slug, { option, score, order });
  });

  return [...bestBySlug.values()]
    .sort((left, right) => right.score - left.score || Number(right.option.kind === "service") - Number(left.option.kind === "service") || left.order - right.order)
    .slice(0, limit)
    .map(({ option }) => option);
}
