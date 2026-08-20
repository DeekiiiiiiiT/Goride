import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENABLED_STATIONS,
  VENUE_STYLE_LABELS,
  VENUE_TEMPLATE_PRESETS,
} from './venue-ops-presets';

describe('venue-ops-presets', () => {
  it('matches backend default enabled stations', () => {
    expect(DEFAULT_ENABLED_STATIONS).toEqual(['counter', 'kitchen', 'manager', 'pos']);
  });

  it('includes all venue templates with at least kitchen', () => {
    for (const stations of Object.values(VENUE_TEMPLATE_PRESETS)) {
      expect(stations).toContain('kitchen');
    }
  });

  it('labels every template style', () => {
    for (const style of Object.keys(VENUE_TEMPLATE_PRESETS)) {
      expect(VENUE_STYLE_LABELS[style as keyof typeof VENUE_TEMPLATE_PRESETS]).toBeTruthy();
    }
  });

  it('keeps sports bar bar and expo stations', () => {
    expect(VENUE_TEMPLATE_PRESETS.sports_bar).toEqual([
      'pos',
      'bar',
      'kitchen',
      'expo',
      'counter',
      'manager',
    ]);
  });
});
