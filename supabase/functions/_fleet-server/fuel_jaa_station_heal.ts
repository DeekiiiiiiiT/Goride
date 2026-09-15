/**
 * After JAA statement↔driver link: stamp Verified GOD station when merchant uniquely matches.
 * Pure decision helper + KV attach for both twins.
 */

import * as kv from "./kv_store.tsx";
import {
  matchUniqueVerifiedStationForRecord,
  type MerchantMatchStation,
  type UniqueMerchantMatch,
} from "./merchant_station_match.ts";
import { odometerSequenceHealthy } from "./odometer_health.ts";
import { attachRecordIdToStation, type VerifiedStation } from "./station_attach.ts";
import { isAttachProtected } from "./station_attach_meta.ts";

const HEALABLE_STATUSES = new Set([
  "unknown",
  "review_required",
  "statement_vendor",
  "unverified",
  "",
]);

const AUTO_REASON = "Auto: JAA linked + unique merchant match";

function metaOf(entry: Record<string, unknown>): Record<string, unknown> {
  const m = entry?.metadata;
  return m && typeof m === "object" ? (m as Record<string, unknown>) : {};
}

/** True when fill still needs GOD station stamp (or verified only via issuer statement label). */
export function entryNeedsMerchantStationHeal(entry: Record<string, unknown>): boolean {
  if (isAttachProtected(entry)) return false;
  const meta = metaOf(entry);
  const status = String(meta.locationStatus || "unknown");
  const method = String(meta.verificationMethod || "");
  if (status === "verified" && method && method !== "jaa_issuer_statement") {
    return false;
  }
  if (status === "verified" && method === "jaa_issuer_statement") return true;
  return HEALABLE_STATUSES.has(status);
}

export type JaaPairMerchantHealDecision =
  | { heal: false; reason: string }
  | {
    heal: true;
    stationId: string;
    stationName: string;
    score: number;
    merchantText: string;
  };

/**
 * Pure gate: unique GOD merchant match + healthy odo (caller supplies odo result).
 * Prefers strongest unique match across statement and driver merchant strings.
 */
export function evaluateJaaPairMerchantHeal(params: {
  statement: Record<string, unknown>;
  driver: Record<string, unknown>;
  stations: MerchantMatchStation[];
  odoHealthy: boolean;
  isFirstFill: boolean;
}): JaaPairMerchantHealDecision {
  const { statement, driver, stations, odoHealthy, isFirstFill } = params;

  const needsStmt = entryNeedsMerchantStationHeal(statement);
  const needsDrv = entryNeedsMerchantStationHeal(driver);
  if (!needsStmt && !needsDrv) {
    return { heal: false, reason: "Both sides already station-verified" };
  }
  if (!odoHealthy) {
    return { heal: false, reason: "Odometer sequence unhealthy" };
  }
  if (!stations.length) {
    return { heal: false, reason: "No verified stations" };
  }

  const preferStrong = isFirstFill;
  let best: UniqueMerchantMatch | null = null;
  for (const record of [statement, driver]) {
    const hit = matchUniqueVerifiedStationForRecord(record, stations, { preferStrong });
    if (!hit) continue;
    if (!best || hit.score > best.score) best = hit;
  }
  if (!best) {
    return { heal: false, reason: "No unique merchant match" };
  }

  // First fill: require strong rematch lands on same station
  if (isFirstFill) {
    const strongStmt = matchUniqueVerifiedStationForRecord(statement, stations, {
      preferStrong: true,
    });
    const strongDrv = matchUniqueVerifiedStationForRecord(driver, stations, {
      preferStrong: true,
    });
    const strong = [strongStmt, strongDrv]
      .filter(Boolean)
      .sort((a, b) => (b!.score - a!.score))[0];
    if (!strong || strong.station.id !== best.station.id) {
      return { heal: false, reason: "First fill needs stronger unique match" };
    }
  }

  return {
    heal: true,
    stationId: String(best.station.id),
    stationName: String(best.station.name || best.station.id),
    score: best.score,
    merchantText: best.merchantText,
  };
}

export type AttachJaaPairResult = {
  attached: boolean;
  reason?: string;
  stationId?: string;
  stationName?: string;
  score?: number;
  updatedIds?: string[];
};

/**
 * Persist GOD station on both linked fuel_entry ids when evaluate passes.
 */
export async function attachJaaPairIfUniqueMerchant(
  statement: Record<string, unknown>,
  driver: Record<string, unknown>,
  opts?: { stations?: VerifiedStation[]; vehicleTimeline?: Record<string, unknown>[] },
): Promise<AttachJaaPairResult> {
  const stmtId = String(statement.id || "");
  const drvId = String(driver.id || "");
  if (!stmtId || !drvId) {
    return { attached: false, reason: "Missing pair ids" };
  }

  const stations =
    opts?.stations ||
    ((await kv.getByPrefix("station:")) || []).filter(
      (s: VerifiedStation) => s && s.id && (!s.status || s.status === "verified"),
    );

  const odoSeed = driver.odometer != null ? driver : statement;
  const odo = await odometerSequenceHealthy(
    {
      id: odoSeed.id as string | undefined,
      vehicleId: (driver.vehicleId || statement.vehicleId) as string | undefined,
      date: (driver.date || statement.date) as string | undefined,
      odometer: odoSeed.odometer as number | string | null | undefined,
    },
    opts?.vehicleTimeline ? { vehicleTimeline: opts.vehicleTimeline } : undefined,
  );

  const decision = evaluateJaaPairMerchantHeal({
    statement,
    driver,
    stations: stations as MerchantMatchStation[],
    odoHealthy: odo.healthy,
    isFirstFill: odo.isFirstFill,
  });

  if (!decision.heal) {
    return { attached: false, reason: decision.reason };
  }

  const stationFull =
    stations.find((s) => s.id === decision.stationId) ||
    ({ id: decision.stationId, name: decision.stationName, status: "verified" } as VerifiedStation);

  const updatedIds: string[] = [];
  for (const entryId of [stmtId, drvId]) {
    const result = await attachRecordIdToStation(entryId, stationFull, {
      method: "jaa_match_merchant_heal",
      reason: AUTO_REASON,
      autoHealScore: decision.score,
      autoHealMerchantText: decision.merchantText,
      dismissLearnt: true,
    });
    if (result.ok) updatedIds.push(entryId);
  }

  if (updatedIds.length === 0) {
    return {
      attached: false,
      reason: "Attach skipped (already assigned or protected)",
      stationId: decision.stationId,
      stationName: decision.stationName,
      score: decision.score,
    };
  }

  return {
    attached: true,
    stationId: decision.stationId,
    stationName: decision.stationName,
    score: decision.score,
    updatedIds,
  };
}

export { AUTO_REASON as JAA_PAIR_MERCHANT_HEAL_REASON };
