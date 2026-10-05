/**
 * Shared station match for gas-card fills and split fills.
 * One implementation so the two save paths cannot drift.
 */
import * as kv from "./kv_store.tsx";
import * as fuelLogic from "./fuel_logic.ts";
import { auditLogic } from "./audit_logic.ts";
import { findMatchingStationSmart } from "./geo_matcher.ts";

export type StationMatchOutcome =
  | "verified"
  | "review_required"
  | "ambiguous"
  | "learnt"
  | "no_gps"
  | "skipped";

export type StationMatchDeps = {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<any>;
  getByPrefix: (prefix: string) => Promise<any[]>;
};

const defaultDeps = (): StationMatchDeps => ({
  get: (key) => kv.get(key),
  set: (key, value) => kv.set(key, value),
  getByPrefix: (prefix) => kv.getByPrefix(prefix),
});

/** Bump visit + price stats on a station from a fuel entry (writes lastUpdated, not lastVisited). */
export function bumpStationPriceStats(
  station: Record<string, any>,
  entry: { date?: string; amount?: number; liters?: number },
): void {
  if (!station.stats) station.stats = {};
  const stats = station.stats;
  stats.totalVisits = (Number(stats.totalVisits) || 0) + 1;
  const nowIso = entry.date || new Date().toISOString();
  stats.lastUpdated = nowIso;
  const liters = Number(entry.liters) || 0;
  const amount = Number(entry.amount) || 0;
  if (liters > 0 && amount > 0) {
    const price = amount / liters;
    const prev = Number(stats.lastPrice) || 0;
    stats.lastPrice = price;
    const visits = Number(stats.totalVisits) || 1;
    const prevAvg = Number(stats.avgPrice) || 0;
    stats.avgPrice = prevAvg > 0 ? (prevAvg * (visits - 1) + price) / visits : price;
    if (prev > 0) {
      const delta = (price - prev) / prev;
      stats.priceTrend = delta > 0.02 ? "Up" : delta < -0.02 ? "Down" : "Stable";
    } else {
      stats.priceTrend = "Stable";
    }
  }
}

/**
 * Robust coordinate extraction from a fuel entry.
 * Must stay in parity with frontend coordinate extraction in GasStationAnalytics.tsx.
 */
export function extractEntryCoords(entry: any): { lat: number; lng: number } | null {
  const lat = Number(
    entry.lat ||
      entry.location?.lat ||
      entry.metadata?.lat ||
      entry.geofenceMetadata?.lat ||
      entry.metadata?.locationMetadata?.lat ||
      entry.locationMetadata?.lat ||
      entry.metadata?.location?.lat,
  );
  const lng = Number(
    entry.lng ||
      entry.location?.lng ||
      entry.metadata?.lng ||
      entry.geofenceMetadata?.lng ||
      entry.metadata?.locationMetadata?.lng ||
      entry.locationMetadata?.lng ||
      entry.metadata?.location?.lng,
  );
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return null;
  return { lat, lng };
}

/** GPS accuracy in meters for smart matching (Phase 1 geofence buffer). */
export function extractEntryGpsAccuracyMeters(entry: any): number {
  const raw = Number(
    entry.geofenceMetadata?.accuracy ??
      entry.metadata?.geofenceMetadata?.accuracy ??
      entry.metadata?.locationMetadata?.accuracy ??
      entry.locationMetadata?.accuracy,
  );
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(raw, 500);
}

async function signVerifiedEntry(
  entry: Record<string, any>,
  station: any,
  deferSignature: boolean,
): Promise<void> {
  const isVerified = station?.status === "verified";
  if (!deferSignature && isVerified) {
    entry.signature = await auditLogic.generateRecordHash(entry);
    entry.signedAt = new Date().toISOString();
  } else if (!isVerified) {
    entry.auditStatus = "Review Required";
  }

  const confidence = fuelLogic.calculateConfidenceScore(entry, station);
  entry.metadata = {
    ...entry.metadata,
    auditConfidenceScore: confidence.score,
    auditConfidenceBreakdown: confidence.breakdown,
    isHighlyTrusted: confidence.isHighlyTrusted,
  };

  if (!deferSignature && confidence.isHighlyTrusted && isVerified && !entry.isLocked) {
    entry.isLocked = true;
    entry.lockedAt = new Date().toISOString();
    entry.auditStatus = "Auto-Locked";
    entry.signature = await auditLogic.generateRecordHash(entry);
    console.log(`[Auto-Lock] Entry ${entry.id} locked and signed with score ${confidence.score}`);
  }
}

/**
 * Match GPS (or an explicit station pick) onto a fuel entry.
 * Mutates `entry`. Does not write the held no-GPS transaction — the caller does,
 * so a split fill can keep both rows.
 */
export async function applyStationMatch(
  entry: Record<string, any>,
  opts?: { deferSignature?: boolean; deps?: StationMatchDeps },
): Promise<{ outcome: StationMatchOutcome; stations: any[] }> {
  const deferSignature = opts?.deferSignature === true;
  const deps = opts?.deps ?? defaultDeps();

  const entryCoords = extractEntryCoords(entry);
  if (entryCoords && !entry.lat) {
    entry.lat = entryCoords.lat;
    entry.lng = entryCoords.lng;
  }

  const entryLat = entryCoords?.lat || 0;
  const entryLng = entryCoords?.lng || 0;

  let skipGpsMatching = false;
  const metaImportSource = String(entry.metadata?.importSource || "");
  const isJaaIssuerStatement =
    metaImportSource === "jaa_raw" ||
    !!entry.metadata?.jaaImportId ||
    !!(entry.metadata?.jaaReceiptNumber && entry.type === "Card_Transaction" && entry.entrySource === "fuel-card");
  if (isJaaIssuerStatement) {
    skipGpsMatching = true;
    entry.metadata = {
      ...(entry.metadata || {}),
      locationStatus: entry.metadata?.locationStatus || "statement_vendor",
      verificationMethod: entry.metadata?.verificationMethod || "jaa_issuer_statement",
      stationGateHold: false,
    };
    if (!entry.location && (entry.vendor || entry.metadata?.originalVendor)) {
      entry.location = entry.vendor || entry.metadata.originalVendor;
    }
    const vendorFromMeta = String(entry.metadata?.stationLocation || entry.location || "").trim();
    if (vendorFromMeta && (!entry.location || entry.location === "Unknown")) {
      entry.location = vendorFromMeta;
    }
    return { outcome: "skipped", stations: [] };
  }

  if (entry.matchedStationId) {
    const manualStation = await deps.get(`station:${entry.matchedStationId}`);
    if (manualStation && manualStation.status === "verified") {
      skipGpsMatching = true;
      bumpStationPriceStats(manualStation, entry);
      await deps.set(`station:${manualStation.id}`, manualStation);

      entry.vendor = manualStation.name;
      entry.location = manualStation.name;
      entry.stationAddress = manualStation.address || entry.stationAddress || "";
      entry.metadata = {
        ...entry.metadata,
        locationStatus: "verified",
        verificationMethod: "manual_admin_override",
        matchedStationId: manualStation.id,
        matchConfidence: "manual",
        stationGateHold: false,
      };
      await signVerifiedEntry(entry, manualStation, deferSignature);
      console.log(
        `[ManualOverride] Entry ${entry.id} manually linked to verified station "${manualStation.name}" (${manualStation.id})`,
      );
      return { outcome: "verified", stations: [] };
    }
  }

  const allStationsForEntry =
    !skipGpsMatching && entryCoords ? (await deps.getByPrefix("station:")) || [] : [];

  if (!skipGpsMatching && entryCoords) {
    const gpsAccuracyM = extractEntryGpsAccuracyMeters(entry);
    const smartResult = findMatchingStationSmart(
      entryLat,
      entryLng,
      allStationsForEntry,
      600,
      gpsAccuracyM,
    );

    if (smartResult.station && (smartResult.confidence === "high" || smartResult.confidence === "medium")) {
      const matchedStation = smartResult.station as any;
      bumpStationPriceStats(matchedStation, entry);
      const isVerified = matchedStation.status === "verified";
      await deps.set(`station:${matchedStation.id}`, matchedStation);

      entry.matchedStationId = matchedStation.id;
      entry.vendor = matchedStation.name;
      entry.location = matchedStation.name;
      entry.stationAddress = matchedStation.address || entry.stationAddress || "";
      entry.metadata = {
        ...entry.metadata,
        locationStatus: isVerified ? "verified" : "review_required",
        verificationMethod: "gps_handshake",
        matchedStationId: matchedStation.id,
        matchDistance: smartResult.distance,
        matchConfidence: smartResult.confidence,
      };

      await signVerifiedEntry(entry, matchedStation, deferSignature);
      console.log(
        `[SmartGeoMatch] POST entry ${entry.id} matched "${matchedStation.name}" (${matchedStation.id}) at ${smartResult.distance}m [${smartResult.confidence}]`,
      );
      return {
        outcome: isVerified ? "verified" : "review_required",
        stations: allStationsForEntry,
      };
    }

    if (smartResult.confidence === "ambiguous") {
      entry.metadata = {
        ...entry.metadata,
        locationStatus: "review_required",
        verificationMethod: "gps_ambiguous",
        matchDistance: smartResult.distance,
        matchConfidence: "ambiguous",
        ambiguityReason: smartResult.ambiguityReason,
      };
      entry.auditStatus = "Review Required";
      const closestStation = smartResult.station as any;
      if (closestStation) {
        entry.matchedStationId = closestStation.id;
        entry.vendor = closestStation.name;
        entry.metadata = {
          ...entry.metadata,
          matchedStationId: closestStation.id,
        };
        const confidence = fuelLogic.calculateConfidenceScore(entry, closestStation);
        entry.metadata = {
          ...entry.metadata,
          auditConfidenceScore: confidence.score,
          auditConfidenceBreakdown: confidence.breakdown,
          isHighlyTrusted: confidence.isHighlyTrusted,
        };
      }
      console.log(`[SmartGeoMatch] Ambiguous match for entry ${entry.id}. ${smartResult.ambiguityReason}`);
      return { outcome: "ambiguous", stations: allStationsForEntry };
    }

    if (!entry.metadata) entry.metadata = {};
    let learntId = entry.metadata.learntLocationId as string | undefined;
    if (!learntId) {
      learntId = crypto.randomUUID();
      const learntLocation = {
        id: learntId,
        name: entry.vendor || entry.stationName || "Unknown Vendor",
        location: { lat: entryLat, lng: entryLng },
        status: "learnt",
        firstSeen: entry.date || new Date().toISOString(),
        sourceEntryId: entry.id,
        driverId: entry.driverId,
        vehicleId: entry.vehicleId,
      };
      await deps.set(`learnt_location:${learntId}`, learntLocation);
      console.log(`[SmartGeoMatch] No match for entry ${entry.id} — created Learnt Location: ${learntId}`);
    }
    entry.metadata = {
      ...entry.metadata,
      locationStatus: "unknown",
      verificationMethod: "none",
      learntLocationId: learntId,
    };
    return { outcome: "learnt", stations: allStationsForEntry };
  }

  if (!skipGpsMatching) {
    const learntId = crypto.randomUUID();
    const learntLocation = {
      id: learntId,
      name: entry.vendor || entry.stationName || "Unknown Vendor",
      location: { lat: null, lng: null },
      status: "learnt",
      firstSeen: entry.date || new Date().toISOString(),
      sourceEntryId: entry.id,
      driverId: entry.driverId,
      vehicleId: entry.vehicleId,
      transactionId: entry.id,
      gateReason: "No GPS coordinates provided ? cannot verify station",
    };
    await deps.set(`learnt_location:${learntId}`, learntLocation);
    entry.metadata = {
      ...(entry.metadata || {}),
      stationGateHold: true,
      locationStatus: "unknown",
      verificationMethod: "none",
      gateReason: "No GPS coordinates ? station gate held",
      learntLocationId: learntId,
    };
    return { outcome: "no_gps", stations: [] };
  }

  return { outcome: "skipped", stations: allStationsForEntry };
}

/** Sign and auto-lock a verified card half after both split rows are stored. */
export async function signMatchedFuelEntry(
  entry: Record<string, any>,
  deps?: StationMatchDeps,
): Promise<void> {
  const store = deps ?? defaultDeps();
  const meta = entry.metadata || {};
  if (meta.locationStatus !== "verified" || !entry.matchedStationId) return;
  const station = await store.get(`station:${entry.matchedStationId}`);
  await signVerifiedEntry(entry, station, false);
}

/** Copy the card half's station result onto the cash half. Visit count stays on the card match. */
export function mirrorStationOntoCash(
  cardEntry: Record<string, unknown>,
  cashTx: Record<string, unknown>,
): void {
  const meta =
    cardEntry.metadata && typeof cardEntry.metadata === "object"
      ? (cardEntry.metadata as Record<string, unknown>)
      : {};
  if (cardEntry.vendor) cashTx.vendor = cardEntry.vendor;
  if (cardEntry.matchedStationId) cashTx.matchedStationId = cardEntry.matchedStationId;
  if (cardEntry.location) cashTx.location = cardEntry.location;
  const cashMeta =
    cashTx.metadata && typeof cashTx.metadata === "object"
      ? { ...(cashTx.metadata as Record<string, unknown>) }
      : {};
  cashTx.metadata = {
    ...cashMeta,
    matchedStationId: (cardEntry.matchedStationId as string | undefined) ?? null,
    locationStatus: meta.locationStatus ?? null,
    verificationMethod: meta.verificationMethod ?? null,
    stationLocation: (cardEntry.stationAddress as string) || (meta.stationLocation as string) || "",
    ...(meta.learntLocationId ? { learntLocationId: meta.learntLocationId } : {}),
  };
}
