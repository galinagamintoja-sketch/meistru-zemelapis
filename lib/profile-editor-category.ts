type EditorCategoryResolution = {
  activeCategoryIds: string[];
  assignedCategoryIds: string[];
  serviceCategoryIds: string[];
  legacyCategoryId?: string | null;
};

export function resolveEditorCategoryId({ activeCategoryIds, assignedCategoryIds, serviceCategoryIds, legacyCategoryId }: EditorCategoryResolution) {
  const active = new Set(activeCategoryIds);
  if (legacyCategoryId && active.has(legacyCategoryId)) return legacyCategoryId;

  const replacements = Array.from(new Set([...assignedCategoryIds, ...serviceCategoryIds]))
    .filter((id) => active.has(id));
  return replacements.length === 1 ? replacements[0] : "";
}
