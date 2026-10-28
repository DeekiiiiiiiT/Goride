/**
 * After JAA statement↔driver link: stamp Verified GOD station when merchant uniquely matches.
 * Pure decision helper + KV attach for both twins.
 */

import * as kv from "./kv_store.tsx";
import { listStationRecords } from "./fleet_table_read_thru.ts";
import {
  matchUniqueVerifiedStationForRecord,
  matchUniqueVerifiedStationForRecordAsync,
  type MerchantMatchStation,
  type UniqueMerchantMatch,
} from "./merchant_station_match.ts";
import { odometerSequenceHealthy } from "./odometer_health.ts";
import { attachRecordIdToStation, type VerifiedStation } from "./station_attach.ts";
import { isAttachProtected } from "./station_attach_meta.ts";
import { upsertStationMerchantAlias } from "./station_merchant_aliases.ts";

const HEALABLE_STATUSES = new Set([
  "unknown",
  "provisional",
  "review_required",
  "statement_vendor",
  "unverified",
  "",
]);

const AUTO_REASON = "Auto: JAA linked + unique merchant match";

function verifiedStationsOnly(rows: Array<Record<string, unknown>>): VerifiedStation[] {
  const out: VerifiedStation[] = [];
  for (const row of rows) {
    const id = row.id;
    const status = row.status;
    if (typeof id !== "string" || id.length === 0) continue;
    if (status != null && status !== "" && status !== "verified") continue;
    out.push(row as VerifiedStation);
  }
  return out;
}

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
  // Provisional late-logs promote when statement alias agrees
  if (status === "provisional") return true;
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
 * Registry-first merchant match; auto-writes issuer alias on fuzzy heal; flags STATEMENT_MISMATCH.
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
    verifiedStationsOnly((await listStationRecords()) || []);

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

  const orgId = String(
    (driver as any).organizationId ||
      (statement as any).organizationId ||
      metaOf(driver).organizationId ||
      metaOf(statement).organizationId ||
      "",
  );

  // Registry-first async match across both sides
  let bestAsync: UniqueMerchantMatch | null = null;
  for (const record of [statement, driver]) {
    const hit = await matchUniqueVerifiedStationForRecordAsync(
      record,
      stations as MerchantMatchStation[],
      { preferStrong: odo.isFirstFill, organizationId: orgId },
    );
    if (!hit) continue;
    if (!bestAsync || hit.score > bestAsync.score) bestAsync = hit;
  }

  // STATEMENT_MISMATCH: GPS-verified or provisional station disagrees with issuer alias
  const drvMeta = metaOf(driver);
  const drvStationId = String(
    driver.matchedStationId || drvMeta.matchedStationId || "",
  );
  const drvStatus = String(drvMeta.locationStatus || "");
  if (
    bestAsync &&
    drvStationId &&
    (drvStatus === "verified" || drvStatus === "provisional") &&
    drvStationId !== String(bestAsync.station.id)
  ) {
    const existing = (await kv.get(`fuel_entry:${drvId}`)) as Record<string, unknown> | null;
    if (existing) {
      const meta = metaOf(existing);
      existing.metadata = {
        ...meta,
        locationStatus: drvStatus === "provisional" ? "review_required" : meta.locationStatus,
        stationResolution: {
          ...(typeof meta.stationResolution === "object" ? meta.stationResolution as object : {}),
          state: "ambiguous",
          reason: "STATEMENT_MISMATCH",
          stationId: drvStationId,
          evidence: {
            ...(typeof (meta.stationResolution as any)?.evidence === "object"
              ? (meta.stationResolution as any).evidence
              : {}),
            statement: {
              issuerName: bestAsync.merchantText,
              aliasStationId: bestAsync.station.id,
            },
          },
          decidedBy: "statement_alias",
          decidedAt: new Date().toISOString(),
        },
        statementMismatchStationId: bestAsync.station.id,
        statementMismatchMerchant: bestAsync.merchantText,
      };
      await kv.set(`fuel_entry:${drvId}`, existing);
    }
    return {
      attached: false,
      reason: "STATEMENT_MISMATCH",
      stationId: bestAsync.station.id,
      stationName: String(bestAsync.station.name || ""),
      score: bestAsync.score,
    };
  }

  let decision: JaaPairMerchantHealDecision;
  if (bestAsync && (bestAsync.fromRegistry || bestAsync.score >= 0.88)) {
    // Provisional + agreeing alias → promote
    if (
      !odo.healthy &&
      !(drvStatus === "provisional" && bestAsync.fromRegistry)
    ) {
      decision = { heal: false, reason: "Odometer sequence unhealthy" };
    } else {
      decision = {
        heal: true,
        stationId: String(bestAsync.station.id),
        stationName: String(bestAsync.station.name || bestAsync.station.id),
        score: bestAsync.score,
        merchantText: bestAsync.merchantText,
      };
    }
  } else {
    decision = evaluateJaaPairMerchantHeal({
      statement,
      driver,
      stations: stations as MerchantMatchStation[],
      odoHealthy: odo.healthy,
      isFirstFill: odo.isFirstFill,
    });
  }

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

  // Teach the registry so the next statement is an exact hit
  if (orgId && decision.merchantText) {
    await upsertStationMerchantAlias({
      organizationId: orgId,
      issuer: "jaa",
      rawName: decision.merchantText,
      stationId: decision.stationId,
      source: "heal_auto",
    });
  }

  // Stamp stationResolution.decidedBy for provisional → verified promotion
  for (const entryId of updatedIds) {
    const entry = (await kv.get(`fuel_entry:${entryId}`)) as Record<string, unknown> | null;
    if (!entry) continue;
    const meta = metaOf(entry);
    entry.metadata = {
      ...meta,
      statementMerchant: decision.merchantText,
      stationResolution: {
        state: "verified",
        reason: "STATEMENT_ALIAS",
        stationId: decision.stationId,
        evidence: {
          ...(typeof (meta.stationResolution as any)?.evidence === "object"
            ? (meta.stationResolution as any).evidence
            : {}),
          statement: {
            issuerName: decision.merchantText,
            aliasStationId: decision.stationId,
          },
        },
        decidedBy: "statement_alias",
        decidedAt: new Date().toISOString(),
      },
    };
    await kv.set(`fuel_entry:${entryId}`, entry);

    // G2: stamp statement merchant onto any still-open learnt staging pin
    const learntId = String(meta.learntLocationId || "");
    if (learntId) {
      const learnt = (await kv.get(`learnt_location:${learntId}`)) as Record<string, unknown> | null;
      if (learnt) {
        await kv.set(`learnt_location:${learntId}`, {
          ...learnt,
          statementMerchant: decision.merchantText,
        });
      }
    }
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

/**
 * Merchant-heal a single unpaired statement row (no driver twin yet).
 * Used on JAA import / gate-promote so C2 does not strand alias-known vendors.
 */
export async function healUnpairedStatementEntry(
  entry: Record<string, unknown>,
  opts?: { stations?: VerifiedStation[] },
): Promise<AttachJaaPairResult> {
  const entryId = String(entry.id || "");
  if (!entryId) return { attached: false, reason: "Missing entry id" };
  if (!entryNeedsMerchantStationHeal(entry)) {
    return { attached: false, reason: "Not healable" };
  }

  const stations =
    opts?.stations ||
    verifiedStationsOnly((await listStationRecords()) || []);

  const orgId = String(
    (entry as { organizationId?: string }).organizationId ||
      metaOf(entry).organizationId ||
      "",
  );

  const hit = await matchUniqueVerifiedStationForRecordAsync(
    entry,
    stations as MerchantMatchStation[],
    { preferStrong: true, organizationId: orgId },
  );
  if (!hit || (!hit.fromRegistry && hit.score < 0.88)) {
    return { attached: false, reason: "No unique merchant match" };
  }

  const stationFull =
    stations.find((s) => s.id === hit.station.id) ||
    ({ id: hit.station.id, name: hit.station.name, status: "verified" } as VerifiedStation);

  const result = await attachRecordIdToStation(entryId, stationFull, {
    method: "jaa_match_merchant_heal",
    reason: "Auto: unpaired statement merchant match",
    autoHealScore: hit.score,
    autoHealMerchantText: hit.merchantText,
    dismissLearnt: true,
  });
  if (!result.ok) {
    return {
      attached: false,
      reason: result.reason || "Attach skipped",
      stationId: String(hit.station.id),
      stationName: String(hit.station.name || hit.station.id),
      score: hit.score,
    };
  }

  const saved = (await kv.get(`fuel_entry:${entryId}`)) as Record<string, unknown> | null;
  if (saved) {
    const meta = metaOf(saved);
    saved.metadata = {
      ...meta,
      statementMerchant: hit.merchantText,
      stationResolution: {
        state: "verified",
        reason: "STATEMENT_ALIAS",
        stationId: hit.station.id,
        evidence: {
          statement: {
            issuerName: hit.merchantText,
            aliasStationId: hit.station.id,
          },
        },
        decidedBy: "statement_alias",
        decidedAt: new Date().toISOString(),
      },
    };
    await kv.set(`fuel_entry:${entryId}`, saved);
  }

  return {
    attached: true,
    stationId: String(hit.station.id),
    stationName: String(hit.station.name || hit.station.id),
    score: hit.score,
    updatedIds: [entryId],
  };
}
