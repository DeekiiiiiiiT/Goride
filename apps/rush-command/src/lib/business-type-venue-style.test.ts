import { describe, expect, it } from 'vitest';
import { resolveVenueStyleFromBusinessType } from './business-type-venue-style';

describe('resolveVenueStyleFromBusinessType', () => {
  it('maps common sign-up slugs to venue presets', () => {
    expect(resolveVenueStyleFromBusinessType('fast_food')).toBe('fast_food');
    expect(resolveVenueStyleFromBusinessType('cafe')).toBe('cafe');
    expect(resolveVenueStyleFromBusinessType('bakery')).toBe('cafe');
    expect(resolveVenueStyleFromBusinessType('restaurant')).toBe('fine_dining');
    expect(resolveVenueStyleFromBusinessType('grocery')).toBe('delivery_only');
  });

  it('uses label hints for admin-managed types', () => {
    expect(resolveVenueStyleFromBusinessType('uuid-1', 'Sports Bar & Grill')).toBe('sports_bar');
    expect(resolveVenueStyleFromBusinessType('uuid-2', 'Ghost Kitchen')).toBe('ghost_kitchen');
  });
});
