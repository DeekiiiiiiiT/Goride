import { describe, expect, it } from 'vitest';
import {
  getCategoryById,
  getItemsForCategory,
  HAULAGE_CATEGORIES,
  HAULAGE_ITEMS,
} from './catalog';
import { estimateDurationMinutes, estimateHaulageTotalMinor } from './pricing';
import { validateItemSpec } from './validation';
import type { HaulageFreightItem } from './types';

describe('haulage catalog', () => {
  it('every category has at least one item', () => {
    for (const category of HAULAGE_CATEGORIES) {
      const items = getItemsForCategory(category.id);
      expect(items.length).toBeGreaterThan(0);
      expect(getCategoryById(category.id)?.id).toBe(category.id);
    }
  });

  it('every item has variants', () => {
    for (const item of HAULAGE_ITEMS) {
      expect(item.variants.length).toBeGreaterThan(0);
    }
  });
});

describe('haulage pricing', () => {
  const sampleItem: HaulageFreightItem = {
    clientId: '1',
    categoryId: 'appliances',
    templateId: 'stove',
    variantId: 'gas',
    variantLabelKey: 'items.stove.variants.gas',
    titleKey: 'items.stove.title',
    subtitleKey: 'items.stove.subtitle',
    lengthCm: null,
    widthCm: null,
    heightCm: null,
    weightKg: 85,
    fragile: false,
    requiresDisassembly: false,
  };

  it('returns deterministic totals', () => {
    const pickup = { address: 'A', lat: 41.88, lng: -87.63 };
    const dropoff = { address: 'B', lat: 42.05, lng: -87.68 };
    const a = estimateHaulageTotalMinor([sampleItem], pickup, dropoff);
    const b = estimateHaulageTotalMinor([sampleItem], pickup, dropoff);
    expect(a.totalMinor).toBe(b.totalMinor);
    expect(a.distanceKm).not.toBeNull();
  });

  it('estimates duration from distance', () => {
    expect(estimateDurationMinutes(10)).toBeGreaterThan(0);
    expect(estimateDurationMinutes(null)).toBeNull();
  });
});

describe('haulage validation', () => {
  it('requires weight', () => {
    const errors = validateItemSpec({
      lengthCm: '',
      widthCm: '',
      heightCm: '',
      weightKg: '',
    });
    expect(errors.weightKg).toBe('weightRequired');
  });

  it('requires all dimensions when partial', () => {
    const errors = validateItemSpec({
      lengthCm: '100',
      widthCm: '',
      heightCm: '',
      weightKg: '50',
    });
    expect(errors.lengthCm).toBe('dimensionsIncomplete');
  });
});
