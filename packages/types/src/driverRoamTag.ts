/** Driver-only personal Roam Tag (separate from courier + passenger tags). */

export interface DriverRoamTagDto {
  /** User-visible handle without @ prefix; null until set. */
  custom_tag_name: string | null;
  has_custom_tag: boolean;
}

export interface UpdateDriverRoamTagBody {
  custom_tag_name: string;
}

export interface DriverRoamTagLookupDto {
  custom_tag_name: string;
  display_name: string | null;
  user_id: string;
}

export function formatDriverRoamTagDisplay(tag: string | null | undefined): string {
  if (!tag) return '';
  const cleaned = tag.trim().replace(/^@+/, '');
  return cleaned ? `@${cleaned}` : '';
}

export function normalizeDriverRoamTagName(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, '');
}

const RESERVED_DRIVER_TAGS = new Set([
  'admin',
  'support',
  'help',
  'roam',
  'rush',
  'courier',
  'driver',
  'official',
  'system',
  'null',
  'undefined',
]);

/** Returns null if valid; otherwise an error code. */
export function validateDriverRoamTagName(raw: string): string | null {
  const name = normalizeDriverRoamTagName(raw);
  if (name.length < 3 || name.length > 24) return 'tag_length';
  if (!/^[a-z0-9_]+$/.test(name)) return 'tag_format';
  if (RESERVED_DRIVER_TAGS.has(name)) return 'tag_reserved';
  if (/^(rt|ct|dt)[-_]?[a-z0-9]+$/i.test(name)) return 'tag_reserved';
  return null;
}
