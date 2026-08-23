import type { MerchantBusinessTypeConfig, MerchantDocumentType } from '@roam/types';
import { MERCHANT_DOCUMENT_TYPES, BASE_MERCHANT_DOCUMENT_TYPES } from '@roam/types';
import { isRegulatedVertical, REGULATED_PERMIT_DOC, resolveVerticalType } from '@roam/vertical-config';

const ALLOWED_TAXONOMY = new Set(['cuisine', 'inventory_category', 'none']);

export type MetadataValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validateBusinessTypeMetadata(
  config: MerchantBusinessTypeConfig,
): MetadataValidationResult {
  const errors: string[] = [];
  const vertical = resolveVerticalType(config.vertical_type);

  if (config.default_prep_time_mins < 5 || config.default_prep_time_mins > 120) {
    errors.push('Default prep time must be between 5 and 120 minutes.');
  }
  if (config.max_delivery_radius_km < 1 || config.max_delivery_radius_km > 50) {
    errors.push('Max delivery radius must be between 1 and 50 km.');
  }
  if (!ALLOWED_TAXONOMY.has(config.category_taxonomy_key)) {
    errors.push('Invalid category taxonomy.');
  }

  if (config.category_taxonomy_key !== 'none') {
    const tags = (config.category_tags ?? []).map((t) => t.trim()).filter(Boolean);
    if (tags.length > 50) {
      errors.push('A business type can have at most 50 category tags.');
    }
    const seen = new Set<string>();
    for (const tag of tags) {
      if (tag.length > 80) {
        errors.push('Each category tag must be 80 characters or fewer.');
        break;
      }
      const key = tag.toLowerCase();
      if (seen.has(key)) {
        errors.push('Category tags must be unique.');
        break;
      }
      seen.add(key);
    }
  }

  const docs = config.required_document_types ?? [];
  for (const doc of docs) {
    if (!MERCHANT_DOCUMENT_TYPES.includes(doc as MerchantDocumentType)) {
      errors.push(`Invalid document type: ${doc}`);
    }
  }
  for (const base of BASE_MERCHANT_DOCUMENT_TYPES) {
    if (!docs.includes(base)) {
      errors.push(`Required document missing: ${base}`);
    }
  }

  if (isRegulatedVertical(vertical)) {
    const permit = REGULATED_PERMIT_DOC[vertical];
    if (permit && !docs.includes(permit)) {
      errors.push(`Regulated vertical requires: ${permit}`);
    }
    if (config.compliance_tier !== 'regulated') {
      errors.push('Regulated verticals must use regulated compliance tier.');
    }
  } else if (config.compliance_tier === 'regulated') {
    errors.push('Only pharmacy and alcohol verticals can use regulated compliance.');
  }

  return { valid: errors.length === 0, errors };
}

export { DOCUMENT_TYPE_LABELS } from '@roam/vertical-config';
