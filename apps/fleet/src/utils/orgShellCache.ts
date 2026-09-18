/**
 * Persist last-known org shell (service lines + modules) so nav does not
 * flash incomplete after Delivery was added — first paint used rideshare-only
 * / all-modules-off until enterprise-modules returned.
 */
export type CachedServiceLine = 'rideshare' | 'rush_delivery';

const LINES_KEY = 'fleet_org_service_lines';
const MODULES_KEY = 'fleet_org_enabled_modules';

function normalizeLines(raw: unknown): CachedServiceLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((l): l is CachedServiceLine => l === 'rideshare' || l === 'rush_delivery');
}

export function readCachedServiceLines(): CachedServiceLine[] | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const lines = normalizeLines(JSON.parse(sessionStorage.getItem(LINES_KEY) || 'null'));
    return lines.length ? lines : null;
  } catch {
    return null;
  }
}

export function writeCachedServiceLines(lines: CachedServiceLine[]): void {
  if (typeof sessionStorage === 'undefined') return;
  const normalized = normalizeLines(lines);
  if (!normalized.length) return;
  try {
    sessionStorage.setItem(LINES_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore quota */
  }
}

export function readCachedEnabledModules(): Record<string, boolean> | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = JSON.parse(sessionStorage.getItem(MODULES_KEY) || 'null');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as Record<string, boolean>;
  } catch {
    return null;
  }
}

export function writeCachedEnabledModules(mods: Record<string, boolean>): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(MODULES_KEY, JSON.stringify(mods));
  } catch {
    /* ignore quota */
  }
}
