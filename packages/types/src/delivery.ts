/**
 * Roam Dash Delivery Types
 * Types for the food delivery platform
 */

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
