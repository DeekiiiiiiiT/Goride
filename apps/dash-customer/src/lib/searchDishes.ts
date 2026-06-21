import { FEATURED_RESTAURANTS, POPULAR_RESTAURANTS } from '@/lib/discoverContent';
import { ISLAND_GRILL } from '@/lib/restaurantContent';

export type DishSearchResult = {
  itemId: string;
  name: string;
  description: string;
  price: number;
  image: string;
  merchantId: string;
  merchantName: string;
  hasModifiers: boolean;
};

const DEMO_DISHES: DishSearchResult[] = [
  {
    itemId: 'margherita-pizza',
    name: 'Margherita Pizza',
    description: 'Fresh mozzarella, basil, and tomato sauce on a thin crust.',
    price: 1800,
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuCrGKt-QHQlEsddE1qHufc7Ss1YzJ6E3OhjKXo2HviQnLDzHe6rCap8RvE_ZODS5-qbLj-U3NO3jZrkztw6gbLaFbUaG_DShMxG45PfPhxJRzfYqobd6cMKiy5I9anCA8Jr6EI0WKngOmgc-hAu7pLuXs_h10kJtv7Ut9xjr4XXN0-3SwJ0-GRedTr84olXxa2D43GD_9H2BAFxHObTzmOEnsjrkj2EMD709yfQqD_AS5JcqzxqtDobGpsZEJMlNZcvG-bod49oqM1X',
    merchantId: 'pizza-palace',
    merchantName: 'Pizza Palace',
    hasModifiers: true,
  },
  {
    itemId: 'classic-burger',
    name: 'Classic Smash Burger',
    description: 'Double patty, cheddar, pickles, and house sauce.',
    price: 1500,
    image:
      'https://lh3.googleusercontent.com/aida-public/AB6AXuBuQCwelBRegj7R5NNpZSyFL7RvbIyoi8DjdCcm0zBmM2DSYs31d7UpFzCZ31smVRJE5ueGblxnMBHFBpprwUUU2SNv3_OTfFa3x-ucKeasbzsovgIItWEuR2EX1ZrTE3OGEvDKY9axPcVXVaLYEUYtYnun6Q-FCMb7VuU_8vFhu6Xndg54lGt46TgHoQqI_k2YXxJMwBPnKugwm5qXeNrQ9a5R2kFel5WlxTPL3OiOFeqafHoucmPjw9bNBZKAyabAVM0Dbb3K7lGH',
    merchantId: 'burger-spot',
    merchantName: 'The Burger Spot',
    hasModifiers: false,
  },
];

function buildDishIndex(): DishSearchResult[] {
  const restaurantNames = new Map<string, string>();
  for (const r of [...FEATURED_RESTAURANTS, ...POPULAR_RESTAURANTS]) {
    restaurantNames.set(r.id, r.name);
  }
  restaurantNames.set(ISLAND_GRILL.id, ISLAND_GRILL.name);

  const fromMenus: DishSearchResult[] = ISLAND_GRILL.items.map((item) => ({
    itemId: item.id,
    name: item.name,
    description: item.description,
    price: item.price,
    image: item.image,
    merchantId: ISLAND_GRILL.id,
    merchantName: ISLAND_GRILL.name,
    hasModifiers: item.modifiers.length > 0,
  }));

  return [...fromMenus, ...DEMO_DISHES];
}

const DISH_INDEX = buildDishIndex();

export function searchDishes(query: string): DishSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return DISH_INDEX;

  return DISH_INDEX.filter(
    (dish) =>
      dish.name.toLowerCase().includes(q) ||
      dish.description.toLowerCase().includes(q) ||
      dish.merchantName.toLowerCase().includes(q),
  );
}

export function getDishIndexCount(): number {
  return DISH_INDEX.length;
}
