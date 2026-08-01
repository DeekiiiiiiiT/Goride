/**
 * Deno mirror of @roam/business-config BUSINESS_TYPE_KEYS.
 * Keep in sync when adding types — packages cannot be imported from edge Deno easily.
 */
export const ALL_BUSINESS_TYPES = [
  "rideshare",
  "delivery",
  "taxi",
  "trucking",
  "shipping",
  "freight_forwarding",
] as const;

export type BusinessTypeKey = (typeof ALL_BUSINESS_TYPES)[number];

export const ENTERPRISE_BUSINESS_TYPES: BusinessTypeKey[] = [
  "freight_forwarding",
  "trucking",
  "shipping",
  "delivery",
];

export function isKnownBusinessType(value: string): value is BusinessTypeKey {
  return (ALL_BUSINESS_TYPES as readonly string[]).includes(value);
}
