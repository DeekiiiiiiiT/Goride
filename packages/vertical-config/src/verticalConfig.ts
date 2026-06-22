import type {
  CategoryTaxonomyKey,
  ComplianceTier,
  FulfillmentType,
  GoLiveRule,
  MerchantBusinessTypeConfig,
  MerchantBusinessTypeSectionConfig,
  MerchantDocumentType,
  VerticalType,
} from '@roam/types';

export const DEFAULT_REQUIRED_DOCS: MerchantDocumentType[] = [
  'id_front',
  'id_back',
  'proof_of_business',
];

export const RESTAURANT_GO_LIVE_RULE: GoLiveRule = 'menu_min_5';

export const REGULATED_VERTICALS: ReadonlySet<VerticalType> = new Set([
  'pharmacy',
  'alcohol',
]);

export function getDefaultConfig(
  partial?: Partial<MerchantBusinessTypeConfig> & { id?: string; label?: string },
): MerchantBusinessTypeConfig {
  return {
    id: partial?.id ?? 'restaurant',
    section_id: partial?.section_id ?? 'food_service',
    label: partial?.label ?? 'Restaurant',
    sort_order: partial?.sort_order ?? 0,
    is_active: partial?.is_active ?? true,
    vertical_type: partial?.vertical_type ?? 'restaurant',
    fulfillment_type: partial?.fulfillment_type ?? 'cook_to_order',
    required_document_types: partial?.required_document_types ?? [...DEFAULT_REQUIRED_DOCS],
    category_taxonomy_key: partial?.category_taxonomy_key ?? 'cuisine',
    default_prep_time_mins: partial?.default_prep_time_mins ?? 15,
    max_delivery_radius_km: partial?.max_delivery_radius_km ?? 5,
    compliance_tier: partial?.compliance_tier ?? 'standard',
    go_live_rule: partial?.go_live_rule ?? RESTAURANT_GO_LIVE_RULE,
  };
}

export function resolveVerticalType(
  vertical: VerticalType | string | null | undefined,
): VerticalType {
  if (
    vertical === 'grocery' ||
    vertical === 'pharmacy' ||
    vertical === 'alcohol' ||
    vertical === 'convenience' ||
    vertical === 'retail'
  ) {
    return vertical;
  }
  return 'restaurant';
}

export function resolveFulfillmentType(
  fulfillment: FulfillmentType | string | null | undefined,
): FulfillmentType {
  return fulfillment === 'pick_and_pack' ? 'pick_and_pack' : 'cook_to_order';
}

export function resolveGoLiveRule(
  rule: GoLiveRule | string | null | undefined,
): GoLiveRule {
  if (rule === 'catalog_imported' || rule === 'pos_connected') return rule;
  return RESTAURANT_GO_LIVE_RULE;
}

export function isRegulatedVertical(vertical: VerticalType | string | null | undefined): boolean {
  return REGULATED_VERTICALS.has(resolveVerticalType(vertical));
}

export function getBusinessTypeConfig(
  sections: MerchantBusinessTypeSectionConfig[],
  businessTypeId: string,
): MerchantBusinessTypeConfig | null {
  if (!businessTypeId) return null;
  for (const section of sections) {
    for (const type of section.types) {
      if (type.id === businessTypeId && type.is_active) {
        return getDefaultConfig(type);
      }
    }
  }
  return null;
}

export interface VerticalLabels {
  storeNoun: string;
  prepTimeLabel: string;
  prepTimeHelper: string;
  deliveryRadiusHelper: string;
  categoryFieldLabel: string;
  catalogNoun: string;
  goLiveCatalogLabel: string;
}

export function getVerticalLabels(
  vertical: VerticalType | string | null | undefined,
  fulfillmentType?: FulfillmentType | string | null,
): VerticalLabels {
  const v = resolveVerticalType(vertical);
  const fulfillment = resolveFulfillmentType(fulfillmentType);

  if (fulfillment === 'pick_and_pack' || v === 'grocery' || v === 'convenience' || v === 'retail') {
    return {
      storeNoun: 'Store',
      prepTimeLabel: 'Average packing time',
      prepTimeHelper: 'Time to pick and bag items for couriers.',
      deliveryRadiusHelper: 'Non-perishable items can travel farther.',
      categoryFieldLabel: 'Inventory categories',
      catalogNoun: 'Catalog',
      goLiveCatalogLabel: 'Catalog uploaded (minimum 50 items)',
    };
  }

  return {
    storeNoun: 'Restaurant',
    prepTimeLabel: 'Average prep time',
    prepTimeHelper: 'Helps couriers estimate pickup time.',
    deliveryRadiusHelper: 'Keep food fresh — tighter radius recommended.',
    categoryFieldLabel: 'Cuisine tags',
    catalogNoun: 'Menu',
    goLiveCatalogLabel: 'Menu added (minimum 5 items)',
  };
}

export function getCategoryTaxonomyKey(
  config: MerchantBusinessTypeConfig | null,
): CategoryTaxonomyKey {
  return config?.category_taxonomy_key ?? 'cuisine';
}

export function getComplianceTier(
  config: MerchantBusinessTypeConfig | null,
): ComplianceTier {
  return config?.compliance_tier ?? 'standard';
}
