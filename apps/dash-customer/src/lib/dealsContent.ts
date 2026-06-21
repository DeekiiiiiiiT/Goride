export type DealFilter = 'all' | 'free-delivery' | 'percent-off' | 'bogo';

export const DEAL_FILTERS: { id: DealFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'free-delivery', label: 'Free Delivery' },
  { id: 'percent-off', label: '% Off' },
  { id: 'bogo', label: 'BOGO' },
];

export type FeaturedDeal = {
  id: string;
  merchantId: string;
  merchantName: string;
  badge: string;
  title: string;
  validUntil: string;
  urgent?: boolean;
  image: string;
  logo: string;
  filter: DealFilter;
};

export const FEATURED_DEALS: FeaturedDeal[] = [
  {
    id: 'burger-joint-20',
    merchantId: 'burger-spot',
    merchantName: 'Burger Joint',
    badge: '20% OFF',
    title: '20% off orders over J$3,500',
    validUntil: 'Valid until Oct 31',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAjMbERhGbjYXYzJKkEvgqMHCquHJRbbBySGGbTbKJCP4-Uz2K2PbZZWmxHKF-sNtrD5g247WEW1VnqQWJWM2-95kVRpBojTlONsEWEkN7_jVtUlpFk9uMBqV8vTkgDMuZig_IAbeOWNqXNTWhp1j3RXRm_9lTWrleWXP1ehFeiWJIjSJHC2WK0A9uHkDaMsIOpxtJUEN6UVhmHlpewJ5eNKz2t6q6hfzVGOv3FvT6B2HTef5OufnTNdSGIhof6YfidTTFAt73NtAm7',
    logo:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBgpuC8havXa2V6jepq2jMrPJ98Copdklti3RUJpY3pAT7DPdEm5OZntVLCrieOIUaKSH5JO8FLcJhLgTn7tJMNwXuvYV1N51DyI5n5spHXFOZA_yJ28PIqgQ5yAppPy_dSH9bOPcnGXMDYAVoZYeg59Xug7606xugRL2W7an6pXM_OvGHHawtyaG0gdHfSH9XnOaPbIkfwvtO6LDRne2zKump7VXAr5-XmbkvI1S51zN0RxVG6m1PQ7A0gX-1mOYqZ9mffb_ixEJLU',
    filter: 'percent-off',
  },
  {
    id: 'pizza-palace-bogo',
    merchantId: 'marios-pizza',
    merchantName: 'Pizza Palace',
    badge: 'BOGO',
    title: 'Buy One Get One Free on Large Pizzas',
    validUntil: 'Valid until tomorrow',
    urgent: true,
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuAU8y7X1qIvMSI0550nBf9hnLSMf_V2EqTrImQiTtYk3tV-JMmUez7CFP66RyLJj1IUkWcTS9Pyn98DklROZ8yPJzmVl33mKggo8yeoOCU1PuV9GC5H5bXGceOr_OireTVYjAo8jTuBdzE9LmPZ2fOcEotm4MgkLrpvEQ_3RNvXGrM41HFK4MCJ9-i98ChR3yZb4h4NLDwUkQUdKTlQky69wa9526b68za6RMZP3IG1XQKwlt_Vk5vSnDku4u0g1DgOBAxpueP1_o-2',
    logo:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCtErmUzbgbbcYXIs5_Y7DmJWNABY7LKSk18gkgrbHaVkInPd-NFbyIGnVY5IPH4nvmc1_gkmXJ-tnL9aA0eDqBPAStGGJn1c3Di3rqJlr3-GJpen7uJWF2-yycHDFwSC6XXAc9LMoBuBx7RzATkJ7N5au7PNi5zk9IVL6Qh4DnZF8mC82XMG8VfwUAWOsAM5YbMbM6kBp61PM0Y6rbzyb37-5gVU4GnZQ2mHpX6fjCOhqpzv4GSaYakbU6xefnST0h68-xQldMyWhp',
    filter: 'bogo',
  },
];

export type DailyPick = {
  id: string;
  merchantId: string;
  merchantName: string;
  badge: string;
  description: string;
  image: string;
  filter: DealFilter;
};

export const DAILY_PICKS: DailyPick[] = [
  {
    id: 'sakura-sushi',
    merchantId: 'oceanside-sushi',
    merchantName: 'Sakura Sushi',
    badge: 'Free Roll',
    description: 'Free spicy tuna roll over J$4,200',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDY5sIBf7sZjc-eiYdP2sqFeAdTPgLDC6ur1R65KOlgHTRahkwhioNkdVMfkvQj5zs1eVnKluP_IjAAq0Xb_vYglXdY_U2dBZsYqRBemC-S67E2u6Ucc9miesX9b9w3JQfq6YPR-o4tD53SLaEg7Vb0BvVAdZ_VZ2iMzbWZ7ot7Rw15sv-PkhsuwZNvWgI8_4W7Sc2LwQwvqcr5eRUQCoagY4Yc8n7hDQBchUk0V2w1ZLWXQ7EVAgwnbXRnYzyjPPV_THTicMNu-Bsn',
    filter: 'percent-off',
  },
  {
    id: 'morning-roast',
    merchantId: 'greenery-cafe',
    merchantName: 'Morning Roast',
    badge: 'J$300 Off',
    description: 'J$300 off any espresso drink',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuDD8rkt1XvdUb2EL9dRhK45dAzY0LKHsGKlSD0__vrkvRtWYMIvoo3FCML0Go8ZhOVJVHtEPlRx1S86wELW45XaaqjwrZIYIrd9FPaJ9aQ8GoZmnp9XKzpe1GlpDl3N1n8XFqvgkjfoXyxJ_RdWssAy0s2uBA9iX3vdzu8e3fdXetZvzBMSM6cKS49UXgxaOjzPzJKpUW1BEMyOl9wcl0MdQyaw3Rcz7wJoO1cLndzJZAGaGeM_7EJQyPTaVfrhFZyw7f-hezy3rsd9',
    filter: 'percent-off',
  },
  {
    id: 'green-bowl',
    merchantId: 'green-life',
    merchantName: 'Green Bowl Co.',
    badge: 'Free Delivery',
    description: 'Free delivery all weekend',
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuB0SIW5gWLHkcB1o3LCoX9O3mUIOzqy1NeKx0EKp2XyO0bJXuxVYHsBqiJSgrCH4TVoYJv2bfOLrtCcRGZyn7tvfQZ2u6otqUpycWh8RfspGtGEJYhGzVm45PSjiUbODK2NcMqGK6_j7QWc2LjowBnxsN4GnDuj6bVJJ-MUeJU2M6UfD3SdY4wqn7O4cYNrtj6X71xnCw49Z5EPxYESG8Lt796pR4eT1PhEMkM2dK3H6ohHL1e2eLkFWwiBMnIbvaDrlI6cgShz45US',
    filter: 'free-delivery',
  },
];

export function filterDeals(filter: DealFilter) {
  if (filter === 'all') {
    return { featured: FEATURED_DEALS, daily: DAILY_PICKS };
  }
  return {
    featured: FEATURED_DEALS.filter((d) => d.filter === filter),
    daily: DAILY_PICKS.filter((d) => d.filter === filter),
  };
}
