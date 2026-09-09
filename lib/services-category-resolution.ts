type ServicesCategoryResolution = {
  activeCategoryIds: string[];
  assignedCategoryIds: string[];
  serviceCategoryIds: string[];
  legacyCategoryId?: string | null;
};

export function resolveServicesCategoryIds({ activeCategoryIds, assignedCategoryIds, serviceCategoryIds, legacyCategoryId }: ServicesCategoryResolution) {
  const active = new Set(activeCategoryIds);
  const validAssignments = Array.from(new Set(assignedCategoryIds.filter((id) => active.has(id))));
  if (validAssignments.length) return { selectedCategoryIds: validAssignments, unresolved: false };

  if (legacyCategoryId && active.has(legacyCategoryId)) {
    return { selectedCategoryIds: [legacyCategoryId], unresolved: false };
  }

  const serviceCandidates = Array.from(new Set(serviceCategoryIds.filter((id) => active.has(id))));
  if (serviceCandidates.length === 1) return { selectedCategoryIds: serviceCandidates, unresolved: false };
  const hasLegacyState = assignedCategoryIds.length > 0 || Boolean(legacyCategoryId && !active.has(legacyCategoryId));
  return { selectedCategoryIds: [], unresolved: hasLegacyState && serviceCandidates.length !== 1 };
}
