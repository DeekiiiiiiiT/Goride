import type { MerchantBusinessTypeConfig } from '@roam/types';
import { resolveVerticalType } from '@roam/vertical-config';

export function businessTypeIcon(config: MerchantBusinessTypeConfig | null): string {
  const vertical = resolveVerticalType(config?.vertical_type);
  if (vertical === 'pharmacy') return 'local_pharmacy';
  if (vertical === 'alcohol') return 'liquor';
  if (vertical === 'grocery' || vertical === 'convenience' || vertical === 'retail') {
    return 'local_grocery_store';
  }
  return 'storefront';
}

export function formatBusinessTypeFallback(businessTypeId: string): string {
  return businessTypeId
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
