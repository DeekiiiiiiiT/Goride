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

export const FAQ_CATEGORIES = [
  'Delivery & Tracking',
  'Refunds & Cancellations',
  'Roam Dash Pass',
  'Promos & Credits',
] as const;

export const HELP_QUICK_ACTIONS = [
  { id: 'order', icon: 'receipt_long', label: 'Order Help', page: 'report-issue' },
  { id: 'account', icon: 'person', label: 'Account Issues' },
  { id: 'payment', icon: 'credit_card', label: 'Payment Issues' },
  { id: 'safety', icon: 'health_and_safety', label: 'Safety' },
] as const;

export const REPORT_ISSUE_ORDERS = [
  {
    id: '84729',
    merchantName: 'Kiku Sushi Bar',
    detail: 'Delivered today, 12:45 PM • Order #84729',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCvLbh4mFwJ1qcqh-cbjIgLBbqux__aW8Q9U35KduVso3afZR5VO23XfKczFJaUZZFtcpJa25H6uV-0TRg7doP6RYiZdrQ-e_tGif_nSsx8z0Svml7Nyvh1c00zQ_U6gdeS-cvHWU0azCQG8v932WqzdFipI6LY26hT1j-TibLQYsdXkb9hMkNAQYhYFPBUuQbUN3EAcEr6Y0RNaw9QodjYXwGS_QkwMlTuSrl-Ed5vglO3O8VAzuNCGrCFDk-faUCcyRdDsdkkG2oJ',
    selected: true,
  },
  {
    id: '84610',
    merchantName: 'The Burger Joint',
    detail: 'Oct 24 • Order #84610',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDI_X0U7y_dHuPxJqJxuoR_0FiaSBy6g8oUv2CSDxr0NfA4j3ES4Wg6RQrlmvbY7MXgxdlYXWTnXZ3VIZkhwze1RWCazScuc_nOdIaJc--s44ugkdboVDN_hWCZXTMRkNhgdq3OiYF7DakoATORdXBZ0VuqEkXCMcOUgWB2necv4ksM7wgItkHNhLO2SFM9_4MsAkCKnCG7x8CauASYnUiGElyC5h9VHcJn0Nac6cQcLhokF_Ohbmm9JTji36o5LX_MSy-B59sH2wJx',
    selected: false,
  },
];

export const ISSUE_TYPES = [
  { id: 'missing', icon: 'shopping_bag', label: 'Missing items' },
  { id: 'wrong', icon: 'swap_horiz', label: 'Wrong items' },
  { id: 'quality', icon: 'restaurant', label: 'Food quality' },
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
  smsUpdates: false,
};

export function getNotificationPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(NOTIF_KEY);
    return raw ? { ...DEFAULT_NOTIFICATION_PREFS, ...(JSON.parse(raw) as Partial<NotificationPrefs>) } : DEFAULT_NOTIFICATION_PREFS;
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
