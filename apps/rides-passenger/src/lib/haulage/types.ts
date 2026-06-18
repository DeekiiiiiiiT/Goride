export type HaulageStairsLevel = 'none' | '1_flight' | '2_plus';
export type HaulagePrepStatus = 'ready' | 'needs_unhooking';

export type HaulageCategoryId = string;

export type HaulageStep = 'category' | 'items' | 'locations' | 'review' | 'payment';

export const HAULAGE_STEPS: HaulageStep[] = [
  'category',
  'items',
  'locations',
  'review',
  'payment',
];

export type HaulagePlace = {
  address: string;
  lat: number;
  lng: number;
};

export type HaulageFreightItem = {
  clientId: string;
  categoryId: string;
  templateId: string;
  variantId: string;
  itemTitle: string;
  variantLabel: string;
  subtitle: string;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightKg: number;
  fragile: boolean;
  requiresDisassembly: boolean;
  requiresManualSpecs: boolean;
};

export type HaulagePendingItem = {
  templateId: string;
  variantId: string;
};

export type HaulageBookingDraft = {
  categoryId: string | null;
  items: HaulageFreightItem[];
  pickup: HaulagePlace | null;
  dropoff: HaulagePlace | null;
  pickupTime: string;
  paymentMethodId: string | null;
  stairsLevel: HaulageStairsLevel;
  prepStatus: HaulagePrepStatus;
  quoteToken: string | null;
  quotedTotalMinor: number | null;
  currency: string | null;
};

export type HaulageConfirmation = {
  bookingRef: string;
  rideRequestId?: string;
  estimatedTotalMinor: number;
  currency: string;
  itemCount: number;
  pickupAddress: string;
  dropoffAddress: string;
  bookingKind?: 'immediate' | 'scheduled';
  scheduledPickupAt?: string | null;
};
