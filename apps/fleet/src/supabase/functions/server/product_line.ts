/**
 * Product line scoping — Roam Fleet (rideshare) vs Roam Enterprise (multi-vertical).
 */
import type { Context } from "npm:hono";

export type ProductLine = "fleet" | "enterprise";

const VALID: ProductLine[] = ["fleet", "enterprise"];

export function isProductLine(v: unknown): v is ProductLine {
  return typeof v === "string" && (VALID as string[]).includes(v);
}

export function platformSettingsKvKey(productLine: ProductLine): string {
  return `platform:settings:${productLine}`;
}

/** Legacy single key — used for migration fallback only */
export const LEGACY_PLATFORM_SETTINGS_KEY = "platform:settings";

/**
 * Resolve product line from request (header wins, then Origin host).
 */
export function resolveProductLine(c: Context): ProductLine {
  const header = c.req.header("X-Roam-Product-Line")?.trim().toLowerCase();
  if (isProductLine(header)) return header;

  const origin = c.req.header("Origin")?.toLowerCase() || "";
  const referer = c.req.header("Referer")?.toLowerCase() || "";
  const hostHint = origin || referer;
  if (hostHint.includes("roamenterprise")) return "enterprise";
  if (hostHint.includes("roamfleet")) return "fleet";

  return "fleet";
}

export function inferProductLineFromUser(meta: Record<string, unknown> | undefined): ProductLine {
  const pl = meta?.productLine;
  if (isProductLine(pl)) return pl;
  const bt = meta?.businessType;
  if (bt === "rideshare") return "fleet";
  if (typeof bt === "string" && bt.length > 0) return "enterprise";
  return "enterprise";
}

export function assertFleetOwnerProductLine(
  meta: Record<string, unknown> | undefined,
  expected: ProductLine,
): boolean {
  return inferProductLineFromUser(meta) === expected;
}

export const ALL_BUSINESS_TYPES = [
  "rideshare",
  "delivery",
  "taxi",
  "trucking",
  "shipping",
] as const;

export type BusinessTypeKey = (typeof ALL_BUSINESS_TYPES)[number];

export function isEnabledBusinessType(
  settings: Record<string, unknown> | null | undefined,
  businessType: string,
): boolean {
  const map = (settings?.enabledBusinessTypes || {}) as Record<string, boolean>;
  if (map[businessType] === false) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: Product Line Filtering for Data Isolation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filter records by product line.
 * 
 * LEGACY BEHAVIOR: Records without a productLine field are INCLUDED
 * (graceful fallback for pre-migration data).
 * 
 * When `feature:product_line_filter` is enabled, this filter is applied
 * to ensure Roam Fleet data doesn't appear in Roam Enterprise and vice versa.
 */
export function filterByProductLine<T extends Record<string, unknown>>(
  records: T[],
  productLine: ProductLine,
): T[] {
  return records.filter((r) => {
    // Legacy: Records without productLine are included (pre-migration data)
    if (!r.productLine) return true;
    // Only include records matching the current product line
    return r.productLine === productLine;
  });
}

/**
 * STRICT filter: Only return records that explicitly match the product line.
 * Records without productLine are EXCLUDED.
 */
export function filterByProductLineStrict<T extends Record<string, unknown>>(
  records: T[],
  productLine: ProductLine,
): T[] {
  return records.filter((r) => {
    // STRICT: Exclude records without productLine
    if (!r.productLine) return false;
    return r.productLine === productLine;
  });
}

/**
 * Feature-flag controlled product line filter.
 */
export async function filterByProductLineSafe<T extends Record<string, unknown>>(
  records: T[],
  c: Context,
  options?: { strict?: boolean }
): Promise<T[]> {
  const { isFeatureEnabled, FEATURE_FLAGS } = await import("./feature_flags.ts");
  
  const useProductFilter = await isFeatureEnabled(FEATURE_FLAGS.PRODUCT_LINE_FILTER);
  
  if (!useProductFilter) {
    return records; // Product line filtering disabled
  }

  const productLine = resolveProductLine(c);

  if (options?.strict) {
    return filterByProductLineStrict(records, productLine);
  }
  
  return filterByProductLine(records, productLine);
}
