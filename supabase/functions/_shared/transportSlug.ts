/** Normalize Commando body type label or manual slug to rides vehicle_types.slug */
export function normalizeTransportSolutionSlug(input: string): string {
  let s = input.trim().toLowerCase();
  s = s.replace(/\s+/g, "-");
  s = s.replace(/[^a-z0-9_-]/g, "");
  s = s.replace(/-+/g, "-").replace(/^-+/, "");
  if (s.length > 31) s = s.slice(0, 31);
  return s;
}

export const TRANSPORT_SOLUTION_SLUG_RE = /^[a-z][a-z0-9_-]{0,30}$/;

export function slugFromCommandoBodyType(label: string): string {
  return normalizeTransportSolutionSlug(label);
}
