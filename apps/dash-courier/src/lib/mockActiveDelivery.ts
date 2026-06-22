export type ChecklistItem = {
  id: string;
  label: string;
  note?: string;
  image?: string;
  status?: 'pending' | 'found' | 'substitute';
  substituteLabel?: string;
};

export type DropoffMethod = 'leave-at-door' | 'hand-to-customer';

export type DeliveryEarnings = {
  basePay: number;
  distanceBonus: number;
  tip: number;
  peakPay: number;
  total: number;
};

import type { FulfillmentType, VerticalType } from '@roam/types';

export type ActiveDelivery = {
  orderId: string;
  displayOrderId: string;
  /** @deprecated Use storeName */
  restaurant: string;
  storeName?: string;
  vertical_type?: VerticalType;
  fulfillment_type?: FulfillmentType;
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
  storeName: 'Island Grill',
  vertical_type: 'restaurant',
  fulfillment_type: 'cook_to_order',
  pickupAddress: '12 Hope Road, Kingston',
  pickupAddressFull: '124 Tropical Breeze Blvd, Kingston 10',
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
    { id: '1', label: 'Jerk Chicken Plate x2', note: 'Rice & Peas, Steamed Veg' },
    { id: '2', label: 'Festival x2' },
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

const FRESH_MART_LOGO =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBP-tcKCLTbWjTFuL2KmtpiadKJxSCDArgf6CIXdtSVJlsPKRAMxJd7dqjjtFyuD-xc_WvhnXcKa7BUa7EFlPbX6PhtorMHqk5AL0Ka_bfJS8RTK5jLlyamY2SjTxx2D58Dtngu84ththYdHyrdYgt9SY8sVz6PJuyoTmPucByjfAg1ZBakBSb-7Ml3ONjswmkllVkLcj-cNX-H0etkK0pYfYIGTpQ8aaRc0nDOYt_18N8at-N8-Me5f9_Dxitz--je3fkeuqaNS5Q';

export const MOCK_GROCERY_PICK_DELIVERY: ActiveDelivery = {
  orderId: 'RD-2091',
  displayOrderId: '9102',
  restaurant: 'Fresh Mart',
  storeName: 'Fresh Mart',
  vertical_type: 'grocery',
  fulfillment_type: 'pick_and_pack',
  pickupAddress: 'Half Way Tree, Kingston',
  pickupAddressFull: 'Half Way Tree Plaza, Kingston 10',
  customerName: 'Sarah M.',
  customerFirstName: 'Sarah',
  dropoffAddress: '45 Constant Spring Road, Apt 12B',
  gateCode: '1234',
  unit: 'Apt 12B',
  deliveryInstructions: 'Leave at door',
  etaMinutes: 8,
  distanceKm: 2.4,
  dropoffEtaMinutes: 18,
  dropoffDistanceKm: 3.1,
  dropoffTurnDistance: '400m',
  dropoffTurnInstruction: 'Turn left onto Constant Spring Rd',
  turnInstruction: 'Head north on Hagley Park Rd',
  itemCount: 7,
  checklist: [
    {
      id: 'milk',
      label: 'Whole Milk 1L',
      status: 'found',
      image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuARBMmF9UfNs_AA3CoeISHoplBrDXrUyzA5Lwxjkc490MEQN7GDJ_cB6kwT3e1w7PHEtiUv6iWNOgEfcPZWlNMZ8I5lbAYoQ49Zgth8-CqXGh9kQxQ9KDa2fUJtR7Ek0zHsEdhMmrEcU55XaXOer80g3GrqFhKB2XztPUrnKZk3D5qfQAzGh9tigGDLm32V3OBi0uYKUY-Mztu8nei4UGmcCBnY8ihToGnRabdwyrL5lEpWAfG2Wqly7qB4VO0gO-eBWhOcriuyOGc',
    },
    {
      id: 'bananas',
      label: 'Bananas 2lb',
      status: 'substitute',
      substituteLabel: 'Skim Milk 1L',
      image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuAOfiyHe70jvA6cuR8UgFji5k3umoIVo4Q_C50hKpgQLU1GIz5935Qxc4GqEyYgpVuf5NGoXhNSvSbCnRfl1piC1wMMw4TJjPayrThYdlkaUzgv6Uo4aXOhSrK3GqpyDcKFuBpH-5nVIkT1ZGELJhhtT2ZL-5m05YGqIoHtzA4ym-4SZHtD_I33IYhGAC6KFk2ijEw8TX4bf6WDBsPNpQaLkDXI986FI3ibBN4aXPizk4oGO8g8W3k8-YlrIRJHzXpq1y_ae8EueAU',
    },
    {
      id: 'bread',
      label: 'Bread',
      note: 'Aisle 4 · Bakery',
      status: 'pending',
      image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBuldpUwdWtNssYo1yDt2f-ChRJgReYd4DBIXP37y4R7_2uzGgeedyZwEOQse3BpyZQ0O1DKGPa6kzuZyQgjDAXKBHwRUBIGzs8ab6ej9U5DJ4BVJ_rVsdkpDCLqLDxFA6MggFLIojcDvN6cIn8FHrhhEbeKiHWFZp8H396iCh7thOOL70obUpMdvJ5N-veaZpqnh98Oc4NmOl1ictfkxcK1PSija4J_v8PKZ8JrdrLneoHTa-ISO9M1SpJmzpLtWPgOlFuHujzzF4',
    },
  ],
  earnings: {
    basePay: 650,
    distanceBonus: 120,
    tip: 80,
    peakPay: 0,
    total: 850,
  },
  tripDistanceKm: 5.5,
  tripMinutes: 25,
};

export { FRESH_MART_LOGO };

const NAV_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuAK91A9SN3bQEQA2IKVJOUcLa1l8rbNRvF_MyXQ3PkGNxctc-nzgJ86bCcHz81avCyCVdNTJF0A9ACmWqH63VTqo3557AzL59FnMajxfDyZ_k1mOWOFe3Jbe4HwiQ8XcdUyBiBN4e81YC0LJuR7OO1zUjrIjn7IhqTfwewT3IUgnfKbDgQMGHOUIjFzTucJxGbeBaVd8hUVF6Tezpq7Ph2G_BNIzVa203n88tIoMKyXqBvqc9RV3VfhoatmjYY_juKurXlvYudZzrw';

const EN_ROUTE_MAP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBoRbuNnQW2kOBYWnfvFyQLfzO65NVZc_JTeav7UdcPm_bTvXwv26OE8brvqnBasdRCKLK5dvBwQtyKHctAqXgh0mbLbqpgs_xcmJg4t0ammQ7eGbXSaPnYUkaEmckt-Oz8fjydMdThm04f6qdXinwwmMfJj349_AS0tnGHyAmXGRFGZ-tGdpIEarTLQ2TlpsVtEKdXbvesp9XEQeP--mMGbvBNH6uipTeW2RA3h9ZXXxgEFqN-Yt0Q9KOjabHkvAuBq7Znfz0qAFE';

const CUSTOMER_AVATAR =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBY0vwkl6Tr55tHhKEZ4lNfJwdiExwiGGI1ib9505WZ7snOMrBfd6KXRzFfjDG3zpl1U-bjVGKpS9wuaZn6R-WIpIoLHqR4u62JH0ziBNuBB-hZAI_otQ_J3JNWpFwu5BCViXAK9blZ1wb5vdBYy-EXxknw941TLsOQ9Dd1j2hBMBP7hRJe3BUhnKZnxzV2AFo7Z7Y7Qu2rK2bdU_P5vHNH0C849MVhuKsD3GGy57KOzBPr3FI3Fy331w5ThgFurZq2FcQtGyBOhSI';

export { NAV_MAP, EN_ROUTE_MAP, CUSTOMER_AVATAR };
