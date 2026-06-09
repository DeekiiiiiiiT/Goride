/** Split a Roam display name into first / last for confirmation UI. */
export function splitRoamDisplayName(displayName: string | null | undefined): {
  firstName: string;
  lastName: string;
} {
  const trimmed = displayName?.trim() ?? '';
  if (!trimmed) return { firstName: '—', lastName: '—' };
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: '—' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}
