import { describe, expect, it } from 'vitest';
import {
  applyVerticalPreset,
  getBusinessTypeConfig,
  getDefaultConfig,
  getVerticalLabels,
  getVerticalPreset,
  isRegulatedVertical,
  normalizeRequiredDocumentTypes,
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
    expect(config.category_tags).toEqual([]);
  });

  it('getDefaultConfig with pharmacy vertical applies preset', () => {
    const config = getDefaultConfig({ vertical_type: 'pharmacy', label: 'Pharmacy' });
    expect(config.fulfillment_type).toBe('pick_and_pack');
    expect(config.compliance_tier).toBe('regulated');
    expect(config.go_live_rule).toBe('catalog_imported');
    expect(config.required_document_types).toContain('pharmacy_permit');
  });

  it('getVerticalPreset for each vertical', () => {
    expect(getVerticalPreset('grocery').max_delivery_radius_km).toBe(15);
    expect(getVerticalPreset('alcohol').required_document_types).toContain('liquor_license');
    expect(getVerticalPreset('convenience').default_prep_time_mins).toBe(20);
    expect(getVerticalPreset('retail').fulfillment_type).toBe('pick_and_pack');
  });

  it('applyVerticalPreset preserves identity fields', () => {
    const current = getDefaultConfig({
      id: 'custom_id',
      label: 'Custom',
      section_id: 'retail',
      sort_order: 2,
    });
    const next = applyVerticalPreset(current, 'pharmacy');
    expect(next.id).toBe('custom_id');
    expect(next.label).toBe('Custom');
    expect(next.section_id).toBe('retail');
    expect(next.compliance_tier).toBe('regulated');
  });

  it('applyVerticalPreset preserveCustomDocs keeps extra docs and adds permit', () => {
    const current = getDefaultConfig({ id: 'p', label: 'P', vertical_type: 'restaurant' });
    const next = applyVerticalPreset(current, 'pharmacy', { preserveCustomDocs: true });
    expect(next.required_document_types).toContain('pharmacy_permit');
    expect(next.required_document_types).toContain('id_front');
  });

  it('normalizeRequiredDocumentTypes always includes base docs', () => {
    const docs = normalizeRequiredDocumentTypes(['liquor_license'], 'alcohol');
    expect(docs).toContain('id_front');
    expect(docs).toContain('liquor_license');
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
