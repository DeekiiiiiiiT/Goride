import {
  Car,
  Package,
  Navigation,
  Truck,
  Ship,
  Boxes,
  type LucideIcon,
} from 'lucide-react';
import {
  BUSINESS_TYPES,
  businessTypesForSegment,
  DEFAULT_BUSINESS_TYPE,
  DEFAULT_ENTERPRISE_BUSINESS_TYPE,
} from '@roam/business-config';

const ICON_MAP: Record<string, LucideIcon> = {
  Car,
  Package,
  Navigation,
  Truck,
  Ship,
  Boxes,
};

export const BIZ_ICON: Record<string, LucideIcon> = Object.fromEntries(
  BUSINESS_TYPES.map((bt) => [bt.key, ICON_MAP[bt.icon] ?? Car]),
);

export const BIZ_LABEL: Record<string, string> = Object.fromEntries(
  BUSINESS_TYPES.map((bt) => [bt.key, bt.label]),
);

export const BIZ_COLOR: Record<string, string> = {
  rideshare: 'bg-blue-500/15 text-blue-400',
  delivery: 'bg-amber-500/15 text-amber-400',
  taxi: 'bg-emerald-500/15 text-emerald-400',
  trucking: 'bg-purple-500/15 text-purple-400',
  shipping: 'bg-cyan-500/15 text-cyan-400',
  freight_forwarding: 'bg-orange-500/15 text-orange-400',
};

/** Alias matching product-line naming in specs. */
export const getBusinessTypesForProductLine = businessTypesForSegment;

export function defaultBusinessTypeForProductLine(
  productLine: 'enterprise' | 'fleet',
): string {
  return productLine === 'enterprise'
    ? DEFAULT_ENTERPRISE_BUSINESS_TYPE
    : DEFAULT_BUSINESS_TYPE;
}

export function businessTypeKeysForProductLine(
  productLine: 'enterprise' | 'fleet',
): string[] {
  return getBusinessTypesForProductLine(productLine).map((bt) => bt.key);
}
