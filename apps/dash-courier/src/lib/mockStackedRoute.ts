export type StackedStopId = 'p1' | 'p2' | 'd1' | 'd2';

export type StackedRouteStop = {
  id: StackedStopId;
  type: 'pickup' | 'delivery';
  name: string;
  address: string;
  orderId: string;
  customerName?: string;
  expectedBy?: string;
  itemCount?: number;
  instructions?: string;
  earnings: number;
  etaMinutes?: number;
  nextPreview?: string;
  distanceToNextKm?: number;
  rating?: number;
};

export type StackedSummaryLeg = {
  id: StackedStopId;
  label: string;
  customerName: string;
  earnings: number;
  rating?: number;
  ratingPending?: boolean;
};

export const STACKED_ROUTE_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuCZLCoJ59zeef8sON2TXRlDs8agTViMUYkHSTp7y0Bu1PvpVcSucj8Kjss3Owx1C0BbfQ07osxUeOb-lGmOsMw8Yko87vjTF3x0iB7BIThAGv0yGRpgDZ6nyf9Qm4E-o2O_mVJmOK8_Mtv2ycNcPshV3-U3YiSjtE08B3kvyD_52WBb5RtRR21EJatwWBsbVxrfx6HfgO4xSeoLEnLkQYAOQlxlN91PXOVrxNi8DqJMLFmd3ZYMLONQ8r80Rf_VsDDlMwnsXUr3Kc0';

export const STACKED_DELIVER_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuC9yzP3Fj1eqD5gNhlFTvuTcaW7qq_8Lez6cSzNZkFUKaDO2jDekNQ-51qwENku_KACdSMA6Vm9MeBH74lEHTmZslEzEFCMWKJcr675hD8u0G8XUGXuqedmuz7gXmB8PsB1d2OO8j_uJ82tdbAB75BfkMwjqMhvmUggSKovdOIZbuDinIrzSHWqd4l6vvTfS5yaPuVwDvoCiZvMS50la_aas0Cp-nRb455RNErX2Bl2Gnb0-AWZiCLRKlvU4u9xmOHUByZlwNdu0NA';

export const MOCK_STACKED_ROUTE: StackedRouteStop[] = [
  {
    id: 'p1',
    type: 'pickup',
    name: 'Island Grill',
    address: '12 Hope Road, Kingston',
    orderId: 'IG-1041',
    expectedBy: '12:30 PM',
    earnings: 0,
  },
  {
    id: 'p2',
    type: 'pickup',
    name: 'Juici Patties',
    address: '123 Main St',
    orderId: 'JP-992',
    expectedBy: '12:45 PM',
    earnings: 0,
  },
  {
    id: 'd1',
    type: 'delivery',
    name: "Sarah's Order",
    address: '12 Hope Rd, Apt 4B',
    orderId: 'RD-1041',
    customerName: 'Sarah',
    itemCount: 3,
    instructions: 'Leave at door',
    earnings: 520,
    etaMinutes: 3,
    nextPreview: 'Then deliver to Marcus',
    distanceToNextKm: 1.2,
  },
  {
    id: 'd2',
    type: 'delivery',
    name: "Marcus's Order",
    address: '45 Constant Spring Rd, Apt 8A',
    orderId: 'RD-1042',
    customerName: 'Marcus',
    itemCount: 4,
    instructions: 'Hand to customer',
    earnings: 600,
    etaMinutes: 8,
  },
];

export const MOCK_STACKED_SUMMARY = {
  totalEarnings: 1120,
  deliveries: 2,
  distanceKm: 5.4,
  legs: [
    {
      id: 'd1' as const,
      label: 'Order 1 (Sarah)',
      customerName: 'Sarah',
      earnings: 520,
      rating: 5,
    },
    {
      id: 'd2' as const,
      label: 'Order 2 (Marcus)',
      customerName: 'Marcus',
      earnings: 600,
      ratingPending: true,
    },
  ] satisfies StackedSummaryLeg[],
};

export function getStopIndex(id: StackedStopId): number {
  return MOCK_STACKED_ROUTE.findIndex((s) => s.id === id);
}

export function getCompletedStopIds(stopIndex: number): StackedStopId[] {
  return MOCK_STACKED_ROUTE.slice(0, stopIndex).map((s) => s.id);
}
