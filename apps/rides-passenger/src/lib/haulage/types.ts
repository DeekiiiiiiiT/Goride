export type HaulageCategoryId = 'appliances' | 'furniture' | 'electronics' | 'other';

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

export type HaulageItemVariant = {
  id: string;
  labelKey: string;
};

export type HaulageItemTemplate = {
  id: string;
  categoryId: HaulageCategoryId;
  titleKey: string;
  subtitleKey: string;
  icon: string;
  variants: HaulageItemVariant[];
};

export type HaulageCategory = {
  id: HaulageCategoryId;
  titleKey: string;
  descriptionKey: string;
  icon: string;
};

export type HaulageFreightItem = {
  clientId: string;
  categoryId: HaulageCategoryId;
  templateId: string;
  variantId: string;
  variantLabelKey: string;
  titleKey: string;
  subtitleKey: string;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  weightKg: number;
  fragile: boolean;
  requiresDisassembly: boolean;
};

export type HaulagePendingItem = {
  templateId: string;
  variantId: string;
};

export type HaulageBookingDraft = {
  categoryId: HaulageCategoryId | null;
  items: HaulageFreightItem[];
  pickup: HaulagePlace | null;
  dropoff: HaulagePlace | null;
  pickupTime: string;
  paymentMethodId: string | null;
};

export type HaulageConfirmation = {
  bookingRef: string;
  estimatedTotalMinor: number;
  currency: string;
  itemCount: number;
  pickupAddress: string;
  dropoffAddress: string;
};
