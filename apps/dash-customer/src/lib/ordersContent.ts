import { ISLAND_GRILL } from './restaurantContent';

export type OrderLineItem = {
  quantity: number;
  name: string;
  note?: string;
  price: number;
  menuItemId?: string;
};

export type OrderHistoryEntry = {
  id: string;
  orderNumber: string;
  merchantId: string;
  merchantName: string;
  merchantLogo: string;
  status: 'active' | 'delivered' | 'cancelled';
  trackingStatus?: string;
  items: OrderLineItem[];
  itemSummary: string;
  total: number;
  placedAt: string;
  deliveredAt?: string;
  deliveredLabel?: string;
  eta?: string;
  progress?: number;
  paymentMethod?: string;
  deliveryAddress?: string;
  subtotal?: number;
  deliveryFee?: number;
  serviceFee?: number;
  tax?: number;
  tip?: number;
};

export function isLiveOrderStatus(status: string): boolean {
  return !['completed', 'cancelled', 'delivered'].includes(status.toLowerCase());
}

export const MERCHANT_LOGOS = {
  islandGrill:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAMETp9bYVmga6CRJ5Sqk5LPOYS_ssJ8JUmQj9cUCUAPbV1Bkf7AYqTUU3TSC6HUgu7se5VDzgd2SUcHyEMfdkWbR0P-o42wNsLgglB6kf4NtxcC-qcovNLNiNfstob8cru8rsaq4PvJiGxyU4_rB_s8MO7GjRm14EGfpglLCBCBT_FoWwB3XW-yc7VUthlSpu2-dDQssGSDHFUr3VZEuYiX_L3xeey4dx0iTuV_BFAy2OTJr_WcUSPqbavdqyTZ4dNQwViamGoS2aN',
  beanery:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCUUvQXTi7tC7zLQkPLSyxtIDeZiCpLqX4paixZ8dXDFBHErleOT-yN49YRNrrdByt-KDzzG0EzwraRQ1dxBI91U6MU9ns-G4ab3VkHGVjuvfJQ3ukuPUgYGHa6xwsJ7Vq4BQvdtIVDjhoHEZbK-pWPfx8sQRDEvdkf5CxYVFbmYxzuSYoG_8VjPidKsFh6goM-Y2h-tjEZ-ugcWohV7rPjb27y35i4tlci7ChdX0w7uzKymsyRNRzGklD5bOXbHtuK8EY2EFZENAJL',
  sakura:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDGR8zNrBXLBpZNB67vtPo7qOsK_MBl7G8aG_xniVwqlKnayb2LsPSOkqO_i87JFNZNFPFahS0p4lOgHXz7hdS7yLNrTlZ66JWiWF5JA73TXdkY3tt5V2UWyuS65CkjTDahrs93r04KBZIq2WkF5NEkCwwNZcwpCwlyNfPkr6EbNnyKbSn143p1akkvklqtQowgeICfuXcsO_GAbJaADkUop6bvrhpBh4NMCc8RtPVWmRs-_Q2UpwJ3H62LUWJMc20V1Q71HcXvovxE',
  islandGrillDetail:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuAZjTCsW3fr2W1-1wNPPKHBJbuWs6z6nneNUo9MR0kMHCtKcELVrUP0nTlbzs6OQWLw0Ij4BHiyWhv7tXxPq_tbPi8rZf6kuaPyeouIBPp_9n478tywzfzrCsX5jkM31adYOrTQVWGO4_FDCNBSTAthxsHRRqL2ZJMuzLUypl5DtQChTXciskX33qtWBjOzcoPVB-5HI8UfOyMBumQYsqV8i5lro9VrIMsTkJ251HgytREiiWZoqi88-291lP88oAdzhVIKEgoxPrsk',
};

export const MOCK_ORDERS: OrderHistoryEntry[] = [
  {
    id: '8492',
    orderNumber: '8492',
    merchantId: 'island-grill',
    merchantName: 'Island Grill',
    merchantLogo: MERCHANT_LOGOS.islandGrill,
    status: 'active',
    trackingStatus: 'preparing',
    items: [
      { quantity: 1, name: 'Jerk Chicken Meal', note: 'Large', price: 1350 },
      { quantity: 2, name: 'Festival', price: 300 },
    ],
    itemSummary: '1x Jerk Chicken Meal, 2x Festival...',
    total: 2475,
    placedAt: new Date().toISOString(),
    eta: 'Arriving in 15-25 min',
    progress: 66,
  },
  {
    id: 'beanery-1',
    orderNumber: '7821',
    merchantId: 'the-beanery',
    merchantName: 'The Beanery',
    merchantLogo: MERCHANT_LOGOS.beanery,
    status: 'delivered',
    items: [
      { quantity: 1, name: 'Iced Latte', price: 650 },
      { quantity: 1, name: 'Almond Croissant', price: 600 },
    ],
    itemSummary: '1x Iced Latte, 1x Almond Croissant',
    total: 1250,
    placedAt: new Date().toISOString(),
    deliveredLabel: '9:30 AM',
  },
  {
    id: 'sakura-1',
    orderNumber: '7654',
    merchantId: 'sakura-sushi',
    merchantName: 'Sakura Sushi',
    merchantLogo: MERCHANT_LOGOS.sakura,
    status: 'delivered',
    items: [
      { quantity: 1, name: 'Dragon Roll', price: 1800 },
      { quantity: 1, name: 'Spicy Tuna Maki', price: 1500 },
      { quantity: 2, name: 'Miso Soup', price: 600 },
    ],
    itemSummary: '1x Dragon Roll, 1x Spicy Tuna Maki, 2x Miso Soup',
    total: 4500,
    placedAt: new Date(Date.now() - 86400000).toISOString(),
    deliveredLabel: '7:15 PM',
  },
];

export const ISLAND_GRILL_ORDER_DETAIL: OrderHistoryEntry = {
  id: 'island-delivered',
  orderNumber: '8492',
  merchantId: 'island-grill',
  merchantName: 'Island Grill',
  merchantLogo: MERCHANT_LOGOS.islandGrillDetail,
  status: 'delivered',
  items: [
    { quantity: 1, name: 'Jerk Chicken Meal - Large', note: 'Rice & Peas', price: 1350 },
    { quantity: 2, name: 'Festival', price: 300 },
  ],
  itemSummary: '1x Jerk Chicken Meal - Large, 2x Festival',
  subtotal: 1950,
  deliveryFee: 150,
  serviceFee: 75,
  tax: 100,
  tip: 200,
  total: 2475,
  placedAt: '2024-06-19T14:00:00',
  deliveredAt: '2024-06-19T14:42:00',
  deliveredLabel: 'Delivered on June 19, 2024 at 2:42 PM',
  paymentMethod: 'Visa •••• 4521',
  deliveryAddress: '45 Constant Spring Rd, Apt 12B',
};

export const REORDER_PREVIEW = {
  merchantId: 'island-grill',
  merchantName: 'Island Grill',
  merchantLogo:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuCV_hgPE-oKi9XlNpsL0xE_Zb04wYgVup6F2yH3z1KrDsom3WxSz2njW1cBHDwHFVWQL6uBVjkAk6hNW27gigraKXc2oWTRRSlOAkEOGi84nDku61OFmS0TnBDrf_NHj8SEqOeoxY9G-CdTz9y2U147tS1QgUBOBWo72IJYJg7qshFk6iYALJS1ONjYHu0ql-cl_1p8-3dgR2DSLx9i92DdXlsvI9ZcjTjJbB79yMd44QKoNwsgmobBcwl2Xz7UabsO9zxRVLRQ2Rhk',
  distance: '1.2 mi away',
  items: [
    { quantity: 1, name: 'Jerk Chicken Meal', note: 'Rice & Peas, Steamed Veg', price: 1350 },
    { quantity: 2, name: 'Festival', price: 300 },
  ],
  estimatedTotal: 1950,
};

export function getOrderById(orderId?: string): OrderHistoryEntry | undefined {
  if (!orderId) return undefined;
  if (orderId === 'island-delivered' || orderId === 'island-grill-detail') {
    return ISLAND_GRILL_ORDER_DETAIL;
  }
  return MOCK_ORDERS.find(o => o.id === orderId || o.orderNumber === orderId);
}

/** Map GET /orders/:id payload into OrderHistoryEntry for details UI. */
export function mapApiOrderToDetails(order: Record<string, unknown>): OrderHistoryEntry {
  const merchant = (order.merchant as Record<string, unknown>) ?? {};
  const statusRaw = String(order.status ?? '');
  const active = !['completed', 'cancelled', 'delivered'].includes(statusRaw);
  const itemsRaw = (order.items as Array<Record<string, unknown>>) ?? [];

  const items: OrderLineItem[] = itemsRaw.map((item) => {
    const modifiers = item.modifiers as Array<Record<string, unknown>> | undefined;
    const options = item.options as Array<Record<string, unknown>> | undefined;
    const noteFromMods = modifiers?.map((m) => String(m.name ?? '')).filter(Boolean).join(', ');
    const noteFromOpts = options
      ?.flatMap((o) => {
        const sels = (o.selections as Array<Record<string, unknown>>) ?? [];
        return sels.map((s) => String(s.name ?? ''));
      })
      .filter(Boolean)
      .join(', ');
    return {
      quantity: Number(item.quantity ?? 1),
      name: String(item.name ?? 'Item'),
      note: noteFromMods || noteFromOpts || undefined,
      price: Number(item.price ?? item.unitPrice ?? 0),
    };
  });

  const deliveredAt = order.delivered_at ? String(order.delivered_at) : undefined;
  const placedAt = String(order.created_at ?? order.placed_at ?? new Date().toISOString());
  const deliveredLabel = deliveredAt
    ? `Delivered on ${new Date(deliveredAt).toLocaleString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })}`
    : statusRaw === 'cancelled'
      ? 'Cancelled'
      : active
        ? undefined
        : 'Delivered';

  return {
    id: String(order.id ?? ''),
    orderNumber: String(order.order_number ?? order.id ?? ''),
    merchantId: String(order.merchant_id ?? merchant.id ?? merchant.slug ?? ''),
    merchantName: String(merchant.name ?? 'Restaurant'),
    merchantLogo: String(merchant.logo_url ?? ''),
    status: statusRaw === 'cancelled' ? 'cancelled' : active ? 'active' : 'delivered',
    trackingStatus: active ? statusRaw : undefined,
    items,
    itemSummary: items.map((i) => `${i.quantity}x ${i.name}`).join(', '),
    total: Number(order.total ?? 0),
    placedAt,
    deliveredAt,
    deliveredLabel,
    paymentMethod: order.payment_method ? String(order.payment_method) : undefined,
    deliveryAddress: order.delivery_address ? String(order.delivery_address) : undefined,
    subtotal: Number(order.subtotal ?? 0),
    deliveryFee: Number(order.delivery_fee ?? 0),
    serviceFee: Number(order.platform_fee ?? 0),
    tax: Number(order.tax ?? 0),
    tip: Number(order.tip ?? 0),
  };
}

export type ReorderLine = {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
};

/** Build cart lines from a live order detail (menu item UUIDs when present). */
export function buildReorderFromOrder(order: OrderHistoryEntry, rawItems?: Array<Record<string, unknown>>): ReorderLine[] {
  if (rawItems?.length) {
    return rawItems.map((item) => ({
      itemId: String(item.menuItemId ?? item.id ?? item.item_id ?? ''),
      name: String(item.name ?? 'Item'),
      price: Number(item.price ?? item.unitPrice ?? 0),
      quantity: Number(item.quantity ?? 1),
      imageUrl: item.image_url ? String(item.image_url) : undefined,
    })).filter((line) => line.itemId);
  }
  // Fallback: name-only lines without menu UUIDs — skip to avoid invalid checkout
  return [];
}

export function groupOrdersByDate(orders: OrderHistoryEntry[]): { label: string; orders: OrderHistoryEntry[] }[] {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  const groups = new Map<string, OrderHistoryEntry[]>();

  for (const order of orders) {
    const date = new Date(order.placedAt);
    let label: string;
    if (isSameDay(date, today)) label = 'Today';
    else if (isSameDay(date, yesterday)) label = 'Yesterday';
    else {
      label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    const existing = groups.get(label) ?? [];
    existing.push(order);
    groups.set(label, existing);
  }

  return Array.from(groups.entries()).map(([label, groupOrders]) => ({ label, orders: groupOrders }));
}

export function buildReorderCartItems() {
  const jerk = ISLAND_GRILL.items.find(i => i.id === 'jerk-chicken-meal')!;
  const festival = ISLAND_GRILL.items.find(i => i.id === 'festival-3')!;
  return [
    { item: jerk, quantity: 1, merchantName: ISLAND_GRILL.name },
    { item: festival, quantity: 2, merchantName: ISLAND_GRILL.name },
  ];
}

export const ORDER_FEEDBACK_CHIPS = [
  { label: 'Fast delivery', issueType: null },
  { label: 'Great food', issueType: null },
  { label: 'Friendly courier', issueType: null },
  { label: 'Item missing', issueType: 'missing' },
  { label: 'Wrong item', issueType: 'wrong' },
  { label: 'Cold food', issueType: 'quality' },
  { label: 'Damaged', issueType: 'quality' },
] as const;

export const ISSUE_CHIPS = ORDER_FEEDBACK_CHIPS.filter((chip) => chip.issueType).map(
  (chip) => chip.label,
);

export function issueTypeFromChips(chips: string[]): string | null {
  for (const label of chips) {
    const match = ORDER_FEEDBACK_CHIPS.find((chip) => chip.label === label && chip.issueType);
    if (match?.issueType) return match.issueType;
  }
  return null;
}

export function splitFeedbackChips(chips: string[]): { positive: string[]; issues: string[] } {
  const positive: string[] = [];
  const issues: string[] = [];
  for (const label of chips) {
    const match = ORDER_FEEDBACK_CHIPS.find((chip) => chip.label === label);
    if (match?.issueType) issues.push(label);
    else if (match) positive.push(label);
  }
  return { positive, issues };
}

export function buildOrderReceiptText(order: OrderHistoryEntry): string {
  const lines = [
    'Roam Rush receipt',
    `Order ${order.orderNumber}`,
    order.merchantName,
    `Placed ${new Date(order.placedAt).toLocaleString()}`,
    '',
    ...order.items.map((item) => {
      const note = item.note ? ` (${item.note})` : '';
      return `${item.quantity}x ${item.name}${note}  J$${item.price.toLocaleString()}`;
    }),
    '',
    order.subtotal != null ? `Subtotal  J$${order.subtotal.toLocaleString()}` : '',
    order.deliveryFee != null ? `Delivery  J$${order.deliveryFee.toLocaleString()}` : '',
    order.serviceFee != null ? `Platform fee  J$${order.serviceFee.toLocaleString()}` : '',
    order.tax ? `Tax  J$${order.tax.toLocaleString()}` : '',
    order.tip != null ? `Tip  J$${order.tip.toLocaleString()}` : '',
    `Total  J$${order.total.toLocaleString()}`,
    order.paymentMethod ? `Paid with ${order.paymentMethod}` : '',
    order.deliveryAddress ? `Delivered to ${order.deliveryAddress}` : '',
  ];
  return lines.filter((line) => line !== '').join('\n');
}

export function downloadOrderReceipt(order: OrderHistoryEntry): void {
  const blob = new Blob([buildOrderReceiptText(order)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Roam-Rush-${order.orderNumber}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export type ReceiptShareResult = 'shared' | 'downloaded' | 'copied' | 'cancelled';

/** Share sheet first (phones), then file download, then clipboard. */
export async function shareOrderReceipt(order: OrderHistoryEntry): Promise<ReceiptShareResult> {
  const text = buildOrderReceiptText(order);
  const title = `Roam Rush receipt ${order.orderNumber}`;

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return 'cancelled';
    }
  }

  try {
    downloadOrderReceipt(order);
    return 'downloaded';
  } catch {
    /* fall through to copy */
  }

  await navigator.clipboard.writeText(text);
  return 'copied';
}
