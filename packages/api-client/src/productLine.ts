import { publicAnonKey } from './supabaseInfo';

export type ProductLine = 'fleet' | 'enterprise';

export type SettingsSegment =
  | 'global'
  | 'fleet'
  | 'enterprise'
  | 'rides'
  | 'driver'
  | 'haul'
  | 'dash'
  | 'courier';

export type ProductLineSegment = 'fleet' | 'enterprise';

const VALID: ProductLine[] = ['fleet', 'enterprise'];

const VALID_SEGMENTS: SettingsSegment[] = [
  'global',
  'fleet',
  'enterprise',
  'rides',
  'driver',
  'haul',
  'dash',
  'courier',
];

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

export function isSettingsSegment(value: string): value is SettingsSegment {
  return (VALID_SEGMENTS as string[]).includes(value);
}

export function getProductLineHeaders(): Record<string, string> {
  return { 'X-Roam-Product-Line': PRODUCT_LINE };
}

export function getSettingsSegmentHeaders(segment: SettingsSegment): Record<string, string> {
  return { 'X-Roam-Settings-Segment': segment };
}

export function withProductLineHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  return { ...headers, ...getProductLineHeaders() };
}

export function withSettingsSegmentHeaders(
  segment: SettingsSegment,
  headers: Record<string, string> = {},
): Record<string, string> {
  const productLineSegment =
    segment === 'fleet' || segment === 'enterprise' ? segment : undefined;
  return {
    apikey: publicAnonKey,
    ...headers,
    ...getSettingsSegmentHeaders(segment),
    ...(productLineSegment
      ? { 'X-Roam-Product-Line': productLineSegment }
      : {}),
  };
}
