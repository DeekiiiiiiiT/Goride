export type ChecklistItem = {
  id: string;
  label: string;
  note?: string;
};

export type DropoffMethod = 'leave-at-door' | 'hand-to-customer';

export type DeliveryEarnings = {
  basePay: number;
  distanceBonus: number;
  tip: number;
  peakPay: number;
  total: number;
};

export type ActiveDelivery = {
  orderId: string;
  displayOrderId: string;
  restaurant: string;
  pickupAddress: string;
  pickupAddressFull: string;
  customerName: string;
  customerFirstName: string;
  dropoffAddress: string;
  gateCode: string;
  unit: string;
  deliveryInstructions: string;
  etaMinutes: number;
  distanceKm: number;
  dropoffEtaMinutes: number;
  dropoffDistanceKm: number;
  dropoffTurnDistance: string;
  dropoffTurnInstruction: string;
  turnInstruction: string;
  itemCount: number;
  checklist: ChecklistItem[];
  earnings: DeliveryEarnings;
  tripDistanceKm: number;
  tripMinutes: number;
};

export const MOCK_ACTIVE_DELIVERY: ActiveDelivery = {
  orderId: 'RD-1042',
  displayOrderId: '8492',
  restaurant: 'Island Grill',
  pickupAddress: '12 Hope Road, Kingston',
  pickupAddressFull: '1428 Kingston Blvd, Suite 2',
  customerName: 'Sarah M.',
  customerFirstName: 'Sarah',
  dropoffAddress: '45 Constant Spring Road, Apt 12B',
  gateCode: '1234',
  unit: 'Apt 12B',
  deliveryInstructions: "Gate code: 1234. Leave at door, don't knock.",
  etaMinutes: 6,
  distanceKm: 1.8,
  dropoffEtaMinutes: 12,
  dropoffDistanceKm: 4.1,
  dropoffTurnDistance: '300m',
  dropoffTurnInstruction: 'Turn right onto Constant Spring Rd',
  turnInstruction: 'In 200m, turn right onto Hope Road',
  itemCount: 8,
  checklist: [
    { id: '1', label: 'Jerk Chicken Meal x2', note: 'With rice and peas' },
    { id: '2', label: 'Festival x4' },
    { id: '3', label: 'Sorrel Drink x2' },
  ],
  earnings: {
    basePay: 350,
    distanceBonus: 100,
    tip: 70,
    peakPay: 0,
    total: 520,
  },
  tripDistanceKm: 4.1,
  tripMinutes: 18,
};

const NAV_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAK91A9SN3bQEQA2IKVJOUcLa1l8rbNRvF_MyXQ3PkGNxctc-nzgJ86bCcHz81avCyCVdNTJF0A9ACmWqH63VTqo3557AzL59FnMajxfDyZ_k1mOWOFe3Jbe4HwiQ8XcdUyBiBN4e81YC0LJuR7OO1zUjrIjn7IhqTfwewT3IUgnfKbDgQMGHOUIjFzTucJxGbeBaVd8hUVF6Tezpq7Ph2G_BNIzVa203n88tIoMKyXqBvqc9RV3VfhoatmjYY_juKurXlvYudZzrw';

const EN_ROUTE_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBoRbuNnQW2kOBYWnfvFyQLfzO65NVZc_JTeav7UdcPm_bTvXwv26OE8brvqnBasdRCKLK5dvBwQtyKHctAqXgh0mbLbqpgs_xcmJg4t0ammQ7eGbXSaPnYUkaEmckt-Oz8fjydMdThm04f6qdXinwwmMfJj349_AS0tnGHyAmXGRFGZ-tGdpIEarTLQ2TlpsVtEKdXbvesp9XEQeP--mMGbvBNH6uipTeW2RA3h9ZXXxgEFqN-Yt0Q9KOjabHkvAuBq7Znfz0qAFE';

const CUSTOMER_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBY0vwkl6Tr55tHhKEZ4lNfJwdiExwiGGI1ib9505WZ7snOMrBfd6KXRzFfjDG3zpl1U-bjVGKpS9wuaZn6R-WIpIoLHqR4u62JH0ziBNuBB-hZAI_otQ_J3JNWpFwu5BCViXAK9blZ1wb5vdBYy-EXxknw941TLsOQ9Dd1j2hBMBP7hRJe3BUhnKZnxzV2AFo7Z7Y7Qu2rK2bdU_P5vHNH0C849MVhuKsD3GGy57KOzBPr3FI3Fy331w5ThgFurZq2FcQtGyBOhSI';

export { NAV_MAP, EN_ROUTE_MAP, CUSTOMER_AVATAR };
