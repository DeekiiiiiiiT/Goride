/**
 * Route-based toll estimation for fare quotes.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decodeEncodedPolyline } from "../../_shared/polylineDecode.ts";
import { routeCrossesPlaza, type TollPlazaGeo } from "../../_shared/tollGeofenceCore.ts";
import { loadTollPlazas, type LoadedTollPlaza } from "./tollPlazaLoader.ts";

export interface EstimatedTollPlaza {
  toll_plaza_id: string;
  toll_plaza_name: string;
  toll_amount_minor: number;
  currency: string;
}

export interface RouteTollEstimate {
  estimatedTollsMinor: number;
  plazas: EstimatedTollPlaza[];
}

function toPlazaGeo(p: LoadedTollPlaza): TollPlazaGeo {
  return {
    id: p.id,
    name: p.name,
    location: p.location,
    geofenceRadius: p.geofenceRadius,
    defaultRateMinor: p.defaultRateMinor,
    currency: p.currency,
  };
}

export async function estimateRouteTolls(
  db: SupabaseClient,
  encodedPolyline: string,
  fallbackGeofenceRadiusM = 100,
): Promise<RouteTollEstimate> {
  const routePoints = decodeEncodedPolyline(encodedPolyline);
  if (routePoints.length === 0) {
    return { estimatedTollsMinor: 0, plazas: [] };
  }

  const plazas = await loadTollPlazas(db);
  const matched: EstimatedTollPlaza[] = [];
  let total = 0;

  for (const plaza of plazas) {
    const geo = toPlazaGeo(plaza);
    if (!routeCrossesPlaza(routePoints, geo, fallbackGeofenceRadiusM)) continue;
    matched.push({
      toll_plaza_id: plaza.id,
      toll_plaza_name: plaza.name,
      toll_amount_minor: plaza.defaultRateMinor,
      currency: plaza.currency,
    });
    total += plaza.defaultRateMinor;
  }

  return { estimatedTollsMinor: total, plazas: matched };
}
