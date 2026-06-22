/**
 * Roam Dash Delivery Types
 * Types for the food delivery platform
 */

export type MerchantVerificationStatus =
  | 'pending'
  | 'in_review'
  | 'docs_requested'
  | 'approved'
  | 'rejected';

export type MerchantOperationalStatus = 'active' | 'suspended' | 'deactivated';

export type CustomerAccountStatus = 'active' | 'suspended';

export type DisputeStatus = 'open' | 'investigating' | 'resolved' | 'refunded' | 'denied';

export type MerchantDocumentType =
  | 'id_front'
  | 'id_back'
  | 'proof_of_business'
  | 'liquor_license'
  | 'pharmacy_permit';

/** All valid merchant document types for admin + API validation. */
export const MERCHANT_DOCUMENT_TYPES = [
  'id_front',
  'id_back',
  'proof_of_business',
  'liquor_license',
  'pharmacy_permit',
] as const satisfies readonly MerchantDocumentType[];

export const BASE_MERCHANT_DOCUMENT_TYPES = [
  'id_front',
  'id_back',
  'proof_of_business',
] as const satisfies readonly MerchantDocumentType[];

export type VerticalType =
  | 'restaurant'
  | 'grocery'
  | 'pharmacy'
  | 'alcohol'
  | 'convenience'
  | 'retail';

export type FulfillmentType = 'cook_to_order' | 'pick_and_pack';

export type CategoryTaxonomyKey = 'cuisine' | 'inventory_category' | 'none';

export type ComplianceTier = 'standard' | 'regulated';

export type GoLiveRule = 'menu_min_5' | 'catalog_imported' | 'pos_connected';

/** Admin-managed business type with vertical metadata. */
export interface MerchantBusinessTypeConfig {
  id: string;
  section_id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  vertical_type: VerticalType;
  fulfillment_type: FulfillmentType;
  required_document_types: MerchantDocumentType[];
  category_taxonomy_key: CategoryTaxonomyKey;
  category_tags: string[];
  default_prep_time_mins: number;
  max_delivery_radius_km: number;
  compliance_tier: ComplianceTier;
  go_live_rule: GoLiveRule;
}

export interface MerchantBusinessTypeSectionConfig {
  id: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  types: MerchantBusinessTypeConfig[];
}

export type MerchantDocumentStatus = 'pending' | 'approved' | 'rejected';

/** Legacy slug ids; catalog may include additional types from admin. */
export type MerchantBusinessType =
  | 'restaurant'
  | 'cafe'
  | 'bakery'
  | 'fast_food'
  | 'grocery'
  | 'convenience'
  | 'pharmacy'
  | 'alcohol'
  | 'other'
  | string;

export type MerchantOnboardingStatus = 'draft' | 'submitted';

export type PartnerWizardStepKey =
  | 'restaurant-info'
  | 'categories'
  | 'location'
  | 'business-details'
  | 'contact-hours'
  | 'verification'
  | 'bank-details';

/** Serializable partner wizard draft (no File blobs). */
export interface PartnerOnboardingDraft {
  restaurantName?: string;
  phone?: string;
  email?: string;
  businessType?: MerchantBusinessType | '';
  cuisineTypes?: string[];
  inventoryCategories?: string[];
  location?: {
    lat?: number;
    lng?: number;
    streetAddress?: string;
    city?: string;
    postalCode?: string;
    formattedAddress?: string;
  } | null;
  streetAddress?: string;
  city?: string;
  postalCode?: string;
  addressSearch?: string;
  businessRegistrationNumber?: string;
  taxId?: string;
  avgPrepTime?: string;
  deliveryRadius?: string;
  ownerFullName?: string;
  description?: string;
  website?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  bankName?: string;
  accountHolderName?: string;
  accountType?: 'checking' | 'savings';
  idFrontDoc?: { id: string; docType: string; status: string; fileName?: string } | null;
  idBackDoc?: { id: string; docType: string; status: string; fileName?: string } | null;
  proofOfBusinessDoc?: { id: string; docType: string; status: string; fileName?: string } | null;
  hours?: Array<{ open: string; close: string; isClosed: boolean }>;
}

export interface Merchant {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  address: string;
  lat?: number;
  lng?: number;
  phone?: string;
  email?: string;
  cuisineType?: string;
  cuisineTypes?: string[];
  city?: string;
  postalCode?: string;
  businessType?: MerchantBusinessType;
  verticalType?: VerticalType;
  fulfillmentType?: FulfillmentType;
  goLiveRule?: GoLiveRule;
  businessRegistrationNumber?: string;
  taxId?: string;
  ownerFullName?: string;
  verificationStatus?: MerchantVerificationStatus;
  verificationNotes?: string | null;
  rejectionReason?: string | null;
  submittedAt?: string;
  onboardingStatus?: MerchantOnboardingStatus;
  wizardStep?: number;
  wizardStepKey?: PartnerWizardStepKey | null;
  onboardingDraft?: PartnerOnboardingDraft;
  lastOnboardingActivityAt?: string | null;
  businessHours: BusinessHours;
  isActive: boolean;
  isVerified: boolean;
  isAcceptingOrders: boolean;
  avgPrepTimeMins: number;
  minOrderAmount: number;
  deliveryFee: number;
  deliveryRadiusKm: number;
  commissionRate: number;
  rating: number;
  totalRatings: number;
  createdAt: string;
  updatedAt: string;
}

export interface MerchantDocument {
  id: string;
  merchantId: string;
  docType: MerchantDocumentType;
  status: MerchantDocumentStatus;
  filePath: string;
  rejectionReason?: string | null;
  uploadedAt: string;
  verifiedAt?: string | null;
}

export interface MerchantBankAccountMasked {
  id: string;
  merchantId: string;
  bankName: string;
  accountHolderName: string;
  accountLast4: string;
  routingNumberLast4?: string | null;
  accountType: 'checking' | 'savings';
  isDefault: boolean;
  isVerified: boolean;
}

export interface MerchantApplicationPayload {
  name: string;
  description?: string;
  phone: string;
  email: string;
  address: string;
  streetAddress?: string;
  city?: string;
  postalCode?: string;
  lat: number;
  lng: number;
  businessType?: MerchantBusinessType;
  cuisineTypes?: string[];
  inventoryCategories?: string[];
  cuisineType?: string;
  avgPrepTimeMins?: number;
  deliveryRadiusKm?: number;
  businessRegistrationNumber?: string;
  taxId?: string;
  ownerFullName?: string;
  ownerName?: string;
  logoUrl?: string;
  coverImageUrl?: string;
  website?: string;
}

export interface MerchantBankAccountInput {
  bankName: string;
  accountHolderName: string;
  accountNumber: string;
  routingNumber?: string;
  accountType: 'checking' | 'savings';
}

export interface BusinessHours {
  [dayOfWeek: string]: {
    open: string;
    close: string;
    isClosed: boolean;
  };
}

export interface MenuCategory {
  id: string;
  merchantId: string;
  name: string;
  description?: string;
  sortOrder: number;
  isActive: boolean;
}

export interface MenuItem {
  id: string;
  merchantId: string;
  categoryId?: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  isFeatured: boolean;
  prepTimeMins?: number;
  calories?: number;
  options: MenuItemOption[];
  createdAt: string;
  updatedAt: string;
}

export interface MenuItemOption {
  name: string;
  required: boolean;
  maxSelections: number;
  choices: MenuItemChoice[];
}

export interface MenuItemChoice {
  name: string;
  price: number;
}

export type OrderStatus = 
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'completed'
  | 'cancelled';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface DeliveryOrder {
  id: string;
  orderNumber: string;
  customerId: string;
  merchantId: string;
  courierId?: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  platformFee: number;
  tax: number;
  tip: number;
  discount: number;
  total: number;
  deliveryAddress: string;
  deliveryLat?: number;
  deliveryLng?: number;
  deliveryInstructions?: string;
  estimatedPrepTimeMins?: number;
  estimatedDeliveryAt?: string;
  placedAt: string;
  acceptedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  cancelledBy?: 'customer' | 'merchant' | 'courier' | 'system';
  merchantNotes?: string;
  courierNotes?: string;
  customerRating?: number;
  customerReview?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  options?: OrderItemOption[];
  total: number;
}

export interface OrderItemOption {
  name: string;
  choice: string;
  price: number;
}

export interface DeliveryCustomer {
  id: string;
  userId: string;
  name: string;
  phone?: string;
  email?: string;
  defaultAddress?: string;
  defaultLat?: number;
  defaultLng?: number;
  savedAddresses: SavedAddress[];
  createdAt: string;
  updatedAt: string;
}

export interface SavedAddress {
  id: string;
  label: string;
  address: string;
  lat?: number;
  lng?: number;
  instructions?: string;
}

export interface OrderEvent {
  id: string;
  orderId: string;
  status: OrderStatus;
  actorType?: 'customer' | 'merchant' | 'courier' | 'system';
  actorId?: string;
  notes?: string;
  locationLat?: number;
  locationLng?: number;
  createdAt: string;
}

export interface CourierAvailability {
  id: string;
  driverId: string;
  isOnline: boolean;
  currentLat?: number;
  currentLng?: number;
  lastLocationUpdate?: string;
  activeOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Cart {
  id: string;
  customerId: string;
  merchantId: string;
  items: CartItem[];
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  itemId: string;
  merchantId: string;
  name: string;
  price: number;
  quantity: number;
  options?: OrderItemOption[];
  imageUrl?: string;
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  placed: 'Order Placed',
  accepted: 'Accepted',
  preparing: 'Preparing',
  ready: 'Ready for Pickup',
  picked_up: 'Picked Up',
  in_transit: 'On the Way',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['picked_up', 'cancelled'],
  picked_up: ['in_transit'],
  in_transit: ['delivered'],
  delivered: ['completed'],
  completed: [],
  cancelled: [],
};
