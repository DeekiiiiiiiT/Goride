export type SearchRestaurantResult = {
  id: string;
  name: string;
  description: string;
  rating: number;
  ratingCount: string;
  eta: string;
  image: string;
  badge?: string;
  badgeClass?: string;
};

export type SearchGroceryResult = {
  storeId: string;
  storeName: string;
  productName: string;
  price: string;
  stock: string;
  image: string;
};

export type SearchProductResult = {
  id: string;
  name: string;
  price: string;
  image: string;
};

const CHICKEN_RESTAURANTS: SearchRestaurantResult[] = [
  {
    id: 'island-grill',
    name: 'Island Grill',
    description: 'Authentic Jerk Chicken • 20-30 min',
    rating: 4.8,
    ratingCount: '500+',
    eta: '20-30 min',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAymFyMGGFjFBo3i59wfHZj9Jekw1XwaMux4SQmxar4HOCtz3V2MntKlELPi4UTolac7mJyewj8GjhO1abuXTwkKMdI3th0drrJOmDCWfcDbVsnBRo7_HcmVW3coYMQOheM5d-EbA2Z3vFubckDUShga7D7e0kG5ErlUiyQ434h4yea7mUG4JOhq1WTETiT37xH7wKeN4NgnJ7vuJkEGsSjwlgdg0RQmlgTD9--nf6iLVoOH0TbJypcmUVSiO0HYXylUpMr7gpOMh0',
    badge: 'Top Rated',
    badgeClass: 'bg-primary text-on-primary',
  },
  {
    id: 'champs-chicken',
    name: 'Champs Chicken',
    description: 'Fried Chicken & Sides • 15-25 min',
    rating: 4.5,
    ratingCount: '200+',
    eta: '15-25 min',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBmXGPEyXMdIgeAelbMQWg0y-BG-LCAlf9iL4hD2tOIDUMi7nAfUWa2JxkwdkLLtYkdM36ZMpLgCuaoxpBSQQycJK3eToBRaapb2NHg3bpbVxrH0l59SO5ei0zYQmBl953zR75vkdEdep4EG5HgmKSf3Zzow5e-sUE9PnJBJIYwZBTC5rUrggv-sYjAPrjDFUjU-wqRXIbsh_q4WQ30k0F_L0oA47VGDbt0md6OqFq4AywKr1TIXHH5V2U7nSHZVwt3psVSH7Ste1o',
    badge: 'Fastest',
    badgeClass: 'bg-secondary text-on-secondary',
  },
];

const CHICKEN_GROCERY: SearchGroceryResult[] = [
  {
    storeId: 'fresh-mart',
    storeName: 'Fresh Mart',
    productName: '1.5kg Packaged Chicken Breast',
    price: '$14.50',
    stock: 'In stock',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCLaI-3E8XswO9g54SNBUxpXI6g1Cq2NaOJLCNve6yUlixEIGdpUK5CC2gWe5dBF2LLGHZ0u-RBqilhdyzViDu2RNBBOCHg2FNDEjuCuCWYojhxq2i5bvhTlsIwgr6hQebjmCg17xIwB6Wybri4qt00kxc9EZ3-xK3iBFZi1Sdwe3fPSmfjHGElJjcwGQxJygfj_i0rVrt6BJG-P60sKIOjOadrQKDzLuRgwHobM0XoxC3-C5Wrz_blCi2cgBgPE5pgwt4UtXNM-nQ',
  },
];

const CHICKEN_PRODUCTS: SearchProductResult[] = [
  {
    id: 'chicken-bouillon',
    name: 'Chicken Bouillon',
    price: '$3.99',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBdiHXujXNCo1iX9B-1BUkpzXzmkCC3_QwagUjivdFGMNFIQyE99Cl-h8J2D6GJkenqvlL01aX_2QUvsM5tB46XDugORTgAYzEeg5qCzXETM_6SAa5gF9m3YqGX8by55TutT0gELR2XPV1xzjRtKh6i34fFcwWo9XUkFrKmxTPY404VlBQZm_mmq_iBuAaCHgZCTlLqR8dZgB91HhWe1YF5jEsU3OMQYIo8jGhVnPULrH8pU5L9H_pYSyPeYDPGa3v9uowjCU-tGgU',
  },
  {
    id: 'frozen-nuggets',
    name: 'Frozen Chicken Nuggets',
    price: '$8.50',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCneMP2duql1QKIsv1BhjONAC-IKvFxsaPlKS7uJhVv4deqfDyUi-lmvH6TdyNMXFsRXJkwlCNQ594YGK8zJxahwImcD9Q-D33iqgphbf5UgkkE6Z7O9CCLYs7FJDB1mlp_A8yWI09r6TPUWMLGdlDebiP5BGYeuEz2VLynzZKuG-TQ5FaNKbuKKW67OVTAWnia3CLF7yMCWbR9I2H-hcmJv_AScqeKuYzUcYuuaCR_SFvX_w4_GnbcSw4N2t6zWW9Ypd2NckU63N0',
  },
];

export function getGroupedSearchResults(query: string) {
  const q = query.trim().toLowerCase();
  if (!q.includes('chicken')) {
    return null;
  }
  return {
    restaurants: CHICKEN_RESTAURANTS,
    grocery: CHICKEN_GROCERY,
    products: CHICKEN_PRODUCTS,
  };
}
