/** Shared logistics job domain types (Enterprise first). */

export type LogisticsJobStatus =
  | 'unassigned'
  | 'matching'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'exception';

export type LogisticsAssigneeType =
  | 'org_fleet'
  | 'client_fleet'
  | 'third_party'
  | 'roam_marketplace';

export type LogisticsVerticalKey = 'freight' | 'delivery' | 'haulage';

export type LogisticsExternalRefType = 'freight_shipment';

export interface LogisticsJob {
  id: string;
  organizationId: string;
  productKey: string;
  verticalKey: LogisticsVerticalKey;
  externalRefType: LogisticsExternalRefType;
  externalRefId: string;
  referenceCode?: string | null;
  status: LogisticsJobStatus;
  assigneeType?: LogisticsAssigneeType | null;
  assigneeDriverId?: string | null;
  assigneeVehicleId?: string | null;
  clientFleetAssetId?: string | null;
  thirdPartyCarrierId?: string | null;
  pickupLabel?: string | null;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffLabel?: string | null;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  scheduledPickupAt?: string | null;
  scheduledDropoffAt?: string | null;
  priority: number;
  notes?: string | null;
  assignedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LogisticsJobStop {
  id: string;
  organizationId: string;
  jobId: string;
  sequence: number;
  stopType: 'pickup' | 'dropoff' | 'waypoint';
  label?: string | null;
  lat?: number | null;
  lng?: number | null;
  externalLegId?: string | null;
  status: 'pending' | 'arrived' | 'completed' | 'skipped' | 'failed';
  createdAt: string;
  updatedAt: string;
}

export interface LogisticsJobEvent {
  id: string;
  organizationId: string;
  jobId: string;
  eventType: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  actorUserId?: string | null;
  note?: string | null;
  payload: Record<string, unknown>;
  idempotencyKey?: string | null;
  occurredAt: string;
}
