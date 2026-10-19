/**
 * Weekly pin calibration suggestions (C7/C8).
 * Never moves pins automatically — returns suggestions for Dominion "Move pin".
 */
import * as kv from "./kv_store.tsx";
import { calculateDistance } from "./geo_matcher.ts";
import { extractEntryCoords } from "./fuel_station_match.ts";

export type PinCalibrationSuggestion = {
  stationId: string;
  stationName: string;
  currentLat: number;
  currentLng: number;
  suggestedLat: number;
  suggestedLng: number;
  medianDistanceM: number;
  sampleSize: number;
  geofenceRadiusM: number;
  p90DistanceM: number;
};

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function percentile(nums: number[], p: number): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1));
  return s[idx]!;
}

/**
 * For each verified station with ≥ minSamples GPS-verified fills, if median fix
 * is > 40 m from the pin, suggest moving the pin to the median coordinate.
 */
export async function computePinCalibrationSuggestions(
  opts?: { minSamples?: number; medianThresholdM?: number },
): Promise<PinCalibrationSuggestion[]> {
  const minSamples = opts?.minSamples ?? 10;
  const medianThresholdM = opts?.medianThresholdM ?? 40;

  const stations = ((await kv.getByPrefix("station:")) || []).filter(
    (s: any) => s && s.status === "verified" && s.location?.lat != null,
  );
  const entries = ((await kv.getByPrefix("fuel_entry:")) || []) as any[];

  const byStation = new Map<string, { lat: number; lng: number }[]>();
  for (const entry of entries) {
    const meta = entry.metadata || {};
    if (meta.verificationMethod !== "gps_handshake") continue;
    if (meta.locationStatus !== "verified") continue;
    const stationId = String(entry.matchedStationId || meta.matchedStationId || "");
    if (!stationId) continue;
    const coords = extractEntryCoords(entry);
    if (!coords) continue;
    const list = byStation.get(stationId) || [];
    list.push(coords);
    byStation.set(stationId, list);
  }

  const out: PinCalibrationSuggestion[] = [];
  for (const station of stations) {
    const samples = byStation.get(station.id) || [];
    if (samples.length < minSamples) continue;
    const distances = samples.map((p) =>
      calculateDistance(p.lat, p.lng, station.location.lat, station.location.lng)
    );
    const medDist = median(distances);
    if (medDist <= medianThresholdM) continue;
    const suggestedLat = median(samples.map((p) => p.lat));
    const suggestedLng = median(samples.map((p) => p.lng));
    out.push({
      stationId: station.id,
      stationName: station.name || station.id,
      currentLat: station.location.lat,
      currentLng: station.location.lng,
      suggestedLat,
      suggestedLng,
      medianDistanceM: Math.round(medDist),
      sampleSize: samples.length,
      geofenceRadiusM: Number(station.geofenceRadius) || 75,
      p90DistanceM: Math.round(percentile(distances, 0.9)),
    });
  }
  return out.sort((a, b) => b.medianDistanceM - a.medianDistanceM);
}
