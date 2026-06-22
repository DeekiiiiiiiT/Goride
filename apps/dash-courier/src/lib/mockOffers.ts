import type { FulfillmentType, VerticalType } from '@roam/types';

export type OfferItem = {
  qty: number;
  name: string;
};

export type SingleOffer = {
  id: string;
  restaurant: string;
  storeName?: string;
  vertical_type?: VerticalType;
  fulfillment_type?: FulfillmentType;
  pickupAddress: string;
  pickupDistanceKm: number;
  dropoffLabel: string;
  dropoffDistanceKm: number;
  totalDistanceKm: number;
  estMinutes: number;
  earnings: number;
  tip: number;
  baseFare: number;
  distanceFare: number;
  peakPay?: number;
  cuisine?: string;
  itemCount: number;
  items: OfferItem[];
  dropoffNotes: string[];
};

export type StackedStop = {
  id: string;
  label: string;
  restaurant: string;
  distanceLabel: string;
  earnings: number;
  vertical?: 'restaurant' | 'grocery';
  detail?: string;
  shopItems?: number;
};

export type StackedOffer = {
  id: string;
  totalEarnings: number;
  totalDistanceKm: number;
  estMinutes: number;
  stops: StackedStop[];
  customerName?: string;
  customerDistanceKm?: number;
};

export const MOCK_SINGLE_OFFER: SingleOffer = {
  id: 'offer-1',
  restaurant: 'Island Grill',
  storeName: 'Island Grill',
  vertical_type: 'restaurant',
  fulfillment_type: 'cook_to_order',
  pickupAddress: '78 Knutsford Blvd, Kingston',
  pickupDistanceKm: 1.2,
  dropoffLabel: 'New Kingston',
  dropoffDistanceKm: 3.8,
  totalDistanceKm: 5.0,
  estMinutes: 22,
  earnings: 520,
  tip: 70,
  baseFare: 350,
  distanceFare: 100,
  cuisine: 'Jamaican',
  itemCount: 4,
  items: [
    { qty: 2, name: 'Jerk Chicken Meal (1/4 Dark)' },
    { qty: 4, name: 'Festival' },
    { qty: 2, name: 'Sorrel Drink' },
  ],
  dropoffNotes: ['Apartment Complex', 'Leave at door'],
};

export const MOCK_DETAILED_OFFER: SingleOffer = {
  ...MOCK_SINGLE_OFFER,
  id: 'offer-detail',
  restaurant: 'Sweetwood Jerk Joint',
  pickupAddress: '78 Knutsford Blvd, Kingston',
  totalDistanceKm: 4.2,
  itemCount: 8,
  peakPay: 75,
};

export const MOCK_GROCERY_OFFER: SingleOffer = {
  id: 'offer-grocery',
  restaurant: 'Fresh Mart',
  storeName: 'Fresh Mart',
  vertical_type: 'grocery',
  fulfillment_type: 'pick_and_pack',
  pickupAddress: 'Half Way Tree Plaza, Kingston',
  pickupDistanceKm: 2.4,
  dropoffLabel: 'Constant Spring',
  dropoffDistanceKm: 3.1,
  totalDistanceKm: 5.5,
  estMinutes: 18,
  earnings: 850,
  tip: 0,
  baseFare: 650,
  distanceFare: 200,
  itemCount: 12,
  items: [
    { qty: 2, name: 'Whole Milk 1L' },
    { qty: 1, name: 'Bananas 2lb' },
    { qty: 1, name: 'Sliced Bread' },
  ],
  dropoffNotes: ['Apartment', 'Leave at door'],
};

export const MOCK_STACKED_OFFER: StackedOffer = {
  id: 'stacked-1',
  totalEarnings: 1420,
  totalDistanceKm: 5.8,
  estMinutes: 42,
  stops: [
    {
      id: 'restaurant',
      label: '1',
      restaurant: 'Island Grill',
      vertical: 'restaurant',
      distanceLabel: '1.2 km',
      earnings: 620,
      detail: 'Ready pickup',
      shopItems: 0,
    },
    {
      id: 'grocery',
      label: '2',
      restaurant: 'Fresh Mart',
      vertical: 'grocery',
      distanceLabel: '2.8 km',
      earnings: 800,
      detail: 'Shop 8 items',
      shopItems: 8,
    },
  ],
  customerName: 'Sarah',
  customerDistanceKm: 1.8,
};
