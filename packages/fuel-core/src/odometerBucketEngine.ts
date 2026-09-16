/**
 * Stop-to-stop odometer bucket engine.
 * Boundaries = fuel ops fills only; check-in/service are waypoints (never split buckets).
 * Join closing litres via referenceId — never formatted ledger id alone.
 */
import type {
  FuelEntry,
  MileageAdjustment,
  OdometerBucket,
  OdometerBucketAnchor,
  FuelCalcTrip,
  FuelCalcVehicle,
} from './fuelTypes.ts';
import {
  filterFuelOpsLogEntries,
  fuelOpsLiters,
  fuelOpsSpendAmount,
  countsInFuelLogSpend,
} from './fuelOpsEligibility.ts';
import { toEntryYmd, isEntryInHalfOpenYmdRange } from './fuelWeekRange.ts';
import { getTotalTripRideshareKm } from './tripRideshareKm.ts';
import {
  FALLBACK_EFFICIENCY_KM_L,
  TANK_OVERFLOW_MULT,
  UNACCOUNTED_DISTANCE_DEDUCTION_KM,
} from './constants.ts';
import {
  STOP_TO_STOP_GPS_TOLERANCE_KM,
  STOP_TO_STOP_GPS_TOLERANCE_PCT,
} from './stopToStopConservation.ts';

type Anchor = OdometerBucketAnchor & { kind: 'boundary' | 'waypoint' };

function normalizeSource(
  s?: string,
): 'fuel' | 'checkin' | 'service' | 'manual' | 'unknown' {
  const v = String(s || '').toLowerCase();
  if (v === 'fuel' || v.startsWith('fuel')) return 'fuel';
  if (v === 'checkin' || v === 'check_in' || v === 'check-in') return 'checkin';
  if (v === 'service') return 'service';
  if (v === 'manual') return 'manual';
  return 'unknown';
}

function resolveFuelEntryId(anchor: OdometerBucketAnchor): string | undefined {
  if (anchor.referenceId) return anchor.referenceId;
  const id = String(anchor.id || '');
  if (id.startsWith('fuel_')) return id.slice('fuel_'.length);
  return undefined;
}

function tripOverlapKm(
  t: FuelCalcTrip,
  startOdo: number,
  endOdo: number,
): number {
  const tripKm = getTotalTripRideshareKm(t);
  if (tripKm <= 0) return 0;
  const tripStart = t.startOdometer;
  const tripEnd = t.endOdometer;
  if (tripStart != null && tripEnd != null && tripEnd > tripStart) {
    const overlapStart = Math.max(tripStart, startOdo);
    const overlapEnd = Math.min(tripEnd, endOdo);
    const overlap = Math.max(0, overlapEnd - overlapStart);
    const tripLen = tripEnd - tripStart;
    return tripLen > 0 ? tripKm * (overlap / tripLen) : 0;
  }
  return 0;
}

export function calculateOdometerBuckets(
  vehicle: FuelCalcVehicle,
  fuelEntries: FuelEntry[],
  trips: FuelCalcTrip[],
  adjustments: MileageAdjustment[] = [],
  externalAnchors?: OdometerBucketAnchor[],
): OdometerBucket[] {
  const allOpsForVehicle = filterFuelOpsLogEntries(
    fuelEntries.filter((e) => e.vehicleId === vehicle.id),
  );

  let boundaries: Anchor[];
  let waypoints: Anchor[] = [];

  if (externalAnchors && externalAnchors.length >= 2) {
    const mapped: Anchor[] = externalAnchors.map((a) => {
      const source = normalizeSource(a.source);
      const refId = a.referenceId || resolveFuelEntryId(a);
      const isFuel =
        source === 'fuel' ||
        !!allOpsForVehicle.find(
          (e) =>
            e.id === refId ||
            (e.odometer === a.odometer && toEntryYmd(e.date) === toEntryYmd(a.date)),
        );
      return {
        ...a,
        date: toEntryYmd(a.date),
        source: isFuel ? 'fuel' : source,
        referenceId: refId,
        kind: (isFuel ? 'boundary' : 'waypoint') as
          | 'boundary'
          | 'waypoint',
      };
    });
    boundaries = mapped
      .filter((a) => a.kind === 'boundary')
      .sort((a, b) => a.odometer - b.odometer || a.date.localeCompare(b.date));
    waypoints = mapped.filter((a) => a.kind === 'waypoint');
    if (boundaries.length < 2) {
      boundaries = allOpsForVehicle
        .filter((e) => e.odometer != null && e.odometer > 0)
        .map((e) => ({
          id: e.id,
          date: toEntryYmd(e.date),
          odometer: e.odometer!,
          referenceId: e.id,
          source: 'fuel' as const,
          kind: 'boundary' as const,
        }))
        .sort((a, b) => a.odometer - b.odometer || a.date.localeCompare(b.date));
    }
  } else {
    boundaries = allOpsForVehicle
      .filter((e) => e.odometer != null && e.odometer > 0)
      .map((e) => ({
        id: e.id,
        date: toEntryYmd(e.date),
        odometer: e.odometer!,
        referenceId: e.id,
        source: 'fuel' as const,
        kind: 'boundary' as const,
      }))
      .sort((a, b) => a.odometer - b.odometer || a.date.localeCompare(b.date));
  }

  if (boundaries.length < 2) return [];

  const floating = allOpsForVehicle.filter(
    (e) =>
      countsInFuelLogSpend(e) &&
      // Null odo only — Floating+odo belongs in midBucketFuelEntries (N-3 disjointness).
      (e.odometer === undefined || e.odometer === null),
  );
  const floatingIds = new Set(floating.map((e) => e.id));

  const buckets: OdometerBucket[] = [];
  const odoEntries = allOpsForVehicle
    .filter(
      (e) =>
        e.odometer != null &&
        e.odometer > 0 &&
        fuelOpsLiters(e) > 0 &&
        countsInFuelLogSpend(e),
    )
    .sort((a, b) => (a.odometer || 0) - (b.odometer || 0));

  const bucketEfficiencyFuel =
    odoEntries.length >= 2
      ? odoEntries.slice(1).reduce((sum, e) => sum + fuelOpsLiters(e), 0)
      : 0;

  let bucketEfficiencyKmL = 0;
  if (odoEntries.length >= 3 && bucketEfficiencyFuel > 0) {
    const odoSpan =
      (odoEntries[odoEntries.length - 1].odometer || 0) - (odoEntries[0].odometer || 0);
    if (odoSpan > 0) bucketEfficiencyKmL = odoSpan / bucketEfficiencyFuel;
  }
  if (bucketEfficiencyKmL <= 0) {
    const cityEff = vehicle.fuelSettings?.efficiencyCity;
    if (cityEff && cityEff > 0) {
      bucketEfficiencyKmL = 100 / cityEff;
    } else {
      bucketEfficiencyKmL = FALLBACK_EFFICIENCY_KM_L;
    }
  }
  const avgEfficiency = 100 / bucketEfficiencyKmL;

  const findClosingFuelEntry = (endAnchor: Anchor): FuelEntry | undefined => {
    const refId = endAnchor.referenceId || resolveFuelEntryId(endAnchor);
    if (refId) {
      const byRef = allOpsForVehicle.find((e) => e.id === refId);
      if (byRef) return byRef;
    }
    return allOpsForVehicle.find(
      (e) =>
        e.odometer === endAnchor.odometer &&
        toEntryYmd(e.date) === toEntryYmd(endAnchor.date),
    );
  };

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startAnchor = boundaries[i];
    const endAnchor = boundaries[i + 1];
    const startOdo = startAnchor.odometer;
    const endOdo = endAnchor.odometer;
    const startYmd = toEntryYmd(startAnchor.date);
    const endYmd = toEntryYmd(endAnchor.date);
    const bucketDistance = endOdo - startOdo;

    const chainAnomaly =
      bucketDistance <= 0 || endYmd < startYmd;

    // Non-monotonic / non-positive distance → visible indeterminate row (never silent drop).
    if (bucketDistance <= 0) {
      buckets.push({
        id: `bucket_${vehicle.id}_${startOdo}_${endOdo}_${i}`,
        vehicleId: vehicle.id,
        startOdometer: startOdo,
        endOdometer: endOdo,
        startDate: startYmd,
        endDate: endYmd,
        actualFuelLiters: 0,
        actualFuelCost: 0,
        associatedReceipts: [],
        closingEntryId: endAnchor.referenceId || endAnchor.id,
        closingBoundarySource: normalizeSource(endAnchor.source),
        totalTripDistance: 0,
        tripsCount: 0,
        expectedFuelLiters: 0,
        varianceLiters: 0,
        variancePercent: 0,
        rideShareDistance: 0,
        personalDistance: 0,
        companyMiscDistance: 0,
        unaccountedDistance: 0,
        unexplainedDistance: 0,
        confidenceTier: 'indeterminate',
        confidenceReason: 'Odometer/date chain not monotonic',
        chainAnomaly: true,
        status: 'Anomaly',
      });
      continue;
    }

    const dist = bucketDistance;

    const windowReceipts = floating.filter((f) =>
      isEntryInHalfOpenYmdRange(f.date, startYmd, endYmd),
    );

    const closingFuelEntry = findClosingFuelEntry(endAnchor);
    const closingLiters = closingFuelEntry ? fuelOpsLiters(closingFuelEntry) : 0;
    const closingCost = closingFuelEntry ? fuelOpsSpendAmount(closingFuelEntry) : 0;

    const midBucketFuelEntries = allOpsForVehicle.filter(
      (e) =>
        countsInFuelLogSpend(e) &&
        !floatingIds.has(e.id) &&
        e.odometer != null &&
        e.odometer > startOdo &&
        e.odometer < endOdo &&
        e.id !== (startAnchor.referenceId || startAnchor.id) &&
        e.id !== (endAnchor.referenceId || endAnchor.id) &&
        e.id !== closingFuelEntry?.id,
    );

    const totalLiters =
      closingLiters +
      windowReceipts.reduce((sum, r) => sum + fuelOpsLiters(r), 0) +
      midBucketFuelEntries.reduce((sum, e) => sum + fuelOpsLiters(e), 0);
    const totalCost =
      closingCost +
      windowReceipts.reduce((sum, r) => sum + fuelOpsSpendAmount(r), 0) +
      midBucketFuelEntries.reduce((sum, e) => sum + fuelOpsSpendAmount(e), 0);

    const associatedReceipts = [
      ...(closingFuelEntry ? [closingFuelEntry.id] : []),
      ...windowReceipts.map((r) => r.id),
      ...midBucketFuelEntries.map((e) => e.id),
    ];

    let rideShareDistance = 0;
    let tripsCount = 0;
    for (const t of trips) {
      if (t.vehicleId !== vehicle.id) continue;
      if (t.status !== 'Completed' && t.status !== 'Cancelled') continue;
      if (t.startOdometer != null && t.endOdometer != null && t.endOdometer > t.startOdometer) {
        const km = tripOverlapKm(t, startOdo, endOdo);
        if (km > 0.001) {
          rideShareDistance += km;
          tripsCount += 1;
        }
      } else if (isEntryInHalfOpenYmdRange(t.date, startYmd, endYmd)) {
        const km = getTotalTripRideshareKm(t);
        if (km > 0) {
          rideShareDistance += km;
          tripsCount += 1;
        }
      }
    }

    const bucketAdjustments = adjustments.filter(
      (a) =>
        a.vehicleId === vehicle.id &&
        isEntryInHalfOpenYmdRange(a.date, startYmd, endYmd),
    );

    const companyMiscDistance = bucketAdjustments
      .filter((a) => a.type === 'Company_Misc' || a.type === 'Maintenance')
      .reduce((sum, a) => sum + (a.distance || 0), 0);

    const personalDistance = bucketAdjustments
      .filter((a) => a.type === 'Personal')
      .reduce((sum, a) => sum + (a.distance || 0), 0);

    const categoryEvidenceDistance =
      rideShareDistance + companyMiscDistance + personalDistance;
    const unexplainedDistance = Math.max(0, dist - categoryEvidenceDistance);
    const unaccountedDistance = Math.max(0, categoryEvidenceDistance - dist);

    const expectedFuelLiters = (dist / 100) * avgEfficiency;
    const varianceLiters = totalLiters - expectedFuelLiters;
    const variancePercent =
      expectedFuelLiters > 0 ? (varianceLiters / expectedFuelLiters) * 100 : 0;

    const tankCapacity =
      Number(vehicle.fuelSettings?.tankCapacity) ||
      Number(vehicle.specifications?.tankCapacity) ||
      0;
    const isOverflow = tankCapacity > 0 && totalLiters > tankCapacity * TANK_OVERFLOW_MULT;

    const gpsBand = Math.max(STOP_TO_STOP_GPS_TOLERANCE_KM, dist * STOP_TO_STOP_GPS_TOLERANCE_PCT);
    const overLogBeyondTolerance = unaccountedDistance > gpsBand;

    let confidenceTier: OdometerBucket['confidenceTier'] = 'exact';
    let confidenceReason: string | undefined;
    if (chainAnomaly) {
      confidenceTier = 'indeterminate';
      confidenceReason = 'Odometer/date chain not monotonic';
    } else if (!closingFuelEntry) {
      confidenceTier = 'indeterminate';
      confidenceReason = 'No fill closed this bucket';
    } else if (totalLiters <= 0 && dist > 0) {
      confidenceTier = 'indeterminate';
      confidenceReason = 'Distance with zero attributed litres';
    } else {
      const meta = closingFuelEntry.metadata || {};
      const hardClose =
        meta.isHardAnchor === true ||
        meta.isCapacityClose === true ||
        meta.isFullTank === true;
      if (!hardClose) {
        confidenceTier = 'partial';
        confidenceReason = 'Top-up / tank state unknown — variance is modeled burn only';
      }
    }

    // Waypoints inside the fill window (diagnostics — never split boundaries).
    const waypointCount = waypoints.filter(
      (w) => w.odometer > startOdo && w.odometer < endOdo,
    ).length;

    let deductionRecommendation = 0;
    let deductionReason = '';
    if (
      confidenceTier === 'exact' &&
      overLogBeyondTolerance &&
      unaccountedDistance > UNACCOUNTED_DISTANCE_DEDUCTION_KM &&
      dist > 0 &&
      totalCost > 0
    ) {
      deductionRecommendation = Number(
        (unaccountedDistance * (totalCost / dist)).toFixed(2),
      );
      deductionReason = `Over-logged distance of ${unaccountedDistance.toLocaleString()}km vs odometer (beyond GPS tolerance).`;
    }

    const boundarySource = normalizeSource(endAnchor.source) as OdometerBucket['closingBoundarySource'];

    buckets.push({
      id: `bucket_${vehicle.id}_${startOdo}_${endOdo}`,
      vehicleId: vehicle.id,
      startOdometer: startOdo,
      endOdometer: endOdo,
      startDate: startYmd,
      endDate: endYmd,
      actualFuelLiters: totalLiters,
      actualFuelCost: totalCost,
      associatedReceipts,
      closingEntryId: closingFuelEntry?.id || endAnchor.referenceId || endAnchor.id,
      closingBoundarySource: closingFuelEntry ? 'fuel' : boundarySource || 'unknown',
      totalTripDistance: rideShareDistance,
      tripsCount,
      expectedFuelLiters,
      varianceLiters,
      variancePercent: confidenceTier === 'indeterminate' ? 0 : variancePercent,
      rideShareDistance,
      personalDistance,
      companyMiscDistance,
      unaccountedDistance,
      unexplainedDistance,
      waypointCount,
      confidenceTier,
      confidenceReason,
      chainAnomaly: chainAnomaly || undefined,
      deductionRecommendation: deductionRecommendation > 0 ? deductionRecommendation : undefined,
      deductionReason: deductionReason || undefined,
      status:
        chainAnomaly || isOverflow || overLogBeyondTolerance
          ? 'Anomaly'
          : confidenceTier === 'partial'
            ? 'Partial'
            : 'Complete',
    });
  }

  return buckets;
}
