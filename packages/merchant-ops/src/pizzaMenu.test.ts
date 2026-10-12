import { describe, expect, it } from 'vitest';
import { cheapestPizzaPrice, pizzaRestaurantPrice, type PizzaMenu, type PizzaRecipe } from './pizzaMenu';

const menu: PizzaMenu = {
  sizes: [
    { id: 'medium', name: 'Medium', basePrice: 1000 },
    { id: 'large', name: 'Large', basePrice: 1500 },
  ],
  crusts: [
    { id: 'tossed', name: 'Hand Tossed', description: '', fees: { medium: 0, large: 0 } },
    { id: 'thin', name: 'Crunchy Thin', description: '', fees: { medium: 0, large: 0 } },
    { id: 'pan', name: 'Handmade Pan', description: 'Pan', fees: { medium: 200, large: null } },
    { id: 'stuffed', name: 'Stuffed Crust', description: 'Cheese rim', fees: { medium: null, large: 400 } },
  ],
  extraCheese: { medium: 150, large: 300 },
  sauces: [{ id: 'pizza', name: 'Pizza Sauce' }, { id: 'bbq', name: 'BBQ Sauce' }],
  meats: [{ id: 'pepperoni', name: 'Pepperoni', prices: { medium: 200, large: 280 } }],
  nonMeats: [{ id: 'onion', name: 'Onion', prices: { medium: 100, large: 150 } }],
};

const plain = {
  sizeId: 'medium',
  crustId: 'tossed',
  cheese: 'normal' as const,
  sauceId: 'pizza',
  toppings: [],
};

describe('pizza price', () => {
  it('starts at the size price on a standard crust', () => {
    expect(pizzaRestaurantPrice(menu, plain)).toEqual({ ok: true, restaurant: 1000 });
  });

  it('adds a pan fee only on the size that sells it', () => {
    expect(pizzaRestaurantPrice(menu, { ...plain, crustId: 'pan' }).restaurant).toBe(1200);
    expect(pizzaRestaurantPrice(menu, { ...plain, sizeId: 'large', crustId: 'pan' }).ok).toBe(false);
  });

  it('adds stuffed crust on a larger size', () => {
    expect(pizzaRestaurantPrice(menu, { ...plain, sizeId: 'large', crustId: 'stuffed' }).restaurant).toBe(1900);
    expect(pizzaRestaurantPrice(menu, { ...plain, crustId: 'stuffed' }).ok).toBe(false);
  });

  it('charges extra cheese for the chosen size', () => {
    expect(pizzaRestaurantPrice(menu, { ...plain, cheese: 'extra' }).restaurant).toBe(1150);
  });

  it('charges a meat once and twice when it is extra', () => {
    const meat = { ...plain, toppings: [{ id: 'pepperoni', portion: 'normal' as const }] };
    expect(pizzaRestaurantPrice(menu, meat).restaurant).toBe(1200);
    expect(pizzaRestaurantPrice(menu, { ...plain, toppings: [{ id: 'pepperoni', portion: 'extra' }] }).restaurant).toBe(1400);
  });

  it('charges a vegetable less than a meat, and sauce does not change the price', () => {
    const vegetable = pizzaRestaurantPrice(menu, {
      ...plain,
      sizeId: 'large',
      toppings: [{ id: 'onion', portion: 'normal' }],
    });
    expect(vegetable.restaurant).toBe(1650);
    expect(pizzaRestaurantPrice(menu, { ...plain, sauceId: 'bbq' }).restaurant).toBe(1000);
  });

  it('uses the cheapest size that can bake the recipe', () => {
    const recipe: PizzaRecipe = {
      cheese: 'extra',
      sauceId: 'pizza',
      crustId: 'tossed',
      toppings: [{ id: 'pepperoni', portion: 'extra' }, { id: 'onion', portion: 'normal' }],
    };
    expect(cheapestPizzaPrice(menu, recipe)).toBe(1000 + 150 + 400 + 100);
  });
});
