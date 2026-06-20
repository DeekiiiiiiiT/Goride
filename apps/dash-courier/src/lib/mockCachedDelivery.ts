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
