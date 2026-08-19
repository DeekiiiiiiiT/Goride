import type { ActiveDelivery } from '@/lib/mockActiveDelivery';

export type CachedDelivery = {
  orderId: string;
  restaurant: string;
  customerName: string;
  dropoffAddress: string;
  dropoffNote: string;
  lastUpdated: string;
};

export const MOCK_CACHED_DELIVERY: CachedDelivery = {
  orderId: '4429',
  restaurant: 'Burger King',
  customerName: 'Marcus',
  dropoffAddress: '12 Hope Rd',
  dropoffNote: 'Apt 4B, call upon arrival',
  lastUpdated: '2 min ago',
};

export function mapActiveDeliveryToCached(delivery: ActiveDelivery): CachedDelivery {
  return {
    orderId: delivery.displayOrderId || delivery.orderId,
    restaurant: delivery.storeName || delivery.restaurant,
    customerName: delivery.customerFirstName || delivery.customerName,
    dropoffAddress: delivery.dropoffAddress,
    dropoffNote: delivery.deliveryInstructions || '',
    lastUpdated: 'just now',
  };
}

