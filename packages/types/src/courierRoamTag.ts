/** Courier-only personal Roam Tag (separate from passenger tags). */

export interface CourierRoamTagDto {
  /** User-visible handle without @ prefix; null until set. */
  custom_tag_name: string | null;
  has_custom_tag: boolean;
}

export interface UpdateCourierRoamTagBody {
  custom_tag_name: string;
}

export interface CourierRoamTagLookupDto {
  custom_tag_name: string;
  display_name: string | null;
  user_id: string;
}

export type WorkforceInviteKind = 'code' | 'roam_tag';

export interface WorkforceInviteMineDto {
  id: string;
  organization_id: string;
  organization_name: string | null;
  service_line: 'rideshare' | 'rush_delivery';
  invite_kind: WorkforceInviteKind;
  status: string;
  created_at: string;
  expires_at: string;
}

export interface CourierFleetAssignedVehicleDto {
  id: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  licensePlate: string;
  vehicleType: string | null;
}

export interface CourierWorkforceMeDto {
  mode: 'independent' | 'fleet';
  fleetId: string | null;
  fleetName: string | null;
  fleetRole: string | null;
  joinedAt: string | null;
  assignedVehicle: CourierFleetAssignedVehicleDto | null;
}

export function formatCourierRoamTagDisplay(tag: string | null | undefined): string {
  if (!tag) return '';
  const cleaned = tag.trim().replace(/^@+/, '');
  return cleaned ? `@${cleaned}` : '';
}

export function normalizeCourierRoamTagName(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, '');
}

const RESERVED_COURIER_TAGS = new Set([
  'admin',
  'support',
  'help',
  'roam',
  'rush',
  'courier',
  'official',
  'system',
  'null',
  'undefined',
]);

/** Returns null if valid; otherwise an error code. */
export function validateCourierRoamTagName(raw: string): string | null {
  const name = normalizeCourierRoamTagName(raw);
  if (name.length < 3 || name.length > 24) return 'tag_length';
  if (!/^[a-z0-9_]+$/.test(name)) return 'tag_format';
  if (RESERVED_COURIER_TAGS.has(name)) return 'tag_reserved';
  if (/^(rt|ct)[-_]?[a-z0-9]+$/i.test(name)) return 'tag_reserved';
  return null;
}
