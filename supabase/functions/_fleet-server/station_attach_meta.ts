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

/** Fraud / conflict signals that must only clear via admin confirm (platform_ops_override). */
const STICKY_RESOLUTION_REASONS = new Set([
  "STATEMENT_MISMATCH",
  "DRIVER_CLAIM_CONFLICT",
]);

/** Admin hand-review stamp (e.g. suspicious statement↔driver pair) — only an admin may clear it. */
export function hasHandReview(entry: Record<string, unknown>): boolean {
  const meta = (entry.metadata || {}) as Record<string, unknown>;
  const review = meta.handReview as Record<string, unknown> | undefined;
  return !!review && typeof review === "object" && !!String(review.reason || "").trim();
}

/** Never overwrite GPS verified, sticky mismatch/conflict, hand review, or prior platform ops override. */
export function isAttachProtected(entry: Record<string, unknown>): boolean {
  const meta = (entry.metadata || {}) as Record<string, unknown>;
  const status = String(meta.locationStatus || "");
  const method = String(meta.verificationMethod || "");
  const resolution = (meta.stationResolution || {}) as Record<string, unknown>;
  const reason = String(resolution.reason || "");
  if (STICKY_RESOLUTION_REASONS.has(reason)) return true;
  if (hasHandReview(entry)) return true;
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
