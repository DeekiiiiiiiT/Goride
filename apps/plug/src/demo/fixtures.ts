export type DemoStation = {
  id: string;
  name: string;
  brand: string;
  lat: number;
  lng: number;
  pcode: string;
  parish: string;
  prices: Record<string, number>;
  price_updated_at: string;
  capabilities: string[];
};

export type DemoPlace = {
  id: string;
  name: string;
  brand: string | null;
  kind: string;
  lat: number;
  lng: number;
  pcode: string;
  details: Record<string, unknown>;
};

export type DemoVehicle = {
  id: string;
  nickname: string;
  year: number;
  catalog_variant_id: string | null;
  starting_odometer: number;
  make: string;
  model: string;
};

export type DemoPin = {
  id: string;
  name: string;
  status: 'pending' | 'verified';
  kind: string;
  lat: number;
  lng: number;
  pcode: string;
};

const now = '2026-10-24T12:00:00.000Z';

export const DEMO_STATIONS: DemoStation[] = [
  {
    id: 'demo-total',
    name: 'DEMO Total Half-Way-Tree',
    brand: 'Total',
    lat: 18.0128,
    lng: -76.7967,
    pcode: 'JM-SA',
    parish: 'St Andrew',
    prices: { e10_87: 214.5, e10_90: 229.1, diesel: 201.4 },
    price_updated_at: now,
    capabilities: ['restroom', 'air_pump'],
  },
  {
    id: 'demo-fesco',
    name: 'DEMO Fesco Beechwood',
    brand: 'Fesco',
    lat: 18.0172,
    lng: -76.8024,
    pcode: 'JM-SA',
    parish: 'St Andrew',
    prices: { e10_87: 208.2, e10_90: 224.0, diesel: 198.5 },
    price_updated_at: now,
    capabilities: ['air_pump'],
  },
  {
    id: 'demo-rubis',
    name: 'DEMO Rubis Cross Roads',
    brand: 'Rubis',
    lat: 18.0075,
    lng: -76.7928,
    pcode: 'JM-SA',
    parish: 'St Andrew',
    prices: { e10_87: 215.0, e10_90: 230.2, diesel: 203.0 },
    price_updated_at: now,
    capabilities: ['car_wash'],
  },
];

export const DEMO_PLACES: DemoPlace[] = [
  {
    id: 'demo-mechanic',
    name: 'DEMO Hope Road Mechanic',
    brand: null,
    kind: 'mechanic',
    lat: 18.016,
    lng: -76.789,
    pcode: 'JM-SA',
    details: { hours: 'Mon–Sat' },
  },
  {
    id: 'demo-parts',
    name: 'DEMO Parts Store Liguanea',
    brand: null,
    kind: 'parts_store',
    lat: 18.0185,
    lng: -76.774,
    pcode: 'JM-SA',
    details: {},
  },
  {
    id: 'demo-facility',
    name: 'DEMO Mandela Park Restroom',
    brand: null,
    kind: 'restroom',
    lat: 18.014,
    lng: -76.791,
    pcode: 'JM-SA',
    details: {},
  },
];

export const DEMO_PARISHES = [
  { pcode: 'JM-SA', name: 'St Andrew' },
  { pcode: 'JM-KS', name: 'Kingston' },
  { pcode: 'JM-SC', name: 'St Catherine' },
];

export const DEMO_TOLLS = [
  { id: 'demo-portmore', name: 'DEMO Portmore', highway: 'Highway 2000', prices: { class1: 240 } },
  { id: 'demo-spanish', name: 'DEMO Spanish Town', highway: 'Highway 2000', prices: { class1: 170 } },
];

export const DEMO_PARTS = [
  { id: 'demo-brake', name: 'DEMO Front brake pads', category: 'Brakes', tier: 1 },
  { id: 'demo-rotor', name: 'DEMO Brake rotor', category: 'Brakes', tier: 2 },
  { id: 'demo-oil', name: 'DEMO Oil filter', category: 'Engine', tier: 1 },
];

export const DEMO_TASKS = [
  { op_code: 'oil', name: 'Oil change', due_km: 5000, status: 'due_soon' },
  { op_code: 'brakes', name: 'Front brakes', due_km: 20000, status: 'upcoming' },
];

export function seedVehicle(): DemoVehicle {
  return {
    id: 'demo-car',
    nickname: 'DEMO 2019 Toyota Roomy',
    year: 2019,
    catalog_variant_id: 'demo-variant',
    starting_odometer: 84210,
    make: 'Toyota',
    model: 'Roomy',
  };
}

export function seedPins(): DemoPin[] {
  return [
    {
      id: 'demo-pin-pending',
      name: 'DEMO Pending mechanic',
      status: 'pending',
      kind: 'mechanic',
      lat: 18.02,
      lng: -76.81,
      pcode: 'JM-SA',
    },
    {
      id: 'demo-pin-live',
      name: 'DEMO Approved restroom',
      status: 'verified',
      kind: 'restroom',
      lat: 18.01,
      lng: -76.8,
      pcode: 'JM-SA',
    },
  ];
}
