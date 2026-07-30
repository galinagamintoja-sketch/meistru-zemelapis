import type { Category } from "./types";

export const MAX_WORK_AREAS = 13;
export const MAX_PROFILE_SERVICES = 25;
export const MIN_PROFILE_SERVICES = 2;

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
  return rows.map((category) => {
    const seen = new Set<string>();
    const subcategories = (category.service_category_assignments ?? []).flatMap((assignment) => {
      const values = Array.isArray(assignment.service_subcategories)
        ? assignment.service_subcategories
        : assignment.service_subcategories
          ? [assignment.service_subcategories]
          : [];
      return values
        .filter((service) => service.is_active !== false && !seen.has(service.id) && Boolean(seen.add(service.id)))
        .map(({ id, name, slug }) => ({ id, name, slug }));
    });
    return { id: category.id, name: category.name, slug: category.slug, subcategories };
  });
}

export function uniqueServices<T extends { id: string }>(services: T[]) {
  return Array.from(new Map(services.map((service) => [service.id, service])).values());
}

export function selectedWorkAreaCount(categories: Category[], selectedServiceSlugs: string[]) {
  const selected = new Set(selectedServiceSlugs);
  return categories.filter((category) => category.subcategories.some((service) => selected.has(service.slug))).length;
}
