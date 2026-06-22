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
import { BASE_MERCHANT_DOCUMENT_TYPES } from '@roam/types';

export const DOCUMENT_TYPE_LABELS: Record<MerchantDocumentType, string> = {
  id_front: 'ID Front',
  id_back: 'ID Back',
  proof_of_business: 'Proof of Business',
  liquor_license: 'Liquor License',
  pharmacy_permit: 'Pharmacy Permit',
};

export const DEFAULT_REQUIRED_DOCS: MerchantDocumentType[] = [...BASE_MERCHANT_DOCUMENT_TYPES];

export const RESTAURANT_GO_LIVE_RULE: GoLiveRule = 'menu_min_5';

export const REGULATED_VERTICALS: ReadonlySet<VerticalType> = new Set([
  'pharmacy',
  'alcohol',
]);

export const REGULATED_PERMIT_DOC: Partial<Record<VerticalType, MerchantDocumentType>> = {
  pharmacy: 'pharmacy_permit',
  alcohol: 'liquor_license',
};

export type VerticalPresetFields = Pick<
  MerchantBusinessTypeConfig,
  | 'vertical_type'
  | 'fulfillment_type'
  | 'category_taxonomy_key'
  | 'go_live_rule'
  | 'compliance_tier'
  | 'default_prep_time_mins'
  | 'max_delivery_radius_km'
  | 'required_document_types'
>;

const VERTICAL_PRESET_TABLE: Record<VerticalType, VerticalPresetFields> = {
  restaurant: {
    vertical_type: 'restaurant',
    fulfillment_type: 'cook_to_order',
    category_taxonomy_key: 'cuisine',
    go_live_rule: 'menu_min_5',
    compliance_tier: 'standard',
    default_prep_time_mins: 15,
    max_delivery_radius_km: 5,
    required_document_types: [...DEFAULT_REQUIRED_DOCS],
  },
  grocery: {
    vertical_type: 'grocery',
    fulfillment_type: 'pick_and_pack',
    category_taxonomy_key: 'inventory_category',
    go_live_rule: 'catalog_imported',
    compliance_tier: 'standard',
    default_prep_time_mins: 30,
    max_delivery_radius_km: 15,
    required_document_types: [...DEFAULT_REQUIRED_DOCS],
  },
  convenience: {
    vertical_type: 'convenience',
    fulfillment_type: 'pick_and_pack',
    category_taxonomy_key: 'inventory_category',
    go_live_rule: 'catalog_imported',
    compliance_tier: 'standard',
    default_prep_time_mins: 20,
    max_delivery_radius_km: 10,
    required_document_types: [...DEFAULT_REQUIRED_DOCS],
  },
  retail: {
    vertical_type: 'retail',
    fulfillment_type: 'pick_and_pack',
    category_taxonomy_key: 'inventory_category',
    go_live_rule: 'catalog_imported',
    compliance_tier: 'standard',
    default_prep_time_mins: 25,
    max_delivery_radius_km: 10,
    required_document_types: [...DEFAULT_REQUIRED_DOCS],
  },
  pharmacy: {
    vertical_type: 'pharmacy',
    fulfillment_type: 'pick_and_pack',
    category_taxonomy_key: 'inventory_category',
    go_live_rule: 'catalog_imported',
    compliance_tier: 'regulated',
    default_prep_time_mins: 30,
    max_delivery_radius_km: 10,
    required_document_types: [...DEFAULT_REQUIRED_DOCS, 'pharmacy_permit'],
  },
  alcohol: {
    vertical_type: 'alcohol',
    fulfillment_type: 'pick_and_pack',
    category_taxonomy_key: 'inventory_category',
    go_live_rule: 'catalog_imported',
    compliance_tier: 'regulated',
    default_prep_time_mins: 25,
    max_delivery_radius_km: 10,
    required_document_types: [...DEFAULT_REQUIRED_DOCS, 'liquor_license'],
  },
};

export function getVerticalPreset(vertical: VerticalType): VerticalPresetFields {
  return {
    ...VERTICAL_PRESET_TABLE[resolveVerticalType(vertical)],
    required_document_types: [...VERTICAL_PRESET_TABLE[resolveVerticalType(vertical)].required_document_types],
  };
}

export function normalizeRequiredDocumentTypes(
  docs: MerchantDocumentType[] | string[] | undefined,
  vertical?: VerticalType | string | null,
): MerchantDocumentType[] {
  const allowed = new Set<string>(DEFAULT_REQUIRED_DOCS);
  const merged = new Set<MerchantDocumentType>([...DEFAULT_REQUIRED_DOCS]);
  for (const doc of docs ?? []) {
    if (allowed.has(doc) || doc === 'liquor_license' || doc === 'pharmacy_permit') {
      merged.add(doc as MerchantDocumentType);
    }
  }
  const v = vertical ? resolveVerticalType(vertical) : null;
  const permit = v ? REGULATED_PERMIT_DOC[v] : undefined;
  if (permit) merged.add(permit);
  return [...merged];
}

export function applyVerticalPreset(
  config: MerchantBusinessTypeConfig,
  vertical: VerticalType,
  options?: { preserveCustomDocs?: boolean },
): MerchantBusinessTypeConfig {
  const preset = getVerticalPreset(vertical);
  const required_document_types = options?.preserveCustomDocs
    ? normalizeRequiredDocumentTypes(config.required_document_types, vertical)
    : [...preset.required_document_types];

  return {
    ...config,
    ...preset,
    id: config.id,
    label: config.label,
    section_id: config.section_id,
    sort_order: config.sort_order,
    is_active: config.is_active,
    category_tags: config.category_tags,
    required_document_types,
  };
}

export function getDefaultConfig(
  partial?: Partial<MerchantBusinessTypeConfig> & { id?: string; label?: string },
): MerchantBusinessTypeConfig {
  const base = getVerticalPreset(partial?.vertical_type ?? 'restaurant');
  return {
    id: partial?.id ?? 'restaurant',
    section_id: partial?.section_id ?? 'food_service',
    label: partial?.label ?? 'Restaurant',
    sort_order: partial?.sort_order ?? 0,
    is_active: partial?.is_active ?? true,
    vertical_type: partial?.vertical_type ?? base.vertical_type,
    fulfillment_type: partial?.fulfillment_type ?? base.fulfillment_type,
    required_document_types: partial?.required_document_types
      ? normalizeRequiredDocumentTypes(partial.required_document_types, partial.vertical_type)
      : [...base.required_document_types],
    category_taxonomy_key: partial?.category_taxonomy_key ?? base.category_taxonomy_key,
    category_tags: partial?.category_tags ?? [],
    default_prep_time_mins: partial?.default_prep_time_mins ?? base.default_prep_time_mins,
    max_delivery_radius_km: partial?.max_delivery_radius_km ?? base.max_delivery_radius_km,
    compliance_tier: partial?.compliance_tier ?? base.compliance_tier,
    go_live_rule: partial?.go_live_rule ?? base.go_live_rule,
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

export function getCategoryTagsFromConfig(
  config: MerchantBusinessTypeConfig | null | undefined,
): string[] | null {
  const tags = config?.category_tags?.map((t) => t.trim()).filter(Boolean);
  return tags?.length ? tags : null;
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
