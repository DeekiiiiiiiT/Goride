/**
 * Resolve customer market from lat/lng for discovery filtering.
 */
import { resolveMarketForPoint } from "./admin/coverageZones.ts";

type ServiceSb = {
  // deno-lint-ignore no-explicit-any
  from: (t: string) => any;
  rpc?: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export type DiscoveryPinResolve = {
  marketId: string | null;
  parishId: string | null;
  parishBoundaryMode: boolean;
  marketIds: string[];
  covered: boolean;
  missingPin: boolean;
  comingSoon: boolean;
  comingSoonName: string | null;
  comingSoonMarketId: string | null;
};

function emptyPin(missingPin: boolean): DiscoveryPinResolve {
  return {
    marketId: null,
    parishId: null,
    parishBoundaryMode: false,
    marketIds: [],
    covered: false,
    missingPin,
    comingSoon: false,
    comingSoonName: null,
    comingSoonMarketId: null,
  };
}

export function uncoveredPinPayload(pin: DiscoveryPinResolve) {
  return {
    out_of_coverage: !pin.missingPin && !pin.covered,
    missing_pin: pin.missingPin,
    coming_soon: pin.comingSoon,
    town_name: pin.comingSoonName,
    market_id: pin.comingSoonMarketId,
  };
}

async function inactiveWaitlistAtPoint(
  sb: ServiceSb,
  lat: number,
  lng: number,
): Promise<{ marketId: string; name: string } | null> {
  if (typeof sb.rpc !== "function") return null;
  const { data, error } = await sb.rpc("inactive_waitlist_at_point", { p_lat: lat, p_lng: lng });
  if (error || data == null) return null;
  const row = (Array.isArray(data) ? data[0] : data) as { market_id?: string; name?: string } | undefined;
  if (!row?.market_id || !row.name) return null;
  return { marketId: String(row.market_id), name: String(row.name) };
}

export async function resolveActiveMarketIdFromPin(
  sb: ServiceSb,
  latRaw: string | undefined,
  lngRaw: string | undefined,
): Promise<DiscoveryPinResolve> {
  const lat = latRaw != null && latRaw !== "" ? Number(latRaw) : NaN;
  const lng = lngRaw != null && lngRaw !== "" ? Number(lngRaw) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return emptyPin(true);
  }
  const resolved = await resolveMarketForPoint(sb, lat, lng);
  if (resolved.covered) {
    return {
      marketId: resolved.marketId,
      parishId: resolved.parishId,
      parishBoundaryMode: resolved.parishBoundaryMode,
      marketIds: resolved.marketIds,
      covered: true,
      missingPin: false,
      comingSoon: false,
      comingSoonName: null,
      comingSoonMarketId: null,
    };
  }
  const waiting = await inactiveWaitlistAtPoint(sb, lat, lng);
  return {
    ...emptyPin(false),
    parishId: resolved.parishId,
    comingSoon: Boolean(waiting),
    comingSoonName: waiting?.name ?? null,
    comingSoonMarketId: waiting?.marketId ?? null,
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
