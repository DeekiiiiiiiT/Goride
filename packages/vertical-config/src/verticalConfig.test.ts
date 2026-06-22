import { describe, expect, it } from 'vitest';
import {
  getBusinessTypeConfig,
  getDefaultConfig,
  getVerticalLabels,
  isRegulatedVertical,
  resolveGoLiveRule,
  resolveVerticalType,
} from './verticalConfig';
import type { MerchantBusinessTypeSectionConfig } from '@roam/types';

describe('verticalConfig', () => {
  it('getDefaultConfig returns restaurant defaults', () => {
    const config = getDefaultConfig();
    expect(config.vertical_type).toBe('restaurant');
    expect(config.fulfillment_type).toBe('cook_to_order');
    expect(config.go_live_rule).toBe('menu_min_5');
    expect(config.required_document_types).toHaveLength(3);
  });

  it('resolveVerticalType null → restaurant', () => {
    expect(resolveVerticalType(null)).toBe('restaurant');
    expect(resolveVerticalType(undefined)).toBe('restaurant');
    expect(resolveVerticalType('grocery')).toBe('grocery');
  });

  it('isRegulatedVertical', () => {
    expect(isRegulatedVertical('pharmacy')).toBe(true);
    expect(isRegulatedVertical('alcohol')).toBe(true);
    expect(isRegulatedVertical('restaurant')).toBe(false);
  });

  it('getVerticalLabels for grocery', () => {
    const labels = getVerticalLabels('grocery', 'pick_and_pack');
    expect(labels.prepTimeLabel).toBe('Average packing time');
    expect(labels.categoryFieldLabel).toBe('Inventory categories');
  });

  it('getBusinessTypeConfig resolves from sections', () => {
    const sections: MerchantBusinessTypeSectionConfig[] = [
      {
        id: 'food',
        label: 'Food',
        sort_order: 0,
        is_active: true,
        types: [
          getDefaultConfig({ id: 'restaurant', label: 'Restaurant', section_id: 'food' }),
        ],
      },
    ];
    const config = getBusinessTypeConfig(sections, 'restaurant');
    expect(config?.label).toBe('Restaurant');
    expect(getBusinessTypeConfig(sections, 'missing')).toBeNull();
  });

  it('resolveGoLiveRule defaults to menu_min_5', () => {
    expect(resolveGoLiveRule(null)).toBe('menu_min_5');
    expect(resolveGoLiveRule('catalog_imported')).toBe('catalog_imported');
  });
});
