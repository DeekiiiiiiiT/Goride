/**
 * Derived wizard rows / gates — keeps FuelPeriodWizard as composition + handlers.
 */
import { useMemo } from 'react';
import {
  buildFuelVehicleSnapshots,
  liveReportsToPrimaryClaimedSlices,
} from '../../../utils/fuelPeriodDerive';
import { buildFuelStepCounts } from '../../../utils/fuelPeriodStatus';
import {
  computeFuelGatedStepStates,
  canAdvanceFuelStep,
  FUEL_STEP_ORDER,
  type FuelStepId,
} from '../../../utils/fuelPeriodGating';
import { assembleFuelClientFinalizeGate } from '../../../utils/fuelFinalizeGating';
import type { FuelFlagDispositionMap } from '../../../utils/fuelFlagDisposition';
import { evaluateFuelWeekClosableClient } from '../../../utils/fuelWeekClosableGate';
import { stopToStopClosableFlagsFromReports } from '../../../utils/stopToStopClosableFlags';
import { FUEL_SPEND_EPS } from '../../../utils/fuelMoneyEpsilon';
import { isFuelDataQualityFlagged } from '../../../utils/fuelDataQualityReview';
import { sumGasCardSpendForReport, sumPaidByDriverForReport } from '../../../utils/fuelPaidByDriver';
import { isEntryInInclusiveYmdRange } from '../../../utils/fuelWeekPeriod';
import { precomputeFuelFillDrivers } from '@roam/fuel-core';
import type {
  FinalizedFuelReport,
  FuelCard,
  FuelDispute,
  FuelEntry,
  FuelScenario,
  WeeklyFuelReport,
} from '../../../types/fuel';
import type { FinancialTransaction, Trip } from '../../../types/data';
import type { Vehicle } from '../../../types/vehicle';
import {
  buildBreakdownRows,
  buildLeakageRows,
  buildMoneyStrip,
  buildPolicyRows,
  buildPriorMedian,
  buildQualityRows,
  buildSettlementRows,
  type FuelWizardDriver,
} from './buildFuelWizardRows';

export function useFuelWizardDerived(input: {
  periodStart: string;
  periodEnd: string;
  periodLocked: boolean;
  activeStepId: FuelStepId;
  leakageReviewed: boolean;
  odometerChainReviewed?: boolean;
  unattributedReviewed?: boolean;
  /** Cash-desk: vehicle IDs marked reviewed on Data quality */
  dataQualityReviewedVehicleIds?: Set<string> | string[];
  vehicles: Vehicle[];
  drivers: FuelWizardDriver[];
  fuelEntries: FuelEntry[];
  disputes: FuelDispute[];
  scenarios: FuelScenario[];
  fuelCards: FuelCard[];
  finalizedReports: FinalizedFuelReport[];
  liveReports: WeeklyFuelReport[];
  weekTrips: Trip[];
  weekLoading: boolean;
  weekError: boolean;
  transactions?: FinancialTransaction[];
  countsUnevaluated?: boolean;
  degradedInputs?: boolean;
  periodTotalSpend?: number;
  periodUnexplained?: number;
  /** Desk/page disposition map — required for client↔server gate parity (R-1). */
  dispositions?: FuelFlagDispositionMap;
}) {
  const {
    periodStart,
    periodEnd,
    periodLocked,
    activeStepId,
    leakageReviewed,
    odometerChainReviewed = false,
    unattributedReviewed = false,
    dataQualityReviewedVehicleIds,
    vehicles,
    drivers,
    fuelEntries,
    disputes,
    scenarios,
    fuelCards,
    finalizedReports,
    liveReports,
    weekTrips,
    weekLoading,
    weekError,
    transactions = [],
    countsUnevaluated = false,
    degradedInputs = false,
    periodTotalSpend,
    periodUnexplained,
    dispositions,
  } = input;

  const { vehicleSnaps, openDisputes } = useMemo(() => {
    const weekEntries = fuelEntries.filter((e) =>
      isEntryInInclusiveYmdRange(e.date, periodStart, periodEnd),
    );
    const fillDriverMap = precomputeFuelFillDrivers(weekEntries, vehicles, fuelCards, weekTrips);
    const driverByEntryId = new Map<string, string>();
    for (const [entryId, resolution] of fillDriverMap) {
      driverByEntryId.set(entryId, resolution.driverId);
    }
    const paidByDriverCtx = { vehicles, trips: weekTrips, fuelCards, driverByEntryId };

    const liveSlices = liveReportsToPrimaryClaimedSlices(liveReports);
    const built = buildFuelVehicleSnapshots({
      vehicles,
      weekStartYmd: periodStart,
      weekEndYmd: periodEnd,
      fuelEntries,
      disputes,
      finalizedReports,
      scenarios,
      liveSlices,
    });
    const enriched = built.snapshots.map((snap) => {
      const vehicle = vehicles.find((x) => x.id === snap.vehicleId);
      const report = liveReports.find(
        (r) =>
          r.vehicleId === snap.vehicleId ||
          (Array.isArray(r.vehicleIds) && r.vehicleIds.includes(snap.vehicleId)),
      );
      const driverSpend =
        snap.totalSpend > FUEL_SPEND_EPS && report
          ? sumPaidByDriverForReport(fuelEntries, report, vehicles, paidByDriverCtx)
          : 0;
      return {
        ...snap,
        plate: vehicle?.licensePlate || snap.vehicleId,
        driverSpend,
        netPay: driverSpend - snap.driverShare,
        odometerIncomplete: !!report?.dataQuality?.odometerIncomplete,
        report: snap.totalSpend > FUEL_SPEND_EPS ? report : undefined,
      };
    });
    return { vehicleSnaps: enriched, openDisputes: built.openDisputes };
  }, [
    vehicles,
    liveReports,
    fuelEntries,
    disputes,
    finalizedReports,
    periodStart,
    periodEnd,
    scenarios,
    weekTrips,
    fuelCards,
  ]);

  const settlementRows = useMemo(
    () =>
      buildSettlementRows({
        liveReports,
        vehicles,
        fuelEntries,
        fuelCards,
        weekTrips,
        periodLocked,
      }),
    [liveReports, vehicles, fuelEntries, periodLocked, weekTrips, fuelCards],
  );

  const counts = useMemo(
    () =>
      buildFuelStepCounts({
        vehicles: vehicleSnaps.filter(
          (v) =>
            v.totalSpend > FUEL_SPEND_EPS ||
            v.pendingCount > 0 ||
            v.hasOpenDispute ||
            v.isFinalized ||
            Boolean(v.odometerIncomplete) ||
            Boolean(v.healthStatus && v.healthStatus !== 'Emerald'),
        ),
        leakageReviewed: leakageReviewed || periodLocked,
        dataQualityReviewedVehicleIds:
          periodLocked
            ? // Locked weeks treat flags as informational for chip totals
              vehicleSnaps.map((v) => v.vehicleId)
            : dataQualityReviewedVehicleIds,
      }),
    [vehicleSnaps, leakageReviewed, periodLocked, dataQualityReviewedVehicleIds],
  );

  const gatedStates = useMemo(() => computeFuelGatedStepStates(counts), [counts]);

  const strip = useMemo(
    () =>
      buildMoneyStrip({
        liveReports,
        fuelEntries,
        vehicles,
        fuelCards,
        weekTrips,
        sumGasCard: sumGasCardSpendForReport,
        sumPaidByDriver: sumPaidByDriverForReport,
      }),
    [liveReports, fuelEntries, vehicles, fuelCards, weekTrips],
  );

  const qualityRows = useMemo(
    () => buildQualityRows(vehicleSnaps as any, vehicles, drivers),
    [vehicleSnaps, vehicles, drivers],
  );

  const breakdownRows = useMemo(
    () => buildBreakdownRows(vehicleSnaps as any, vehicles, drivers),
    [vehicleSnaps, vehicles, drivers],
  );

  const leakageRows = useMemo(() => buildLeakageRows(vehicleSnaps as any), [vehicleSnaps]);

  const policyRows = useMemo(
    () =>
      buildPolicyRows({
        vehicles,
        vehicleSnaps: vehicleSnaps as any,
        liveReports,
        scenarios,
        weekStart: periodStart,
      }),
    [vehicles, scenarios, vehicleSnaps, periodStart, liveReports],
  );

  const priorMedian = useMemo(
    () => buildPriorMedian(finalizedReports, periodStart),
    [finalizedReports, periodStart],
  );

  const gateResult = useMemo(
    () =>
      assembleFuelClientFinalizeGate({
        reports: liveReports,
        disputes,
        fuelEntries,
        finalizedReports,
        transactions,
        weekStartYmd: periodStart,
        weekEndYmd: periodEnd,
        dispositions,
      }),
    [
      liveReports,
      disputes,
      fuelEntries,
      finalizedReports,
      transactions,
      periodStart,
      periodEnd,
      dispositions,
    ],
  );

  const closableBlockers = useMemo(
    () => {
      const reviewed =
        dataQualityReviewedVehicleIds instanceof Set
          ? dataQualityReviewedVehicleIds
          : new Set(dataQualityReviewedVehicleIds || []);
      const dataQualityVehiclesUnreviewed =
        !periodLocked &&
        vehicleSnaps.some(
          (v) => isFuelDataQualityFlagged(v) && !reviewed.has(v.vehicleId),
        );
      return evaluateFuelWeekClosableClient({
        gateResult,
        reports: liveReports,
        scenarios,
        leakageReviewed: leakageReviewed || periodLocked,
        odometerChainReviewed: odometerChainReviewed || periodLocked,
        unattributedReviewed: unattributedReviewed || periodLocked,
        countsUnevaluated,
        degradedInputs,
        openDisputesInWeek: openDisputes.length > 0,
        totalSpend: periodTotalSpend,
        unexplained: periodUnexplained,
        dataQualityVehiclesUnreviewed,
        ...stopToStopClosableFlagsFromReports({
          reports: liveReports,
          fuelEntries,
          weekStartYmd: periodStart,
          weekEndYmd: periodEnd,
        }),
      });
    },
    [
      gateResult,
      liveReports,
      scenarios,
      leakageReviewed,
      odometerChainReviewed,
      unattributedReviewed,
      periodLocked,
      countsUnevaluated,
      degradedInputs,
      openDisputes.length,
      periodTotalSpend,
      periodUnexplained,
      fuelEntries,
      periodStart,
      periodEnd,
      vehicleSnaps,
      dataQualityReviewedVehicleIds,
    ],
  );

  const plateByVehicleId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const v of vehicles) {
      map[v.id] = v.licensePlate || v.id;
    }
    return map;
  }, [vehicles]);

  const canContinue = canAdvanceFuelStep(activeStepId, counts);
  const stepIndex = FUEL_STEP_ORDER.indexOf(activeStepId);
  const isLast = stepIndex === FUEL_STEP_ORDER.length - 1;
  const weekIsEmpty =
    !weekLoading &&
    !weekError &&
    liveReports.length === 0 &&
    vehicleSnaps.every((v) => v.totalSpend <= FUEL_SPEND_EPS);

  return {
    vehicleSnaps,
    openDisputes,
    settlementRows,
    counts,
    gatedStates,
    strip,
    qualityRows,
    breakdownRows,
    leakageRows,
    policyRows,
    priorMedian,
    gateResult,
    closableBlockers,
    exceptionBlockers: gateResult.exceptionBlockers || [],
    unapprovedFuelTxBlockers: gateResult.unapprovedFuelTxBlockers || [],
    plateByVehicleId,
    canContinue,
    stepIndex,
    isLast,
    weekIsEmpty,
  };
}
