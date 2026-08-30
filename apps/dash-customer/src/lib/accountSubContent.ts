export type FavoriteRestaurant = {
  id: string;
  merchantId: string;
  name: string;
  cuisines: string;
  rating: number;
  eta: string;
  deliveryFee: string;
  image: string;
};

export type FavoriteItem = {
  id: string;
  name: string;
  merchantName: string;
  price: number;
  image: string;
  merchantId: string;
  itemId: string;
};

export const FAVORITE_RESTAURANTS: FavoriteRestaurant[] = [
  {
    id: 'gbk',
    merchantId: 'burger-kitchen',
    name: 'Gourmet Burger Kitchen',
    cuisines: 'American • Burgers • $$',
    rating: 4.8,
    eta: '20-30 min',
    deliveryFee: 'Free delivery',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBX3AO8TISRSnYCLWz1hKNEgJMOZ6C38QlreVTRb63JkeoVMVqG0uRRpnYlpRO5qy7hJJXd-VpgIFsAqtqndPg5L03C2CE-QbFFF0D4H5Vkkfyldeqdt7TRHI4-gDQArkCrtupwGkcA7JmItcmlQjBxZwO25_dIFajk35x678bD_x1yqHIctZU083lDIuSI-ONfBYticvffrZ71ZcnVzO0KK3FJ-Wj_mOvtjjUUhCmh6xA1_Xlbqq9jXSX-jOi2PUDFg2ueZgLtP1rO',
  },
  {
    id: 'sakura',
    merchantId: 'sakura-sushi',
    name: 'Sakura Sushi House',
    cuisines: 'Japanese • Sushi • $$$',
    rating: 4.9,
    eta: '35-45 min',
    deliveryFee: 'J$299 delivery',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDp52tVqcCEcz2llOJjiCK412SvZZkE6XlBmTFJPTnwCDOh5EL6O2Yv60iYwm80TbKamEYiiPmcozJWE0TlP03qViHLqGBXgvgHZC5ZxsrfAUwCkBYmfIU9dEs-7z0UiLDhyCxNArrFs7sMJhgZQHNXLRWDdOxaxn2oq3nzw4eiK5lYzqBI8pDMeK7J7F45_Ur7ROJTTJamwRbxz8Z4SbhzOPMuiwfGyGdvEuno49Iyftw46w9n96ognjpSRw4p6n7mniFqeaNY6hkj',
  },
];

export const FAVORITE_ITEMS: FavoriteItem[] = [
  {
    id: 'acai',
    itemId: 'acai-bowl',
    merchantId: 'healthy-blends',
    name: 'Berry Acai Bowl',
    merchantName: 'Healthy Blends',
    price: 1199,
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCzPGU-mg5-Gle1UDScaKbPMj6RelmV3xGIeo_cRWRQc82ssAZ9nI4pDoDM4jtSX9xn8mk1HykKolfXXmbAwJosvJpI5sfbKQ-0sy9vZGCtCkky9Sc46RgTdNYk4cdiuQ2xeq8ZcWqJG7aP_FUnlUGkPwbkjTPF51nYYi21pu4RrCw5gxJTiud2cOWKXugtFaevh7AJNji5n_shgHGAo97ujOBdKaRSOHu252UFCrIYzSWzVmXlEruOUyPsb2m9BvqPrHIiZO5J54F0',
  },
  {
    id: 'ramen',
    itemId: 'tonkotsu-ramen',
    merchantId: 'sakura-sushi',
    name: 'Tonkotsu Ramen',
    merchantName: 'Sakura Sushi House',
    price: 1650,
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDq8S5BP0dpOPSAyjhwm5k67Su_Z0nHOhU6WJFaHkmG9EaiUD-gBlAVzr78LT19c8nYDKhlg7oi4QR3YWv8QkPLXJ5axKeMSaiA4Rw4eJ9oCkq7uRISajOPSI938T5unC0rPXs6tliBR5tmO75iYQc4X-NgWEHfMkY271-5UhzIbIuPQlmPuc5jIucor8DplYPibvqf2vTuGf0zU2FS1-YwBQFJZm9O8hBocxQMOCbDazZ6fNenhT2Os2modHXKXeQWYQFGNp9rwEoZF',
  },
  {
    id: 'latte',
    itemId: 'iced-latte',
    merchantId: 'the-beanery',
    name: 'Artisan Iced Latte',
    merchantName: 'Daily Grind Coffee',
    price: 550,
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBInkPHx3qe7WuCCg9DeFyafTlwDrGedZySY45CU50hUk8IGVRjJhYbxN53Z058wXicytH_i7aTGn39R2NpwamcwKlx563bgHcgO16RRHDmXxKAWPjhEGC35GcbVMxlI8rz_WZwbySJAhEWn3JC4cG37eirLoYxycPF0vhMQLmUyfhiC4HD7LbFMDxpFn_hGQACL9-IY6gtitTC9ajWrhGs6Oqa3NmQUMvYAkHIl6AFhU733qeYort2IKNhtwXolD-JDPFqoAzPDdBT',
  },
];

export const ACTIVE_PROMOS = [
  {
    code: 'WELCOME',
    title: 'Free delivery',
    detail: 'Expires in 3 days',
    icon: 'local_shipping',
  },
  {
    code: 'LUNCH20',
    title: '20% off lunch orders',
    detail: 'Valid until 2 PM today',
    icon: 'restaurant',
  },
] as const;

export const EXPIRED_PROMOS = [
  { code: 'SUMMER10', status: 'Expired', detail: 'Expired Aug 31' },
  { code: 'FREESIDE', status: 'Redeemed', detail: 'Used on Oct 12' },
] as const;

export const FAQ_ITEMS = [
  {
    id: 'tracking',
    topic: 'order',
    title: 'Delivery & Tracking',
    body: 'Open Orders and tap an active order to see live tracking. You can call or message the courier once they are assigned. After delivery, rate the order from the same screen.',
  },
  {
    id: 'refunds',
    topic: 'order',
    title: 'Refunds & Cancellations',
    body: 'You can cancel from tracking before the restaurant starts preparing. After that, use Order Help to report a problem. Refunds for paid orders are reviewed by support.',
  },
  {
    id: 'account-login',
    topic: 'account',
    title: 'Sign-in & profile',
    body: 'Use Google to sign in. Name, phone, and email are saved on Edit Profile. If you cannot get in, report an account issue from this Help screen and we will look it up.',
  },
  {
    id: 'account-addresses',
    topic: 'account',
    title: 'Saved addresses',
    body: 'Addresses live under Account → Addresses. Set a default pin so checkout and couriers use the right drop-off. You can add Home, Work, or Other.',
  },
  {
    id: 'payment-charge',
    topic: 'payment',
    title: 'Charges & refunds',
    body: 'WiPay charges happen on their hosted checkout. Cash is collected by the courier when available. If you were charged twice or the amount looks wrong, report a payment issue from this screen with the order number.',
  },
  {
    id: 'payment-methods',
    topic: 'payment',
    title: 'Cards & payment methods',
    body: 'Choose WiPay or cash as your default under Account → Payment Methods. Cards are saved during hosted checkout — there is no separate Add Card form.',
  },
  {
    id: 'safety-courier',
    topic: 'safety',
    title: 'Courier safety',
    body: 'If something feels unsafe during delivery, stay inside, do not share extra personal details, and report a safety issue from this screen. Call local emergency services if you are in immediate danger.',
  },
  {
    id: 'safety-food',
    topic: 'safety',
    title: 'Food safety',
    body: 'Report spilled, unsealed, or spoiled food as a safety issue on the order. Take a photo if you can. Support reviews these before a refund is issued.',
  },
  {
    id: 'pass',
    topic: 'payment',
    title: 'Roam Rush Pass',
    body: 'Rush Pass gives half service fee at Growth and Dominant, plus free delivery within ~8 km up to your monthly delivery credit. Subscribe under Account → Rush Pass.',
  },
  {
    id: 'promos',
    topic: 'payment',
    title: 'Promos & Credits',
    body: 'Enter a partner promo code in Cart or Promotions. Invalid or expired codes are rejected before you pay. Credits are applied by support when a report is resolved.',
  },
] as const;

export const HELP_QUICK_ACTIONS = [
  { id: 'order', icon: 'receipt_long', label: 'Order Help' },
  { id: 'account', icon: 'person', label: 'Account Issues' },
  { id: 'payment', icon: 'credit_card', label: 'Payment Issues' },
  { id: 'safety', icon: 'health_and_safety', label: 'Safety' },
] as const;

export type HelpTopicId = (typeof HELP_QUICK_ACTIONS)[number]['id'];

export function faqsForTopic(topic: string | null, query = ''): typeof FAQ_ITEMS[number][] {
  const q = query.trim().toLowerCase();
  return FAQ_ITEMS.filter((item) => {
    if (topic && item.topic !== topic) return false;
    if (!q) return true;
    return item.title.toLowerCase().includes(q) || item.body.toLowerCase().includes(q);
  });
}

export const ISSUE_TYPES = [
  { id: 'missing', icon: 'shopping_bag', label: 'Missing items' },
  { id: 'wrong', icon: 'swap_horiz', label: 'Wrong items' },
  { id: 'quality', icon: 'restaurant', label: 'Food quality' },
  { id: 'payment', icon: 'credit_card', label: 'Payment' },
  { id: 'safety', icon: 'health_and_safety', label: 'Safety' },
  { id: 'account', icon: 'person', label: 'Account' },
  { id: 'other', icon: 'help_outline', label: 'Other' },
] as const;

export type NotificationPrefs = {
  orderUpdates: boolean;
  promotions: boolean;
  newRestaurants: boolean;
  personalizedPicks: boolean;
  emailNewsletters: boolean;
  smsUpdates: boolean;
};

const NOTIF_KEY = 'roam-dash-notification-prefs';

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  orderUpdates: true,
  promotions: true,
  newRestaurants: false,
  personalizedPicks: true,
  emailNewsletters: true,
  smsUpdates: true,
};

export function mergeNotificationPrefs(partial?: Partial<NotificationPrefs> | null): NotificationPrefs {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(partial ?? {}) };
}

export function getNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    return raw
      ? mergeNotificationPrefs(JSON.parse(raw) as Partial<NotificationPrefs>)
      : DEFAULT_NOTIFICATION_PREFS;
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

export function saveNotificationPrefs(prefs: Partial<NotificationPrefs>): void {
  try {
    localStorage.setItem(NOTIF_KEY, JSON.stringify({ ...getNotificationPrefs(), ...prefs }));
  } catch {
    // ignore
  }
}

export type PaymentAltPrefs = {
  cashOnDelivery: boolean;
  digitalWallets: boolean;
};

const PAYMENT_ALT_KEY = 'roam-dash-payment-alt';

export function getPaymentAltPrefs(): PaymentAltPrefs {
  try {
    const raw = localStorage.getItem(PAYMENT_ALT_KEY);
    return raw ? (JSON.parse(raw) as PaymentAltPrefs) : { cashOnDelivery: true, digitalWallets: false };
  } catch {
    return { cashOnDelivery: true, digitalWallets: false };
  }
}

export function savePaymentAltPrefs(prefs: Partial<PaymentAltPrefs>): void {
  try {
    localStorage.setItem(PAYMENT_ALT_KEY, JSON.stringify({ ...getPaymentAltPrefs(), ...prefs }));
  } catch {
    // ignore
  }
}
