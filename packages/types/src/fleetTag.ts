/** Public Fleet Tag shape returned to fleet dashboard (never includes internal id). */
export interface FleetTagDto {
  fleet_tag: string | null;
  has_fleet_tag: boolean;
  organization_id: string;
  organization_name: string | null;
}

export interface UpdateFleetTagBody {
  fleet_tag: string;
}

/** Lookup result when a driver/courier resolves a Fleet Tag. */
export interface FleetTagLookupDto {
  fleet_tag: string;
  organization_id: string;
  organization_name: string;
}

export type FleetJoinServiceLine = 'rideshare' | 'rush_delivery';

export type FleetJoinRequestStatus = 'pending' | 'approved' | 'denied' | 'cancelled';

export interface FleetJoinRequestDto {
  id: string;
  organization_id: string;
  requester_user_id: string;
  service_line: FleetJoinServiceLine;
  status: FleetJoinRequestStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  /** Enriched for fleet dashboard listing. */
  requester_name?: string | null;
  requester_email?: string | null;
}

export interface CreateFleetJoinRequestBody {
  fleetTag: string;
  serviceLine: FleetJoinServiceLine;
}

export function formatFleetTagDisplay(tag: string | null | undefined): string {
  if (!tag) return '';
  const cleaned = tag.trim().replace(/^@+/, '');
  return cleaned ? `@${cleaned}` : '';
}

export function normalizeFleetTagName(raw: string): string {
  return raw.trim().toLowerCase().replace(/^@+/, '');
}
