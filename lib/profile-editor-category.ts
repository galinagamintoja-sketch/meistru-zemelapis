type EditorCategoryResolution = {
  activeCategoryIds: string[];
  assignedCategoryIds: string[];
  serviceCategoryIds: string[];
  legacyCategoryId?: string | null;
};

export function resolveEditorCategoryId({ activeCategoryIds, assignedCategoryIds, serviceCategoryIds, legacyCategoryId }: EditorCategoryResolution) {
  const active = new Set(activeCategoryIds);
  return assignedCategoryIds.find((id) => active.has(id))
    ?? serviceCategoryIds.find((id) => active.has(id))
    ?? (legacyCategoryId && active.has(legacyCategoryId) ? legacyCategoryId : "");
}
