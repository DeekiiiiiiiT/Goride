import { describe, expect, it } from 'vitest';
import { formatHourLabel, mapMerchantHours, mapMerchantMenuResponse } from './merchantMenu';

describe('mapMerchantHours', () => {
  it('maps partner hour rows including closed days', () => {
    const hours = mapMerchantHours([
      { day_of_week: 1, open_time: '10:00:00', close_time: '22:00:00', is_closed: false },
      { day_of_week: 0, open_time: '11:00', close_time: '21:00', is_closed: true },
    ]);
    expect(hours).toEqual([
      { day: 'Sunday', open: 'Closed', close: 'Closed' },
      { day: 'Monday', open: formatHourLabel('10:00:00'), close: formatHourLabel('22:00:00') },
    ]);
  });

  it('returns empty when hours are missing', () => {
    expect(mapMerchantHours([])).toEqual([]);
    expect(mapMerchantHours(undefined)).toEqual([]);
  });
});

describe('mapMerchantMenuResponse', () => {
  it('uses hours from the merchant payload', () => {
    const profile = mapMerchantMenuResponse({
      merchant: { id: 'm1', name: 'Island Grill', business_hours: {} },
      hours: [{ day_of_week: 2, open_time: '09:00', close_time: '17:00', is_closed: false }],
    });
    expect(profile.hours).toHaveLength(1);
    expect(profile.hours[0]?.day).toBe('Tuesday');
  });
});
