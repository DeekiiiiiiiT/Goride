/**
 * Resolve customer market from lat/lng for discovery filtering.
 */
import { resolveMarketForPoint } from "./admin/coverageZones.ts";

// deno-lint-ignore no-explicit-any
type ServiceSb = { from: (t: string) => any };

export async function resolveActiveMarketIdFromPin(
  sb: ServiceSb,
  latRaw: string | undefined,
  lngRaw: string | undefined,
): Promise<{ marketId: string | null; covered: boolean; missingPin: boolean }> {
  const lat = latRaw != null && latRaw !== "" ? Number(latRaw) : NaN;
  const lng = lngRaw != null && lngRaw !== "" ? Number(lngRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return { marketId: null, covered: false, missingPin: true };
  }
  const resolved = await resolveMarketForPoint(sb, lat, lng);
  return {
    marketId: resolved.covered ? resolved.marketId : null,
    covered: resolved.covered,
    missingPin: false,
  };
}
