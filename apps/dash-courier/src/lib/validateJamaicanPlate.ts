/** Jamaica-style plate: 1–3 letters + 1–4 digits, or N/A for bicycle. */
export function validateJamaicanPlate(plate: string): boolean {
  const normalized = plate.trim().toUpperCase();
  if (normalized === 'N/A') return true;
  return /^[A-Z]{1,3}\d{1,4}$/.test(normalized);
}
