import { SERVICE_URLS } from '@/lib/siteContent';

export const DASH_CUSTOMER_URL = SERVICE_URLS.dash;
export const DASH_MERCHANT_URL = 'https://merchant.roamdash.co';

export const MERCHANT_KITCHEN_IMAGE =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBze2MB8Ah7WcBMmCLasQTrUq0BxLdyLOtIpNELsw0JwZ8Rv7Vfx-M9AspmgWi9I7BP5p8fJgzffF6n0lXQslu4ffDx0nIfm_uRlSx9ceMi8gy9Gj28yVJ-UalUxLWHM6HmlcTDa9tC289rxpY2JvaPl81SmKN82AmQ4RHv_f0GMFoZxGsw8SouGSi8nde4cp0BJD4K6j7wR8kQDvpJbVbrNKtcjRWzlAhXK48K75icax9SaLtQqo3CvdfZw15faJc7grKJtXReBnVQ';

export const DASH_APP_MOCKUP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuB7BjGQX8eVpVUenbIsC0QC9Lnc_JCFj_c6f-Kc2zDTUckRRGTYAWZTAI2i82aveOaPs3HCDFK2I3K3q7Uq96XdtKdoBON79xQ6sSDpS4yx2kKChWKGb4fRrGGXup4bdg1T0FjlLiBGF2FyaY-Wk-Fi6hoRQi25j7KjrQrFN2sVY3seUrCuu3GzLO_VFf6kqOJdv37F5622jp42hzPvqEnKBQBJiPDqXnrkrSHbToZ1j8HkJt43A6_PMM7AWPBb7_4ygIHLaFSLy2UQ';

export const DASH_PORTAL_MOCKUP =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDbNTDEiWoMBvtT_ZYIjFrsj894_21Sw3qwlvKEFH7ekLMWDJ8vCEEH-x-cqNQ4_NKKID-8acEvGfyX2wMpiiAiBQQ-ptVA_7p-1tF_md7F02ncTiVVpehom4GYXc9ksX9LtFygSPkw7f-joqr-Jgje69xIb4z2GzuRA9A_8vFVOIMKVUsZbM9pgwiQQ5Frng1iq2kgBqxIU6vYsfgiNVExxbQ-mtxU_ls7Srl6wolQui-twmwzxT6TVIUXwodqmXaWxAji1dbuzSqL';

export const CUSTOMER_FEATURES = [
  { title: 'Browse Restaurants', description: 'Curated selection of local culinary excellence.', icon: 'restaurant' as const },
  { title: 'Easy Ordering', description: 'Frictionless interface designed for rapid selection.', icon: 'cart' as const },
  { title: 'Real-time Tracking', description: "Precise updates on your meal's geographic progress.", icon: 'tracking' as const },
  { title: 'Flexible Payment', description: 'Secure processing across multiple digital wallets.', icon: 'payment' as const },
  { title: 'Order History', description: 'Quickly reorder your favorites with a single tap.', icon: 'history' as const },
];

export const MERCHANT_BENEFITS = [
  { title: 'Increase Your Reach', description: 'Connect with thousands of new customers in your region instantly.', icon: 'trending' as const },
  { title: 'Advanced Merchant Dashboard', description: 'Sophisticated analytics and order management at your fingertips.', icon: 'dashboard' as const },
  { title: 'Flexible Commission Structure', description: 'Growth-focused models designed for sustainable profitability.', icon: 'percent' as const },
];

export const CUSTOMER_FLOW = [
  { step: '01', title: 'Browse', description: 'Pick a favorite' },
  { step: '02', title: 'Order', description: 'Seamless checkout' },
  { step: '03', title: 'Track', description: 'Watch it arrive' },
  { step: '04', title: 'Enjoy', description: 'Quality delivered' },
];

export const MERCHANT_FLOW = [
  { step: '01', title: 'Receive', description: 'Instant notification' },
  { step: '02', title: 'Prepare', description: 'Quality focus' },
  { step: '03', title: 'Dispatch', description: 'Sync with fleet' },
  { step: '04', title: 'Earn', description: 'Automated payouts' },
];
