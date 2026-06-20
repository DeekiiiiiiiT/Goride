export type OfferItem = {
  qty: number;
  name: string;
};

export type SingleOffer = {
  id: string;
  restaurant: string;
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
};

export type StackedOffer = {
  id: string;
  totalEarnings: number;
  totalDistanceKm: number;
  estMinutes: number;
  stops: StackedStop[];
};

export const MOCK_SINGLE_OFFER: SingleOffer = {
  id: 'offer-1',
  restaurant: 'Island Grill',
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
};

export const MOCK_STACKED_OFFER: StackedOffer = {
  id: 'stacked-1',
  totalEarnings: 980,
  totalDistanceKm: 8.2,
  estMinutes: 38,
  stops: [
    {
      id: 'a',
      label: 'A',
      restaurant: 'Island Grill',
      distanceLabel: '1.2 km away',
      earnings: 450,
    },
    {
      id: 'b',
      label: 'B',
      restaurant: 'Juici Patties',
      distanceLabel: '0.4 km from A',
      earnings: 530,
    },
  ],
};
