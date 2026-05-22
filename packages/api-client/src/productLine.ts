export type ProductLine = 'fleet' | 'enterprise';

const VALID: ProductLine[] = ['fleet', 'enterprise'];

function readEnvProductLine(): ProductLine | undefined {
  const raw =
    typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_PRODUCT_LINE;
  const v = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if ((VALID as string[]).includes(v)) return v as ProductLine;
  return undefined;
}

/** Build-time product line (defaults to fleet for roamfleet.co). */
export const PRODUCT_LINE: ProductLine = readEnvProductLine() ?? 'fleet';

export function getProductLineHeaders(): Record<string, string> {
  return { 'X-Roam-Product-Line': PRODUCT_LINE };
}

export function withProductLineHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  return { ...headers, ...getProductLineHeaders() };
}
