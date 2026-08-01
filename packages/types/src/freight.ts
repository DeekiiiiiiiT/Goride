/** Freight Forwarding domain types (Enterprise Path B). */

export type FreightShipmentStatus =
  | 'draft'
  | 'booked'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'exception';

export type FreightLegStatus =
  | 'pending'
  | 'assigned'
  | 'in_transit'
  | 'completed'
  | 'cancelled'
  | 'exception';

export type FreightCarrierMode = 'own' | '3pl' | 'mixed';

export type FreightDocumentKind = 'bol' | 'pod' | 'invoice' | 'other';

export interface FreightCarrier {
  id: string;
  organizationId: string;
  name: string;
  isOwnFleet: boolean;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  capacityNotes?: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface FreightClient {
  id: string;
  organizationId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  billingAddress?: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface FreightRateCard {
  id: string;
  organizationId: string;
  clientId?: string | null;
  name: string;
  originLabel?: string | null;
  destinationLabel?: string | null;
  currency: string;
  amountMinor: number;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  status: 'active' | 'inactive';
  createdAt: string;
  updatedAt: string;
}

export interface FreightShipment {
  id: string;
  organizationId: string;
  clientId?: string | null;
  rateCardId?: string | null;
  referenceCode: string;
  status: FreightShipmentStatus;
  mode: FreightCarrierMode;
  originLabel: string;
  originLat?: number | null;
  originLng?: number | null;
  destinationLabel: string;
  destinationLat?: number | null;
  destinationLng?: number | null;
  currency: string;
  billedAt?: string | null;
  billedEntryId?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FreightShipmentLeg {
  id: string;
  organizationId: string;
  shipmentId: string;
  sequence: number;
  carrierId?: string | null;
  status: FreightLegStatus;
  plannedPickupAt?: string | null;
  plannedDeliveryAt?: string | null;
  actualPickupAt?: string | null;
  actualDeliveryAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FreightConsignment {
  id: string;
  organizationId: string;
  shipmentId: string;
  description: string;
  quantity: number;
  weightKg?: number | null;
  lengthCm?: number | null;
  widthCm?: number | null;
  heightCm?: number | null;
  declaredValueMinor?: number | null;
  currency: string;
  hazmat: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FreightTrackingEvent {
  id: string;
  organizationId: string;
  shipmentId: string;
  legId?: string | null;
  status: string;
  note?: string | null;
  actorUserId?: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface FreightDocument {
  id: string;
  organizationId: string;
  shipmentId: string;
  legId?: string | null;
  kind: FreightDocumentKind;
  storagePath: string;
  fileName: string;
  contentType?: string | null;
  createdAt: string;
}

export const FREIGHT_SHIPMENT_TRANSITIONS: Record<
  FreightShipmentStatus,
  FreightShipmentStatus[]
> = {
  draft: ['booked', 'cancelled'],
  booked: ['in_transit', 'cancelled', 'exception'],
  in_transit: ['out_for_delivery', 'delivered', 'exception', 'cancelled'],
  out_for_delivery: ['delivered', 'exception', 'cancelled'],
  delivered: [],
  cancelled: [],
  exception: ['in_transit', 'out_for_delivery', 'cancelled'],
};
