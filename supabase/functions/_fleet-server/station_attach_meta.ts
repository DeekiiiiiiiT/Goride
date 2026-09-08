/**
 * Pure metadata helpers for station attach / merchant heal (no KV I/O).
 */

import type { StationAttachMethod, VerifiedStation } from "./station_attach_types.ts";

export type { StationAttachMethod, VerifiedStation };

function shouldOverwriteLocation(location: unknown): boolean {
  if (!location) return true;
  if (typeof location !== "string") return false;
  return location.toLowerCase().includes("unknown") || location === "Manual Entry";
}

/** Never overwrite GPS verified or prior platform ops override (auto-heal safety). */
export function isAttachProtected(entry: Record<string, unknown>): boolean {
  const meta = (entry.metadata || {}) as Record<string, unknown>;
  const status = String(meta.locationStatus || "");
  const method = String(meta.verificationMethod || "");
  if (status === "verified" && (method === "gps_smart_matching" || method === "gps_handshake")) {
    return true;
  }
  if (method === "platform_ops_override") return true;
  return false;
}

/** Apply merchant heal metadata in-memory (ingest or batch). Mutates entry. */
export function applyMerchantHealMetadata(
  entry: Record<string, unknown>,
  station: VerifiedStation,
  score: number,
  merchantText: string,
  method: StationAttachMethod = "merchant_name_autoheal",
): void {
  const attachedAt = new Date().toISOString();
  const stationName = station.name || "Verified Station";
  entry.matchedStationId = station.id;
  entry.vendor = stationName;
  if (shouldOverwriteLocation(entry.location)) {
    entry.location = stationName;
  }
  const meta: Record<string, unknown> = {
    ...(entry.metadata as object || {}),
    locationStatus: "verified",
    verificationMethod: method,
    matchedStationId: station.id,
    autoHealedAt: attachedAt,
    autoHealScore: score,
    autoHealMerchantText: merchantText,
  };
  delete meta.ambiguityReason;
  delete meta.stationGateHold;
  delete meta.holdReason;
  delete meta.gateReason;
  delete meta.learntLocationId;
  entry.metadata = meta;
}

export { shouldOverwriteLocation };
