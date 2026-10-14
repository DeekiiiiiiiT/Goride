/** Web name for a catalog town. Display names repeat across parishes; this must not. */
export function marketSlugFromBoundary(boundarySlug: string, parishSlug: string): string {
  const town = boundarySlug.trim().toLowerCase();
  const parish = parishSlug.trim().toLowerCase();
  if (!town || !parish) return "";
  return `${town}-${parish}`;
}
