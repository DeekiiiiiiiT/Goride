export type DiscoverRestaurant = {
  id: string;
  name: string;
  cuisines: string;
  rating: number;
  eta: string;
  delivery: string;
  distance?: string;
  priceLevel?: string;
  image: string;
  emoji?: string;
  promoted?: boolean;
  tags?: string[];
};

export const PROMO_BANNERS = [
  {
    id: 'welcome',
    title: 'FREE DELIVERY',
    subtitle: 'on your first order',
    code: 'WELCOME',
    className: 'bg-primary-container text-on-primary-container',
    codeClassName: 'bg-on-primary-container text-primary-container',
  },
  {
    id: 'save20',
    title: '20% OFF',
    subtitle: 'orders over $30',
    code: 'SAVE20',
    className: 'bg-secondary-container text-on-secondary-container',
    codeClassName: 'bg-on-secondary-container text-secondary-container',
  },
  {
    id: 'daily',
    title: 'Daily Deals',
    subtitle: 'Up to 50% off selected restaurants',
    code: '',
    className: 'bg-tertiary-container text-on-tertiary-container',
    codeClassName: '',
  },
] as const;

export const CUISINE_CHIPS = [
  { id: 'all', label: 'All', emoji: '🍽️' },
  { id: 'jamaican', label: 'Jamaican', emoji: '🇯🇲' },
  { id: 'pizza', label: 'Pizza', emoji: '🍕' },
  { id: 'fast-food', label: 'Fast Food', emoji: '🍔' },
  { id: 'chinese', label: 'Chinese', emoji: '🥡' },
  { id: 'indian', label: 'Indian', emoji: '🍛' },
  { id: 'healthy', label: 'Healthy', emoji: '🥗' },
  { id: 'cafe', label: 'Cafe', emoji: '☕' },
  { id: 'desserts', label: 'Desserts', emoji: '🍰' },
  { id: 'breakfast', label: 'Breakfast', emoji: '🍳' },
] as const;

export const HOME_CATEGORY_CHIPS = [
  { id: 'all', label: 'All', className: 'bg-surface-container-highest text-on-surface' },
  { id: 'sushi', label: 'Sushi', className: 'bg-[#F59E0B]/10 text-[#B45309] border border-[#F59E0B]/20' },
  { id: 'vegan', label: 'Vegan', className: 'bg-[#10B981]/10 text-[#047857] border border-[#10B981]/20' },
  { id: 'burgers', label: 'Burgers', className: 'bg-[#EF4444]/10 text-[#B91C1C] border border-[#EF4444]/20' },
  { id: 'desserts', label: 'Desserts', className: 'bg-[#3B82F6]/10 text-[#1D4ED8] border border-[#3B82F6]/20' },
  { id: 'healthy', label: 'Healthy', className: 'bg-surface-container-highest text-on-surface' },
] as const;

export const FEATURED_RESTAURANTS: DiscoverRestaurant[] = [
  {
    id: 'burger-spot',
    name: 'The Burger Spot',
    cuisines: 'American • Burgers • Fast Food',
    rating: 4.9,
    eta: '15-25 min',
    delivery: 'Free',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBuQCwelBRegj7R5NNpZSyFL7RvbIyoi8DjdCcm0zBmM2DSYs31d7UpFzCZ31smVRJE5ueGblxnMBHFBpprwUUU2SNv3_OTfFa3x-ucKeasbzsovgIItWEuR2EX1ZrTE3OGEvDKY9axPcVXVaLYEUYtYnun6Q-FCMb7VuU_8vFhu6Xndg54lGt46TgHoQqI_k2YXxJMwBPnKugwm5qXeNrQ9a5R2kFel5WlxTPL3OiOFeqafHoucmPjw9bNBZKAyabAVM0Dbb3K7lGH',
    emoji: '🍔',
  },
  {
    id: 'island-grill',
    name: 'Island Grill Authentic',
    cuisines: 'Jamaican • Grill • Local',
    rating: 4.7,
    eta: '30-45 min',
    delivery: 'J$200',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAvOVBVyt_50C1nyMG95vJCUk-gfl1ei1I2Yt-oQvrvrwMhbS2maif7dJp1qimFAK-gv4c1-9dsmYFsRvCg1wHZp55oaDvWFWpI3FecCcDv7-bV_cIRBGTVBkQtpd0NLWwotqY4c-z7hmMY9uQ3mx2NWZsAexpCztEtbIWJkkcMQeZt7v47wQfWhfWwgiumBsDuGL5AhIjzDDpG_zOqGX2UGaASoRsYm-vkQnqApPlyl5ksJbHgCVP742d1qA7X4rc7aznwQOw1Ly3Y',
    emoji: '🍗',
  },
];

export const POPULAR_RESTAURANTS: DiscoverRestaurant[] = [
  {
    id: 'marios-pizza',
    name: "Mario's Authentic Pizzeria",
    cuisines: 'Italian • Pizza • Pasta',
    rating: 4.8,
    eta: '25-35 min',
    delivery: 'J$150 fee',
    distance: '1.2 km',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCCcWGFLXX34Jhy412zamNYlUO89RDB3Va6bNdfndB1jcioHsrX9VtXLBcQscB0mVVfQ_fWiCJPJqq1LNd2No1hibm9ba3mqBFjiwVEkanbI-OV90cL6at0ZFr3OehSx5QuQFpAtLOeuv2VPmHHaUWsi0Z3EQaVzXS8U3c9IcToLiIyjeVynXkgRFyBazeoks5OoHjeoFHvy_1n663KYZu-mfa0uDkiG25NnZq4seemfg5ZpKz_t3PmuNU3xyk2GpYsE_16AenHC4bR',
    promoted: true,
  },
  {
    id: 'green-life',
    name: 'Green Life Bowls',
    cuisines: 'Healthy • Salads • Vegan Options',
    rating: 4.6,
    eta: '15-25 min',
    delivery: 'J$100 fee',
    distance: '0.8 km',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAgDcGJ6NE53jq6Gq7wMTaKe_P80Ha-ya5NdcsrcJCDsJ46ZpqnlLwasiT2n4SK8GGVujbKUoQdEc76-UAb4ZEPhDeFbYp8ewoNfI3flqmp6bnuYANPjkMqTKjy1vfx4FLzso4bccCjvNoEyPTcRQx56n8T_bHiiuwIdKbiE2ktaGmx4d1JkdasZjMQAKTxucss5aqWMEFeIHZWYeRSscR7WMJYliRCoaNQhg-PzI2fyNFi1LN9rywAEWR7VIH3FTtw2dQJBXNeZuMA',
  },
];

export const RECOMMENDED_RESTAURANTS = [
  {
    id: 'greenery-cafe',
    name: 'The Greenery Cafe',
    meta: '$ • Healthy, Brunch',
    eta: '20-30 min',
    rating: 4.9,
    deliveryNote: '',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuC95IwJ-rVIpEyNdnujYGzzcYWdV4krZoNBbUYm6K7figvQ7EXDVsO2qlgOra5ZqRfNVDeDvxiynacMeDq2vXkPk5lJDIWHf_Dclk4FjNDZresxCGzpp2yRX72cr6lm4uAk4aKxO3OXAzBu-DZIbaH7Fvl59_TmfNq6k49eZVUPyruGrpfQAkEf3gbsVnWes0gzz7zQ2I9jI7R6vyBa-A5RPRv_ETqP5VWmAOHARsBsDGOTHiRC4vMVGDmwZcA5wbF2ItPboGtNP052',
    large: true,
  },
  {
    id: 'smash-bros',
    name: 'Smash Bros',
    meta: 'Burgers, American',
    eta: '',
    rating: 0,
    deliveryNote: 'Free Delivery',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCXNhblggfCjbaMTHTY9FDg8vpjuKXdjAqajH6rR-pGnSVOsx0ZXetTGxk7XV7QFk2SoLc5L3shBCphfjtFYdHexW7NkLfHeoYtOyulVRuo0miUBBtNzg20qpeQDa4ll4exGtRew4pVUMJj00lk8KvlWIQ2lDx-0Eio_WSl7GowGzvUWpDbeibDr25JpZjur69I1FJqsuBRReSk-f-uw5G9nVE4Ty8oAlzdEgl4vARUdE0YXNLBb2dkJChx1DN6P-3bXNubuOC8zpoF',
    large: false,
  },
  {
    id: 'acai-roots',
    name: 'Acai Roots',
    meta: 'Smoothies, Healthy',
    eta: '15-25 min',
    rating: 0,
    deliveryNote: '',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDYIWLr9ZmXW5Y8bXBulgx2pWfB5PK07WhSf5-TCR8TLQFWCugYmowb6xp0dH-XNSJYCeMdKV5YNEjzuP3FIFdycZTbCt5ytqLRTCIRzRAk3jCdIeEaaivRSPOCUITebTt00CjtJClVqb1A41yctR4-5N8FzFwbOT-Ak4_rpb3qqaHAHVB2p3awvwPaMxJxYuaTt9N5iy8PCh6rkGLVZ85e77zANr2mLKZltUcGi1ajvTudtN9w3pR1uD7TXi02UGfJy5xiw0RdV-9W',
    large: false,
  },
] as const;

export const SEARCH_RESULTS: DiscoverRestaurant[] = [
  {
    id: 'oceanside-sushi',
    name: 'Oceanside Sushi Bar',
    cuisines: 'Japanese • Sushi • $$$',
    rating: 4.8,
    eta: '35-45 min',
    delivery: '$2.99 Delivery',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCrGKt-QHQlEsddE1qHufc7Ss1YzJ6E3OhjKXo2HviQnLDzHe6rCap8RvE_ZODS5-qbLj-U3NO3jZrkztw6gbLaFbUaG_DShMxG45PfPhxJRzfYqobd6cMKiy5I9anCA8Jr6EI0WKngOmgc-hAu7pLuXs_h10kJtv7Ut9xjr4XXN0-3SwJ0-GRedTr84olXxa2D43GD_9H2BAFxHObTzmOEnsjrkj2EMD709yfQqD_AS5JcqzxqtDobGpsZEJMlNZcvG-bod49oqM1X',
    tags: ['Popular', '$2.99 Delivery'],
  },
  {
    id: 'aloha-poke',
    name: 'Aloha Poke Fresh',
    cuisines: 'Hawaiian • Healthy • $$',
    rating: 4.6,
    eta: '20-30 min',
    delivery: 'Free Delivery',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuChD8glvbnSuowkOeN8gkhK6pMTTZIUlArOER31KWeXvWdt5s0lKQM9894h0dieyIE6koUbEvny_2yAFCYAt80DY7459_OA0DRv_tiHrCRqUfoZ63HAdxuJwlVCRQNzz6MZhL0ySRaGjvvCaFyK-JFLDqgoTLwPJBrLsRIh_7CJhGS7rz4h3CGHqPihesI-k-NYqMVFNAOJRMreTV0vNfWbMnPcy_JB1uL9m_BVyeTf8ip75uk5GkVj8BMByQdxQIz3yJDwOsKkJMZe',
    tags: ['Free Delivery'],
  },
];

export const RECENT_SEARCHES = ['Jerk chicken', 'Pizza', 'Island Grill'];

export const TRENDING_SEARCHES = [
  { label: 'Pizza', icon: 'local_pizza' },
  { label: 'Sushi', icon: 'ramen_dining' },
  { label: 'Burgers', icon: 'lunch_dining' },
  { label: 'Vegan', icon: 'eco' },
  { label: 'Dessert', icon: 'icecream' },
];

export const BROWSE_CATEGORIES = [
  {
    label: 'Healthy',
    count: '74 places',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAb_WWgKNreKSCuUG78Zz3b_LSiAk72AlozTdsgX-DCOc5XRfIpoU-DmwhZWtsp9L4lOsx2KAMU75otQc4Fqc3YbwLJQj0RE4wam2z59tcUJsFypd_9zEQQ65lhqPreP4PJTECtMxZMVvBrdeRtkWJGzTVwuMv8rlxO0wj2CwPtdSDBdCdUOVedXf6LwCakYcdUJpDuNNwPDr18aDtlDlZhPkDQj4N7A7wbjiGdEyxLX_qFY9JUmISDtdm5ORbLg-uS7yLGJcFeBiqq',
    large: true,
  },
  {
    label: 'Asian',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuA5VxTfiHEHatElaV1oEVh-4ISzAkyIjldiE3_Z1zVyLDZe6LnUm-gXdMCW8Jtlk_fR3JqVZxyEvw-Kt5poK1M5wK5Xk3Qc_BKwl7Z6i0cJo8RtiPNopEwXST3QgRw7jG1jgPDgbtDZXioeAo-LCgTah5yLqAWwzMavrBIGPU4pd8jYnSzZDODQVnOpCgBs3ORXmh5ueYlHWM7ypwnxBo65Tvj5pufy3_xSJhoqJIgF4KQP5OZ12mgpZUsyOSZOdXqK7M9CikzJBLSo',
    large: false,
  },
  {
    label: 'Breakfast',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDE1nOC1zd9C8XyNtFugEtFyZasG_kz8m0hp3roLPQJOogAo_L2cBMavCwR-pthN_iUvXm0_P7QDNydMNzk7FfmGSbg1nmEgPUfiKQ668lLka5kJTBfBDhco3AYnP_yj60iA7GQKX4tjXHmOyWpn4XjVJGeJ-qqQPxjbcG0wBUbcnmcAXh7XJHW6MlR7PPUyVAJEgDIvUeU5VJgizi3Mi_3JHqDFkhPpNvJrnuQ4zgBh8X6bK7ebzsKkuj-qciZXSGHk7WWAEZsS3Ff',
    large: false,
  },
  {
    label: 'Comfort Food',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDLmeNHXzc4eAY4R-_HFxxMpY-1d0zHPK2gm7iqwDhsOSTa3R-pneFX3O3H45pzmnl8Z6mjz9Y-SFtohRR9X8qV8RuUqqdcbNeQjMt5qrnYLTzaJ2bic7AllDs0oXrGCn0EHR7aizK36aXYjeC8cRRI9hACAGcdgcT1XQF9jAbOvgABcXL4oRWTl0r5gV2fg3llr_apj-CueMqP8DJ9ESakAzz4_eNiNDDIQa_3ypHCGjjydXM09xoLTj_PODVRT9sd-T_Yf2WGz6NR',
    large: false,
  },
];

export type CategoryRestaurant = {
  id: string;
  name: string;
  cuisines: string;
  rating: number;
  eta: string;
  deliveryFee: string;
  offer?: string;
  image: string;
};

export type CategoryPageData = {
  id: string;
  title: string;
  subtitle: string;
  heroImage: string;
  restaurants: CategoryRestaurant[];
};

export const CATEGORY_PAGES: Record<string, CategoryPageData> = {
  pizza: {
    id: 'pizza',
    title: 'Artisanal Pizza',
    subtitle: 'Wood-fired perfection delivered hot to your door.',
    heroImage:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBj8zvHQH1bPLBfSpv1yCdZmOmu7QjOPpgQ9lZcgFkQZJoewcKriLsHfkMfnymEya47Or-pX_d--fl6J1bJzUcae2xudT9kknz_HxXCGrUYAB4K3YqNzpn_5hK7QXMrda0KOcgVVxx8b4HLYL8xyB6R1s8azKCHBqUNzrQBZjgMswVqhRJebNyoHkUgn9wVNa6ZNZiEmiEsiIiwG_oJFSNgPu-tmFinxZOkKFTQuEDUV7p98Fr7vzyjszZiWylSfvqKsyD3sPqjIJfz',
    restaurants: [
      {
        id: 'luigis-oven',
        name: "Luigi's Oven",
        cuisines: 'Italian • Wood-fired Pizza • $$',
        rating: 4.8,
        eta: '15-25 min',
        deliveryFee: 'J$450 Fee',
        offer: 'Free Item',
        image:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuD2xv4t6GdUE6gPLqkpUvfY1-cJVVY8_0iGXqHkfnpsGlgxDnaxvMSoQfRgVRLU5q0VhoVne4_6F150p8Zlft5zD7eBAKKMTyw2aDqOfGc2eEeSgDnFftijN_LaGSxyw2ySjjnrpn01wgWx282h25xTipHnmd0uPAvWPzytEd1ctpzO43pVETjJDHfF3bIQZXGfPNKLAJR040U9YuguyVSarqWasNrlwiElTMo2q0flFQaUA-TlfP7wLhynKVh26sOklOk1bXiiExef',
      },
      {
        id: 'chi-town-deep-dish',
        name: 'Chi-Town Deep Dish',
        cuisines: 'Pizza • Comfort Food • $$',
        rating: 4.5,
        eta: '30-45 min',
        deliveryFee: 'J$750 Fee',
        image:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuAFbE_9E-3XFNhWwCam6m7IOkjJ7vUPSLXUmkwjR4OG6de69u1cZQcw1S_xiZGeJ5___BRA6dthHZuON_Px2DmgpioMR5BtVl781OhPMOP9KGCMTRQg1lhSsvxcx7J5yIVS3qFe3O8XtYI2Y4pqjADeDEM6BxtsbCY2CYy5CLiLmHl-IVvKbtwnNCXZyjJhxvUU9o2TchN_e-tzAB63QwwXT_S8-1ZMLJEJjOqFkfGDdjiw5ubaGk-S0txoUX4x73pwUGYl7h8Bja09',
      },
      {
        id: 'slice-project',
        name: 'The Slice Project',
        cuisines: 'Gourmet Pizza • Salads • $$$',
        rating: 4.9,
        eta: '20-35 min',
        deliveryFee: 'Free Delivery (DashPass)',
        image:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuAo6kKBeKPGgWUBRF2S6Eko6vgFcbr7dQDW0VPsPDCLzCDBVsLeS8_wtVbm-F9EqfTu6W32CEZxijEHICUftONV24Ir9211u9RWLJfAVwHQQLhi5nxmhvDWhNoRt2a9bdu3GXwe7Dga8M8Cia1b89v4Stc96dMF3u5ALH-gmK_sg9wwSpGojJgRbD43lfqkm6qT5vPcK3whrgoaAtApnR65KKgyqlix4r2IPb0FtAAO4wqNW3GUajbrJlQP47fmcq8zM2k0Dr7FeVRE',
      },
    ],
  },
};

export function getCategoryPage(categoryId: string): CategoryPageData | null {
  return CATEGORY_PAGES[categoryId] ?? null;
}
