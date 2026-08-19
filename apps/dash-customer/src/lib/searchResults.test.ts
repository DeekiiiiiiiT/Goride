import { describe, expect, it } from 'vitest';
import { applyRestaurantFilters, EMPTY_SEARCH_FILTERS, type SearchableRestaurant } from './searchResults';

const rows: SearchableRestaurant[] = [
  { id: 'a', name: "Mario's Pizzeria", cuisines: 'Pizza', rating: 4.2, eta: '35-50 min', image: '', delivery: '$200' },
  { id: 'b', name: 'Island Grill', cuisines: 'Jerk', rating: 4.8, eta: '20-30 min', image: '', delivery: 'Free' },
  { id: 'c', name: 'Pizza Corner', cuisines: 'Pizza', rating: 3.9, eta: '15-25 min', image: '', delivery: '$80' },
];

describe('applyRestaurantFilters', () => {
  it('sorts by rating', () => {
    const list = applyRestaurantFilters(rows, { ...EMPTY_SEARCH_FILTERS, sort: 'rating' }, '');
    expect(list.map((r) => r.id)).toEqual(['b', 'a', 'c']);
  });

  it('sorts by fastest eta', () => {
    const list = applyRestaurantFilters(rows, { ...EMPTY_SEARCH_FILTERS, sort: 'fastest' }, '');
    expect(list[0].id).toBe('c');
  });

  it('sorts by delivery fee', () => {
    const list = applyRestaurantFilters(rows, { ...EMPTY_SEARCH_FILTERS, sort: 'price_asc' }, '');
    expect(list.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  it('filters 4.0+ rating', () => {
    const list = applyRestaurantFilters(rows, { ...EMPTY_SEARCH_FILTERS, rating: '4.0' }, '');
    expect(list.map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('ranks query matches first for recommended', () => {
    const list = applyRestaurantFilters(rows, EMPTY_SEARCH_FILTERS, 'pizza');
    expect(list[0].name.toLowerCase()).toContain('pizza');
  });

  it('filters by price level and dietary keywords', () => {
    const priced: SearchableRestaurant[] = [
      { ...rows[0], priceLevel: '$$$', cuisines: 'Pizza' },
      { ...rows[1], priceLevel: '$', cuisines: 'Jerk, Vegan options' },
      { ...rows[2], priceLevel: '$$', cuisines: 'Pizza' },
    ];
    const cheap = applyRestaurantFilters(priced, { ...EMPTY_SEARCH_FILTERS, prices: ['$'] }, '');
    expect(cheap.map((r) => r.id)).toEqual(['b']);
    const vegan = applyRestaurantFilters(priced, { ...EMPTY_SEARCH_FILTERS, dietary: ['vegan'] }, '');
    expect(vegan.map((r) => r.id)).toEqual(['b']);
  });

  it('filters free delivery', () => {
    const list = applyRestaurantFilters(rows, { ...EMPTY_SEARCH_FILTERS, deliveryFee: 'free' }, '');
    expect(list.map((r) => r.id)).toEqual(['b']);
  });
});
