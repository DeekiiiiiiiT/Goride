export type MenuModifierOption = {
  id: string;
  label: string;
  price: number;
};

export type MenuModifierGroup = {
  id: string;
  title: string;
  required: boolean;
  type: 'radio' | 'checkbox' | 'chips';
  options: MenuModifierOption[];
};

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  categoryId: string;
  badge?: string;
  featured?: boolean;
  modifiers: MenuModifierGroup[];
};

export type RestaurantProfile = {
  id: string;
  name: string;
  cuisines: string;
  rating: number;
  ratingCount: number;
  eta: string;
  distance: string;
  deliveryFee: string;
  promoTitle: string;
  promoCode: string;
  heroImage: string;
  logoImage: string;
  hours: { day: string; open: string; close: string }[];
  address: string;
  phone: string;
  categories: { id: string; label: string; emoji?: string }[];
  items: MenuItem[];
};

export const ISLAND_GRILL: RestaurantProfile = {
  id: 'island-grill',
  name: 'Island Grill',
  cuisines: 'Jamaican • Grill • Chicken',
  rating: 4.8,
  ratingCount: 2341,
  eta: '25-35 min',
  distance: '2.4 km away',
  deliveryFee: 'J$150 delivery fee',
  promoTitle: '20% off your first order here',
  promoCode: 'ISLAND20',
  heroImage:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuDlTlUgMXnB4jRJiV0LNeUXF5Kst247CW9jbuucrzRVIwF7vlZqkVHiHi2r86-d946QqdmR3CjggkjRmsFPSFLMduZS0M4bDGcnE4CSzs9BGfS3dOfS-7ImxYYTunPYFD1m0bf7CEH0Ge98p044EpJnYDqgUPWJgRZ9tRRXfXK_RzeuZJXs8m6KdT0VJnnrqAiTVGSzwUU7JF58SUIpFKbIUZ5NJm4Q5GF8A6h_IUwoURT4povIft2MYBJIEvVcZhGITyj8Jnpxes3l',
  logoImage:
    'https://lh3.googleusercontent.com/aida-public/AB6AXuC8vbwuBhPKxLfz9GANPENcNIdDM74K05_dZ8uaphp89SuYCAQ0hQFkJy4dwsDNPzbeEQQmVCoTYP5ZpI7kV16CONqlYIzZ8MHJFMRVuiNeb5o3EWfr05XfZ4PY_46CklsFBUlUu6nFV5fQCBuRE847ZAddSwc-klhoTpYl0kLIFIWpU1EtP2qvqaPX4AhqNJ5b-gNxuKLNRQcXco3IEUE-3Ko8IZz4LukbUgTRB_HYshbxSWfVyW23FpkYbbDAQUDurDnqZ-vzv1o8',
  hours: [
    { day: 'Mon – Thu', open: '10:00 AM', close: '10:00 PM' },
    { day: 'Fri – Sat', open: '10:00 AM', close: '11:00 PM' },
    { day: 'Sunday', open: '11:00 AM', close: '9:00 PM' },
  ],
  address: '12 Half Way Tree Rd, Kingston, Jamaica',
  phone: '+1 876-555-0199',
  categories: [
    { id: 'popular', label: 'Popular', emoji: '🔥' },
    { id: 'chicken', label: 'Chicken' },
    { id: 'sides', label: 'Sides' },
    { id: 'drinks', label: 'Drinks' },
    { id: 'desserts', label: 'Desserts' },
    { id: 'combos', label: 'Combos' },
  ],
  items: [
    {
      id: 'jerk-chicken-meal',
      name: 'Jerk Chicken Meal',
      description: 'Quarter jerk chicken with rice & peas, festival, and a side of fresh coleslaw.',
      price: 1200,
      image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCTIMKBsuYVMItkgei2hR4mcb3_MYSxRl5-Xh8fSs4bUMhd-pvc19deQDLqUaYE-DDNb5C8UNRYPP_Rxzf2BjUtTL-Q7Ruhzepv3NNWzhEfXDoE-0RoHiCXWrTQ9L30jo9A5efIMM9UnoCpUnCLf7aYSAxeAAOYAQxdmlRUGD_PRl00HcmYvopXAIykKdIRjFqJH9flOck9WNBw24DGHLBcm5TJ30eq8GkFhy97_HQGPPaEj7a5brsMaS2Kxc1OsYYFKrvTVdRmFFld',
      categoryId: 'popular',
      badge: 'Most ordered',
      featured: true,
      modifiers: [
        {
          id: 'size',
          title: 'Choose your size',
          required: true,
          type: 'radio',
          options: [
            { id: 'small', label: 'Small', price: 0 },
            { id: 'regular', label: 'Regular', price: 0 },
            { id: 'large', label: 'Large', price: 400 },
          ],
        },
        {
          id: 'side',
          title: 'Choose your side',
          required: true,
          type: 'radio',
          options: [
            { id: 'rice', label: 'Rice & Peas', price: 0 },
            { id: 'fries', label: 'Fries', price: 0 },
            { id: 'festival', label: 'Festival', price: 0 },
          ],
        },
        {
          id: 'extras',
          title: 'Add extras',
          required: false,
          type: 'checkbox',
          options: [
            { id: 'sauce', label: 'Extra jerk sauce', price: 50 },
            { id: 'coleslaw', label: 'Coleslaw', price: 100 },
            { id: 'plantain', label: 'Plantain', price: 150 },
          ],
        },
        {
          id: 'spice',
          title: 'Spice level',
          required: false,
          type: 'chips',
          options: [
            { id: 'mild', label: 'Mild', price: 0 },
            { id: 'medium', label: 'Medium', price: 0 },
            { id: 'hot', label: 'Hot', price: 0 },
            { id: 'extra_hot', label: 'Extra Hot', price: 0 },
          ],
        },
      ],
    },
    {
      id: 'bbq-chicken-meal',
      name: 'BBQ Chicken Meal',
      description: 'Quarter BBQ chicken served with mac & cheese and steamed vegetables.',
      price: 1150,
      image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuAzYJfv6IvNPanZ6nw51LOuYB9NV5Vh80_KBlLcLmxeSBfgWdr4CyS1l9IyuyMZFtTO_-0s2uo44_beRw5rVQWgo60Xo14u58pDcnBnChDWZ9nKUFMjZ7FqNLwPmqG_SxUe7FTBjeyyK7TT4cQ_nQV7KMIuXCWfAU9vukW6E_Iq7IQOQxQUakDmb3hqA8AHJJ76RH-wWMuPZnYJFLdqwMIdTx-Zd-OiFEB50qnlP6NCyxyctqfC7skVljT62cUkHXiv97cgRE28eZ_L',
      categoryId: 'popular',
      modifiers: [],
    },
    {
      id: 'curry-goat',
      name: 'Curry Goat',
      description: 'Tender chunks of goat meat slow-cooked in rich Jamaican curry, served with white rice.',
      price: 1800,
      image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuAxXXp7-CBaqIglIOdBBsHNzbuzMBEhMSgJdRrS4DEraBGCf4rv-3LuMv7SsJH30DAuS2e1TmPbv5pqwFxNhkeGW1M_Ul2tlqIerZ6XB2mrB0KDKB6p1ukIlj-MELHFxnGi25wJdKnOAjoZ8XxhLoICNshbmlYkA9Bq5BEqeUucJBgzk6C7HSt2RpeHnZD0rbzovfJnX6ZpB0MK-gLDe21rfuo2UcMZgovsTst8MRlvIDC0dxK8ssVWZraZu5Uj3dElyTNNAFawQmqP',
      categoryId: 'popular',
      modifiers: [],
    },
    {
      id: 'festival-3',
      name: 'Festival (3 pcs)',
      description: 'Sweet, fried Jamaican cornmeal dough. A perfect side for any meal.',
      price: 300,
      image:
        'https://lh3.googleusercontent.com/aida-public/AB6AXuAn_87e3XZMXSlRLml5Qb9RsJIaP58vMWYPjh5WyPBpwIHOJ1tWQQ0rtn136yzK_aHsr6xOET3zkZuqW39Wt8rdoMbDqheH9rNUeM_q2tHHOjT1BDin6BetDzsmL65F9WmPlF9NTNYWeu5sXZDveF7zBTu2vnz905Xxp5_4TjyCWmTvfr5G5WxJRwG0WidG1eq11i6U3wQbTDY1eogKdWHAvku-_GDEe8aHibZi87hO5e8ZC-6MY1kuEIcyCMhPT-2efRdXQzeVgJbx',
      categoryId: 'sides',
      modifiers: [],
    },
  ],
};

export function getRestaurantProfile(id?: string): RestaurantProfile {
  if (!id || id === 'island-grill' || id === 'burger-spot') {
    return ISLAND_GRILL;
  }
  return { ...ISLAND_GRILL, id: id ?? 'island-grill', name: 'Roam Restaurant' };
}

export function formatJmd(amount: number): string {
  return `J$${amount.toLocaleString()}`;
}
