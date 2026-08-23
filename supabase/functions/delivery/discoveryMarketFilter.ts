/**
 * Resolve customer market from lat/lng for discovery filtering.
 */
import { resolveMarketForPoint } from "./admin/coverageZones.ts";

// deno-lint-ignore no-explicit-any
type ServiceSb = { from: (t: string) => any };

export type DiscoveryPinResolve = {
  marketId: string | null;
  parishId: string | null;
  parishBoundaryMode: boolean;
  marketIds: string[];
  covered: boolean;
  missingPin: boolean;
};

export async function resolveActiveMarketIdFromPin(
  sb: ServiceSb,
  latRaw: string | undefined,
  lngRaw: string | undefined,
): Promise<DiscoveryPinResolve> {
  const lat = latRaw != null && latRaw !== "" ? Number(latRaw) : NaN;
  const lng = lngRaw != null && lngRaw !== "" ? Number(lngRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return {
      marketId: null,
      parishId: null,
      parishBoundaryMode: false,
      marketIds: [],
      covered: false,
      missingPin: true,
    };
  }
  const resolved = await resolveMarketForPoint(sb, lat, lng);
  return {
    marketId: resolved.covered ? resolved.marketId : null,
    parishId: resolved.parishId,
    parishBoundaryMode: resolved.parishBoundaryMode,
    marketIds: resolved.covered ? resolved.marketIds : [],
    covered: resolved.covered,
    missingPin: false,
  };
}

/** Filter merchants by resolved pin — same town or same parish (parish_boundary mode). */
export function merchantMatchesDiscoveryPin(
  merchantMarketId: string | null | undefined,
  pin: DiscoveryPinResolve,
): boolean {
  if (!pin.covered || !merchantMarketId) return false;
  const mid = String(merchantMarketId);
  if (pin.parishBoundaryMode) return pin.marketIds.includes(mid);
  return pin.marketId === mid;
}
