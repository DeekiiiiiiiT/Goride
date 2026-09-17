/**
 * Shared utility for fuel-related calculations to ensure consistency across components.
 */

import {
  type FuelEntry,
  type MileageAdjustment,
  type WeeklyFuelReport,
  type FuelScenario,
  type FuelRule,
  type OdometerBucket,
  type FuelCycle,
  type FuelCard,
  type FuelCalcTrip,
  type FuelCalcVehicle,
  type PersonalAllowanceTierConfig,
  type QuotaConfig,
  UNASSIGNED_FUEL_DRIVER_ID,
} from './fuelTypes.ts';
import {
  pickScenarioForDriverMembership,
  pickScenarioForDriverWeek,
  resolveDriverVersionForWeek,
} from './fuelPolicyVersion.ts';
import { resolveFuelFillDriver } from './resolveFuelFillDriver.ts';
import { isEntryInInclusiveYmdRange, entriesInFuelWeek } from './fuelWeekRange.ts';
import { getTotalTripRideshareKm } from './tripRideshareKm.ts';
import { getTripGrossRevenue } from './tripGrossRevenue.ts';
import {
  computePersonalAllowanceSplit,
  buildPersonalAllowanceMetadata,
  type PersonalAllowanceSplitResult,
} from './personalAllowance.ts';
import { calculateFuelCycles } from './fuelCycleEngine.ts';
import { FLEET_CYCLE_HEALTH, FLEET_USE_FUEL_BRAIN } from './fuelBrainFlags.ts';
import { blendedDriverShareRatioFromReport } from '../../roam-shared/src/fuel/blendedDriverShareRatio.ts';
import {
  filterFuelOpsLogEntries,
  fuelOpsLiters,
  fuelOpsSpendAmount,
  countsInFuelLogSpend,
} from './fuelOpsEligibility.ts';
import type { OdometerBucketAnchor } from './fuelTypes.ts';
import { calculateOdometerBuckets as calculateOdometerBucketsEngine } from './odometerBucketEngine.ts';
import {
  FALLBACK_EFFICIENCY_KM_L,
  GAP_ANOMALY_PCT,
  SEVERE_GAP_PCT,
  TANK_OVERFLOW_MULT,
  UNACCOUNTED_DISTANCE_DEDUCTION_KM,
} from './constants.ts';
import { resolvePricePerLiter } from './resolvePricePerLiter.ts';
import {
  assembleLeftoverWeekMoney,
  computeMiscellaneousCost,
  splitAllCategoryCosts,
  getCategoryCoverageSplit as splitCategory,
  type FuelCoverageCategory,
} from './fuelCoverageSplit.ts';
import { floorMiscForSplit } from './fuelFinalizeGate.ts';
import { deriveWindowMoneyFromEntries } from './deriveWindowMoneyFromEntries.ts';

export {
  FALLBACK_EFFICIENCY_KM_L,
  GAP_ANOMALY_PCT,
  SEVERE_GAP_PCT,
  TANK_OVERFLOW_MULT,
  UNACCOUNTED_DISTANCE_DEDUCTION_KM,
};

/** Soft-cycle efficiency band vs week observed km/L before Amber (cycle-health mode). */
const SOFT_CYCLE_EFFICIENCY_BAND = 0.30;

export type { FuelCoverageCategory };

export type PersonalAllowanceReconContext = {
  config: PersonalAllowanceTierConfig;
  quotaConfig?: QuotaConfig | null;
  /** Key driverId → bonus km for this week */
  bonusByDriverId?: Map<string, number>;
  /** Period earnings SSOT (driver-overview `period.earnings`) for this week. Prefer over trip sum for PA. */
  ledgerGrossByDriverId?: Map<string, number>;
  /** All week trips for driver earnings fallback when ledger gross missing */
  driverWeekTrips?: FuelCalcTrip[];
  /**
   * Dual-read: resolve PA+quota per driver-week from Earnings Policy (version → default → legacy).
   * When omitted, `config` / `quotaConfig` apply to every driver (legacy parity).
   */
  resolveForDriver?: (driverId: string) => {
    config: PersonalAllowanceTierConfig;
    quotaConfig?: QuotaConfig | null;
    earningsPolicy?: {
      policyId?: string;
      versionId?: string;
      source: string;
      policyName?: string;
    };
  };
};

/** Per-vehicle deadhead attribution passed in from the API (Phase 2) */
export interface VehicleDeadheadInput {
    vehicleId: string;
    deadheadKm: number;
    personalKm: number;
    totalOdometerKm: number;
    /** Server-side trip km used for attribution (0 = trips missing / truncate bug). */
    tripKm?: number;
    method: 'A' | 'C' | 'combined' | 'fallback';
    confidenceLevel: 'high' | 'medium' | 'low';
    confidenceReason: string;
}

/** Brain category km injected into recon when FLEET_USE_FUEL_BRAIN=1 */
export interface FuelBrainClassificationInput {
    rideShareKm: number;
    personalKm: number;
    companyOpsKm: number;
    deadheadKm: number;
    availableKm?: number;
    confidence?: Record<string, string>;
    method?: string;
}

export const FuelCalculationService = {
    /**
     * Calculates volume (liters) based on total cost and price per unit.
     */
    calculateVolume: (amount: number | string, pricePerLiter: number | string): number | null => {
        const amt = typeof amount === 'string' ? parseFloat(amount) : amount;
        const prc = typeof pricePerLiter === 'string' ? parseFloat(pricePerLiter) : pricePerLiter;

        if (amt > 0 && prc > 0) {
            return parseFloat((amt / prc).toFixed(2));
        }
        return null;
    },

    /**
     * Calculates price per liter based on total cost and volume.
     */
    calculatePricePerLiter: (amount: number | string, liters: number | string): number | null => {
        const amt = typeof amount === 'string' ? parseFloat(amount) : amount;
        const lts = typeof liters === 'string' ? parseFloat(liters) : liters;

        if (amt > 0 && lts > 0) {
            return parseFloat((amt / lts).toFixed(3));
        }
        return null;
    },

    /**
     * Calculates total cost based on volume and price per unit.
     */
    calculateTotalCost: (liters: number | string, pricePerLiter: number | string): number | null => {
        const lts = typeof liters === 'string' ? parseFloat(liters) : liters;
        const prc = typeof pricePerLiter === 'string' ? parseFloat(pricePerLiter) : pricePerLiter;

        if (lts > 0 && prc > 0) {
            return parseFloat((lts * prc).toFixed(2));
        }
        return null;
    },

    /**
     * Formats a fuel amount for display.
     */
    formatCurrency: (value: number): string => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
        }).format(value);
    },

    /**
     * Calculates the total rideshare km contribution of a single trip.
     * Includes ALL distance segments: On Trip, Enroute, Open, Unavailable.
     * Delegates to shared helper so deadhead API stays in lockstep.
     */
    getTotalTripRideshareKm: (trip: FuelCalcTrip): number => getTotalTripRideshareKm(trip),

    /**
     * Converts a Date to a 'YYYY-MM-DD' string using LOCAL time (not UTC).
     * Avoids the timezone-shift bug where .toISOString().split('T')[0]
     * can land on the wrong calendar date in non-UTC timezones.
     */
    toLocalDateStr: (d: Date): string => {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    },

    /**
     * Blended driver-share ratio for a finalized/draft weekly report, used to split
     * individual fuel entries at settlement time. Entries carry no category (ride
     * share vs personal vs deadhead, etc — that split only exists at the aggregated
     * weekly-report level), so this ratio is the only way to keep entry-level ledger
     * postings consistent with the category-weighted `driverShare` shown on screen.
     */
    getBlendedDriverShareRatio: (report: WeeklyFuelReport): number => {
        return blendedDriverShareRatioFromReport(report);
    },

    /**
     * Resolves the company/driver split for one cost category under a Fuel rule.
     * Delegates to fuelCoverageSplit (shared with ScenarioSplitDashboard / policy cards).
     */
    getCategoryCoverageSplit: (
        category: FuelCoverageCategory,
        amount: number,
        rule: FuelRule | undefined
    ): { company: number; driver: number } => {
        return splitCategory(category, amount, rule);
    },

    /**
     * Generates a reconciliation report for a single vehicle (legacy vehicle-week path).
     * Prefer generateDriverFleetReport for driver-first shared-car weeks.
     */
    calculateReconciliation: (
        vehicle: FuelCalcVehicle,
        weekStart: Date,
        weekEnd: Date,
        trips: FuelCalcTrip[],
        fuelEntries: FuelEntry[],
        adjustments: MileageAdjustment[],
        scenarios: FuelScenario[] = [],
        deadheadData?: VehicleDeadheadInput,
        options?: {
            driverId?: string;
            fuelScenarioId?: string;
            reportId?: string;
            vehicleIds?: string[];
            vehiclePlates?: string[];
            /** When FLEET_USE_FUEL_BRAIN=1, category km from brain (never auto-Personal residual). */
            brainClassification?: FuelBrainClassificationInput;
            /** Force legacy residual path even if brain payload present (tests / rollback). */
            forceLegacyResidual?: boolean;
            /** Skip allowance (multi-vehicle slices apply once after merge). */
            skipPersonalAllowance?: boolean;
            personalAllowance?: PersonalAllowanceReconContext;
            /** H-8: ledger anchors so freeze buckets match Stop-to-Stop panel. */
            externalAnchors?: OdometerBucketAnchor[];
        }
    ): WeeklyFuelReport => {
        const startStr = FuelCalculationService.toLocalDateStr(weekStart);
        const endStr = FuelCalculationService.toLocalDateStr(weekEnd);

        // Driver-week membership wins; legacy fuelScenarioId / vehicle only when no driverId
        const activeScenario = options?.driverId
            ? pickScenarioForDriverMembership(scenarios, options.driverId, startStr)
            : pickScenarioForDriverWeek(
                scenarios,
                options?.fuelScenarioId ?? vehicle.fuelScenarioId,
                startStr,
              );

        // Helper to get rule for a specific category
        const fuelRule = activeScenario?.rules.find(r => r.category === 'Fuel');

        // 2. Ops fills only for recon spend/liters/cycles — Card Inventory owns JAA statement ledger
        const vehicleEntries = filterFuelOpsLogEntries(
            fuelEntries.filter(e =>
                e.vehicleId === vehicle.id &&
                isEntryInInclusiveYmdRange(e.date, startStr, endStr)
            ),
        );

        // Phase 3: Calculate Pending Count
        const pendingCount = vehicleEntries.filter(e => e.reconciliationStatus === 'Pending').length;

        const vehicleTrips = trips.filter(t => 
            t.vehicleId === vehicle.id && 
            isEntryInInclusiveYmdRange(t.date, startStr, endStr) &&
            (t.status === 'Completed' || t.status === 'Cancelled')
        );

        const vehicleAdjustments = adjustments.filter(a => 
            a.vehicleId === vehicle.id && 
            isEntryInInclusiveYmdRange(a.date, startStr, endStr)
        );

        // 3. Aggregate Costs (all ops fill $ this week — card + cash; UI label is Total Spend)
        const totalGasCardCost = vehicleEntries.reduce((sum, e) => sum + fuelOpsSpendAmount(e), 0);
        const totalLiters = vehicleEntries.reduce((sum, e) => sum + fuelOpsLiters(e), 0);

        // 3b. Observed efficiency — align with bucket engine (F-3): spend-eligible + odo + litres
        const entriesWithOdo = vehicleEntries
            .filter(
              (e) =>
                countsInFuelLogSpend(e) &&
                e.odometer !== undefined &&
                e.odometer !== null &&
                e.odometer > 0 &&
                fuelOpsLiters(e) > 0,
            )
            .sort((a, b) => (a.odometer || 0) - (b.odometer || 0));

        // Step 2.3: Efficiency fuel — exclude first fill-up (standard fill-to-fill method).
        // Floating entries (no odometer) are already excluded by entriesWithOdo filter.
        const efficiencyFuel = entriesWithOdo.length >= 2
            ? entriesWithOdo.slice(1).reduce((sum, e) => sum + fuelOpsLiters(e), 0)
            : 0;

        let observedEfficiency = 0;
        // Step 2.4: >= 3 entries for reliability, use efficiencyFuel (not totalLiters)
        if (entriesWithOdo.length >= 3 && efficiencyFuel > 0) {
            const odoDistance = (entriesWithOdo[entriesWithOdo.length - 1].odometer || 0) - (entriesWithOdo[0].odometer || 0);
            if (odoDistance > 0) {
                observedEfficiency = odoDistance / efficiencyFuel;
            }
        }

        // Fallback chain: vehicle.fuelSettings.efficiencyCity (L/100km -> km/L) -> 10 km/L default
        if (observedEfficiency <= 0) {
            const cityEfficiency = vehicle.fuelSettings?.efficiencyCity;
            if (cityEfficiency && cityEfficiency > 0) {
                // efficiencyCity is L/100km, convert to km/L
                observedEfficiency = 100 / cityEfficiency;
            } else {
                observedEfficiency = FALLBACK_EFFICIENCY_KM_L;
            }
        }

        // 3c. JMD/L — observed gas-card fills only (never invent a default)
        const priceResolved = resolvePricePerLiter({
            totalLiters,
            totalGasCardCost,
        });
        const actualPricePerLiter = priceResolved.pricePerLiter;
        const priceUnavailable = priceResolved.priceUnavailable;
        
        // 4. Aggregate Distances
        const totalTripDistance = vehicleTrips.reduce(
            (sum, t) => sum + FuelCalculationService.getTotalTripRideshareKm(t), 0
        );
        const companyMiscDistance = vehicleAdjustments
            .filter(a => a.type === 'Company_Misc' || a.type === 'Maintenance')
            .reduce((sum, a) => sum + (a.distance || 0), 0);

        // 4b. Stop-to-stop buckets — personal = evidenced adjustments only (never residual).
        // H-8: prefer ledger anchors when provided so freeze ≡ Stop-to-Stop panel.
        const buckets = FuelCalculationService.calculateOdometerBuckets(
            vehicle,
            vehicleEntries,
            vehicleTrips,
            vehicleAdjustments,
            options?.externalAnchors,
        );
        const odometerIncomplete = buckets.length === 0 && vehicleEntries.length > 0;
        const totalOdometerDelta = buckets.reduce((sum, b) => sum + (b.endOdometer - b.startOdometer), 0);
        const evidencedPersonalFromBuckets = buckets.reduce((sum, b) => sum + (b.personalDistance || 0), 0);

        // Residual after RS + company (diagnostic only). Personal cost uses evidenced personal on non-Brain path.
        const rawResidual = totalOdometerDelta > 0
            ? Math.max(0, totalOdometerDelta - totalTripDistance - companyMiscDistance)
            : evidencedPersonalFromBuckets;

        let deadheadDistance = 0;
        let personalDistance = evidencedPersonalFromBuckets;
        const useBrain =
            !options?.forceLegacyResidual &&
            !!options?.brainClassification;

        if (useBrain && options?.brainClassification) {
            const brain = options.brainClassification;
            personalDistance = Math.max(0, brain.personalKm || 0);
            deadheadDistance = Math.max(0, brain.deadheadKm || 0);
            if (totalOdometerDelta > 0) {
                const purposeSum = personalDistance + deadheadDistance;
                // Brain is evidence for DH/Personal split — cap at rawResidual only.
                // Do NOT subtract unexplainedFromBuckets (that double-subtracts residual → R-1).
                const residualCap = Math.max(0, rawResidual);
                if (purposeSum > residualCap && purposeSum > 0) {
                    const scale = residualCap / purposeSum;
                    personalDistance *= scale;
                    deadheadDistance *= scale;
                }
            }
        } else if (deadheadData && totalOdometerDelta > 0) {
            const residualAfterPersonal = Math.max(0, rawResidual - personalDistance);
            deadheadDistance = Math.min(deadheadData.deadheadKm, residualAfterPersonal);
        }

        // 5. Costs need a real JMD/L — when unavailable, keep km but charge $0 (fail loud)
        const rideShareCost = priceUnavailable
            ? 0
            : (totalTripDistance / observedEfficiency) * actualPricePerLiter;
        const companyUsageCost = priceUnavailable
            ? 0
            : (companyMiscDistance / observedEfficiency) * actualPricePerLiter;
        const deadheadCost = priceUnavailable
            ? 0
            : (deadheadDistance / observedEfficiency) * actualPricePerLiter;
        const personalUsageCost = priceUnavailable
            ? 0
            : (personalDistance / observedEfficiency) * actualPricePerLiter;

        // 6. N-1/N-2: hoist efficiencySource before carve; split first-fill timing vs no-odo
        // R-3: derive carves from entries; FCS already resolved price for categories.
        const derivedWindow = deriveWindowMoneyFromEntries(vehicleEntries, {
            pricePerLiter: actualPricePerLiter,
            hasVehicleEfficiencySettings: !!vehicle.fuelSettings?.efficiencyCity,
        });
        const efficiencySource = derivedWindow.efficiencySource;
        const windowTimingCost = priceUnavailable ? 0 : derivedWindow.windowTimingCost;
        const unattributedFillCost = priceUnavailable ? 0 : derivedWindow.unattributedFillCost;
        const miscellaneousCost = computeMiscellaneousCost(totalGasCardCost, {
            rideShare: rideShareCost,
            companyUsage: companyUsageCost,
            deadhead: deadheadCost,
            personal: personalUsageCost,
            windowTiming: windowTimingCost,
            unattributedFill: unattributedFillCost,
        });

        // 6b. Personal Allowance (Option 2): company absorbs earned; overage → personal split
        let personalForSplit = personalUsageCost;
        let earnedAbsorbCompany = 0;
        let allowanceSplit: PersonalAllowanceSplitResult | null = null;
        const paCtx = options?.personalAllowance;
        if (
            !options?.skipPersonalAllowance &&
            !priceUnavailable &&
            paCtx?.config?.enabled
        ) {
            const earnTrips = paCtx.driverWeekTrips ?? vehicleTrips;
            const driverIdForBonus = options?.driverId ?? vehicle.currentDriverId ?? '';
            const ledgerGross = paCtx.ledgerGrossByDriverId?.get(driverIdForBonus);
            // Prefer ledger period.earnings (same as Driver Detail); trip sum only if ledger missing
            const earningsJmd =
              ledgerGross != null && Number.isFinite(ledgerGross)
                ? Number(ledgerGross)
                : earnTrips.reduce((s, t) => s + getTripGrossRevenue(t), 0);
            const priorBonus = paCtx.bonusByDriverId?.get(driverIdForBonus) ?? 0;
            allowanceSplit = computePersonalAllowanceSplit({
                measuredKm: personalDistance,
                efficiencyKmPerL: observedEfficiency,
                pricePerLiter: actualPricePerLiter,
                earningsJmd,
                config: paCtx.config,
                quotaConfig: paCtx.quotaConfig,
                priorWeekBonusKm: priorBonus,
            });
            if (!allowanceSplit.skip) {
                personalForSplit = allowanceSplit.overageCost;
                earnedAbsorbCompany = allowanceSplit.earnedCost;
            }
        }

        // 7. Split via fuel-core — PA adjusts personal only; leftover misc stays intact
        let rideShareSplit: { company: number; driver: number };
        let companyUsageSplit: { company: number; driver: number };
        let deadheadSplit: { company: number; driver: number };
        let personalSplit: { company: number; driver: number };
        let miscSplit: { company: number; driver: number };
        let companyShare: number;
        let driverShare: number;
        if (earnedAbsorbCompany === 0 && personalForSplit === personalUsageCost) {
            const money = assembleLeftoverWeekMoney({
                totalSpend: totalGasCardCost,
                rideShareCost,
                companyUsageCost,
                deadheadCost,
                personalUsageCost,
                windowTimingCost,
                unattributedFillCost,
                rule: fuelRule || null,
            });
            rideShareSplit = { company: money.split.company.rideShare, driver: money.split.driver.rideShare };
            companyUsageSplit = {
                company: money.split.company.companyUsage,
                driver: money.split.driver.companyUsage,
            };
            deadheadSplit = { company: money.split.company.deadhead, driver: money.split.driver.deadhead };
            personalSplit = { company: money.split.company.personal, driver: money.split.driver.personal };
            miscSplit = { company: money.split.company.misc, driver: money.split.driver.misc };
            companyShare = money.companyShare;
            driverShare = money.driverShare;
        } else {
            // C-2: never split a negative misc as if it were real driver cash — a
            // fleet-owes residual floors to 0 for the split (magnitude reported separately).
            const weekSplit = splitAllCategoryCosts(
                {
                    rideShare: rideShareCost,
                    companyUsage: companyUsageCost,
                    deadhead: deadheadCost,
                    personal: personalForSplit,
                    misc: floorMiscForSplit(miscellaneousCost).miscForSplit,
                },
                fuelRule || undefined,
            );
            rideShareSplit = { company: weekSplit.company.rideShare, driver: weekSplit.driver.rideShare };
            companyUsageSplit = {
                company: weekSplit.company.companyUsage,
                driver: weekSplit.driver.companyUsage,
            };
            deadheadSplit = { company: weekSplit.company.deadhead, driver: weekSplit.driver.deadhead };
            personalSplit = { company: weekSplit.company.personal, driver: weekSplit.driver.personal };
            miscSplit = { company: weekSplit.company.misc, driver: weekSplit.driver.misc };
            companyShare =
                rideShareSplit.company +
                companyUsageSplit.company +
                deadheadSplit.company +
                personalSplit.company +
                miscSplit.company +
                earnedAbsorbCompany +
                windowTimingCost +
                unattributedFillCost;
            driverShare =
                rideShareSplit.driver +
                companyUsageSplit.driver +
                deadheadSplit.driver +
                personalSplit.driver +
                miscSplit.driver;
        }

        // 8. Health Status — cycle spine when FLEET_CYCLE_HEALTH (default ON)
        const priceSource = priceResolved.priceSource;

        const fuelCycles = calculateFuelCycles(vehicleEntries, [vehicle]);
        const closedCycles = fuelCycles.filter((c) => c.status === 'Complete' || c.status === 'Anomaly');
        const exceptionCycles = closedCycles.filter(
            (c) => c.signalTier === 'exception' || (c.status === 'Anomaly' && c.signalTier !== 'review'),
        );
        const reviewCycles = closedCycles.filter((c) => c.signalTier === 'review');
        const tankCap =
            Number(vehicle.specifications?.tankCapacity) ||
            Number(vehicle.fuelSettings?.tankCapacity) ||
            0;
        const gapAnomalyBuckets = buckets.filter((b) => {
            const dist = b.endOdometer - b.startOdometer;
            const hasGap = dist > 0 && b.unaccountedDistance > dist * GAP_ANOMALY_PCT;
            const hasOverflow = tankCap > 0 && b.actualFuelLiters > tankCap * TANK_OVERFLOW_MULT;
            return b.status === 'Anomaly' && (hasGap || hasOverflow);
        });
        const severeGap = buckets.some((b) => {
            const dist = b.endOdometer - b.startOdometer;
            return dist > 0 && b.unaccountedDistance > dist * SEVERE_GAP_PCT;
        });

        let healthStatus: 'Emerald' | 'Amber' | 'Red' = 'Emerald';
        let healthScore = 100;

        if (FLEET_CYCLE_HEALTH) {
            if (closedCycles.length === 0 && vehicleEntries.length > 0) {
                healthStatus = 'Red';
                healthScore = 0;
            } else if (exceptionCycles.length > 0 || severeGap) {
                healthStatus = 'Red';
                healthScore = 40;
            } else {
                const softEffOff = closedCycles.some((c) => {
                    if (c.trustTier !== 'Soft' && c.resetType !== 'Auto_Soft') return false;
                    if (!(c.efficiency > 0) || !(observedEfficiency > 0)) return false;
                    return Math.abs(c.efficiency - observedEfficiency) / observedEfficiency > SOFT_CYCLE_EFFICIENCY_BAND;
                });
                if (reviewCycles.length > 0 || softEffOff || gapAnomalyBuckets.length > 0) {
                    healthStatus = 'Amber';
                    healthScore = 70;
                }
            }
        } else if (buckets.length === 0 && vehicleEntries.length > 0) {
            healthStatus = 'Red';
            healthScore = 0;
        } else if (buckets.some((b) => b.status === 'Anomaly')) {
            healthStatus = 'Amber';
            healthScore = 70;
            if (severeGap) {
                healthStatus = 'Red';
                healthScore = 40;
            }
        }

        const reportDriverId = options?.driverId ?? vehicle.currentDriverId ?? '';
        if (reportDriverId === UNASSIGNED_FUEL_DRIVER_ID || !reportDriverId) {
            healthStatus = healthStatus === 'Emerald' ? 'Amber' : healthStatus;
            healthScore = Math.min(healthScore, 60);
        }

        // Fallback efficiency / unavailable price makes Ride Share estimates unreliable
        if (efficiencySource === 'default_fallback' || priceUnavailable || priceSource === 'unavailable') {
            healthStatus = healthStatus === 'Emerald' ? 'Amber' : healthStatus;
            healthScore = Math.min(healthScore, 65);
        }

        if (FLEET_USE_FUEL_BRAIN && options?.brainClassification) {
            console.debug('[FuelBrain] week classify', {
                vehicleId: vehicle.id,
                cycleCount: closedCycles.length,
                healthStatus,
                availableKm: options.brainClassification.availableKm,
            });
        }

        return {
            id: options?.reportId ?? `${reportDriverId || vehicle.id}_${startStr}`,
            weekStart: startStr,
            weekEnd: endStr,
            vehicleId: vehicle.id,
            driverId: reportDriverId,
            vehicleIds: options?.vehicleIds ?? [vehicle.id],
            vehiclePlates: options?.vehiclePlates,
            totalGasCardCost,
            totalTripDistance,
            rideShareCost,
            companyMiscDistance,
            companyUsageCost,
            deadheadDistance,
            deadheadCost,
            personalDistance,
            personalUsageCost,
            miscellaneousCost,
            windowTimingCost,
            unattributedFillCost,
            driverMiscShare: miscSplit.driver,
            companyShare,
            driverShare,
            status: 'Draft',
            pendingCount,
            healthStatus,
            healthScore,
            odometerBuckets: buckets,
            dataQuality: { odometerIncomplete },
            fuelCycles: closedCycles,
            deadheadMeta: deadheadData ? {
                method: deadheadData.method,
                confidenceLevel: deadheadData.confidenceLevel,
                confidenceReason: deadheadData.confidenceReason,
                serverDeadheadKm: deadheadData.deadheadKm,
                serverPersonalKm: deadheadData.personalKm,
            } : undefined,
            metadata: {
                scenarioName: activeScenario?.name || 'Standard (Fallback)',
                scenarioId: activeScenario?.id,
                windowTimingCost,
                unattributedFillCost,
                // Ride Share calculation transparency
                rideShareCalc: {
                    totalRideshareKm: totalTripDistance,
                    observedEfficiency: Number(observedEfficiency.toFixed(2)),
                    actualPricePerLiter: Number(actualPricePerLiter.toFixed(3)),
                    efficiencySource,
                    priceSource,
                    priceUnavailable,
                    totalLitersInPeriod: Number(totalLiters.toFixed(2)),
                    tripsIncluded: vehicleTrips.length,
                    completedTrips: vehicleTrips.filter(t => t.status === 'Completed').length,
                    cancelledTrips: vehicleTrips.filter(t => t.status === 'Cancelled').length,
                    odometerIncomplete,
                },
                fuelBrain: useBrain && options?.brainClassification
                    ? {
                        method: options.brainClassification.method || 'fuel_brain_v2',
                        confidence: options.brainClassification.confidence,
                        personalKm: personalDistance,
                        deadheadKm: deadheadDistance,
                        availableKm: options.brainClassification.availableKm,
                      }
                    : undefined,
                personalAllowance: allowanceSplit
                  ? buildPersonalAllowanceMetadata(allowanceSplit, paCtx?.config)
                  : undefined,
                cycleHealth: FLEET_CYCLE_HEALTH
                  ? {
                      mode: 'cycles',
                      closedCycleCount: closedCycles.length,
                      anomalyCycles: closedCycles.filter((c) => c.status === 'Anomaly').length,
                      softCycles: closedCycles.filter((c) => c.trustTier === 'Soft' || c.resetType === 'Auto_Soft').length,
                    }
                  : { mode: 'legacy_buckets' },
            }
        };
    },

    /**
     * Apply Personal Allowance once on a merged driver-week report (multi-vehicle).
     */
    applyPersonalAllowanceToReport: (
        report: WeeklyFuelReport,
        fuelRule: FuelRule | undefined,
        paCtx: PersonalAllowanceReconContext,
        driverWeekTrips: FuelCalcTrip[],
    ): WeeklyFuelReport => {
        const resolved = paCtx.resolveForDriver?.(report.driverId);
        const config = resolved?.config ?? paCtx.config;
        const quotaConfig =
          resolved && 'quotaConfig' in resolved ? resolved.quotaConfig : paCtx.quotaConfig;
        if (!config?.enabled) return report;
        const calc = report.metadata?.rideShareCalc || {};
        const efficiency = Number(calc.observedEfficiency) > 0 ? Number(calc.observedEfficiency) : FALLBACK_EFFICIENCY_KM_L;
        const price = Number(calc.actualPricePerLiter) > 0 ? Number(calc.actualPricePerLiter) : 0;
        const ledgerGross = paCtx.ledgerGrossByDriverId?.get(report.driverId);
        const earningsJmd =
          ledgerGross != null && Number.isFinite(ledgerGross)
            ? Number(ledgerGross)
            : driverWeekTrips.reduce((s, t) => s + getTripGrossRevenue(t), 0);
        const priorBonus = paCtx.bonusByDriverId?.get(report.driverId) ?? 0;
        const allowanceSplit = computePersonalAllowanceSplit({
            measuredKm: report.personalDistance,
            efficiencyKmPerL: efficiency,
            pricePerLiter: price,
            earningsJmd,
            config,
            quotaConfig,
            priorWeekBonusKm: priorBonus,
        });
        if (allowanceSplit.skip) return report;

        // C-2: floor a negative misc so an over-explained residual is never split as driver debt.
        const weekSplit = splitAllCategoryCosts(
            {
                rideShare: report.rideShareCost,
                companyUsage: report.companyUsageCost,
                deadhead: report.deadheadCost || 0,
                personal: allowanceSplit.overageCost,
                misc: floorMiscForSplit(report.miscellaneousCost).miscForSplit,
            },
            fuelRule,
        );
        const companyShare =
            weekSplit.company.rideShare +
            weekSplit.company.companyUsage +
            weekSplit.company.deadhead +
            weekSplit.company.personal +
            weekSplit.company.misc +
            allowanceSplit.earnedCost +
            (Number(report.windowTimingCost) || 0) +
            (Number(report.unattributedFillCost) || 0);
        const driverShare =
            weekSplit.driver.rideShare +
            weekSplit.driver.companyUsage +
            weekSplit.driver.deadhead +
            weekSplit.driver.personal +
            weekSplit.driver.misc;

        return {
            ...report,
            companyShare,
            driverShare,
            metadata: {
                ...report.metadata,
                personalAllowance: buildPersonalAllowanceMetadata(allowanceSplit, config),
                earningsPolicy: resolved?.earningsPolicy,
            },
        };
    },

    /**
     * Driver-first fleet reports: attribute fills, group by driver+week, apply driver policy.
     * Shared car → one row per driver. Unassigned fills → Amber sentinel row.
     */
    generateDriverFleetReport: (
        vehicles: FuelCalcVehicle[],
        drivers: Array<{ id: string; fuelScenarioId?: string; name?: string }>,
        weekStart: Date,
        weekEnd: Date,
        trips: FuelCalcTrip[],
        fuelEntries: FuelEntry[],
        adjustments: MileageAdjustment[],
        scenarios: FuelScenario[],
        deadheadMap?: Map<string, VehicleDeadheadInput>,
        fuelCards: FuelCard[] = [],
        /** Key `${driverId}:${vehicleId}` → brain classification (consumer path only). */
        brainByDriverVehicle?: Map<string, FuelBrainClassificationInput>,
        personalAllowance?: PersonalAllowanceReconContext,
        /** H-8: ledger anchors keyed by vehicleId (same shape as Stop-to-Stop panel). */
        externalAnchorsByVehicleId?: Map<string, OdometerBucketAnchor[]>,
    ): WeeklyFuelReport[] => {
        const startStr = FuelCalculationService.toLocalDateStr(weekStart);
        const endStr = FuelCalculationService.toLocalDateStr(weekEnd);
        const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
        const driverById = new Map(drivers.map((d) => [d.id, d]));

        const weekEntries = entriesInFuelWeek(fuelEntries, startStr, endStr);
        type Attr = { entry: FuelEntry; driverId: string };
        const attributed: Attr[] = weekEntries.map((entry) => {
            const resolved = resolveFuelFillDriver({
                entry,
                vehicles,
                fuelCards,
                trips,
            });
            return { entry, driverId: resolved.driverId };
        });

        const byDriver = new Map<string, Attr[]>();
        for (const row of attributed) {
            const list = byDriver.get(row.driverId) || [];
            list.push(row);
            byDriver.set(row.driverId, list);
        }

        // Drivers with trips but no fills still get a zero row only if they have adjustments — skip empty
        const reports: WeeklyFuelReport[] = [];

        for (const [driverId, rows] of byDriver) {
            const entries = rows.map((r) => ({
                ...r.entry,
                driverId: driverId === UNASSIGNED_FUEL_DRIVER_ID ? r.entry.driverId : driverId,
            }));
            const vehicleIds = [...new Set(entries.map((e) => e.vehicleId).filter(Boolean) as string[])];
            // Primary = highest spend vehicle
            let primaryId = vehicleIds[0];
            let maxSpend = -1;
            for (const vid of vehicleIds) {
                const spend = entries
                    .filter((e) => e.vehicleId === vid)
                    .reduce((s, e) => s + fuelOpsSpendAmount(e), 0);
                if (spend > maxSpend) {
                    maxSpend = spend;
                    primaryId = vid;
                }
            }
            const primaryVehicle =
                (primaryId && vehicleById.get(primaryId)) ||
                vehicles[0] ||
                ({ id: 'unknown', licensePlate: '—', fuelSettings: undefined } as FuelCalcVehicle);

            const plates = vehicleIds.map((id) => {
                const v = vehicleById.get(id);
                return v?.licensePlate || id.slice(0, 8);
            });

            const hit = resolveDriverVersionForWeek(scenarios, driverId, startStr);
            const policyId = hit?.scenario.id;

            const expandedTrips = trips.filter((t) => {
                if (!isEntryInInclusiveYmdRange(t.date, startStr, endStr)) return false;
                if (!(t.status === 'Completed' || t.status === 'Cancelled')) return false;
                if (driverId === UNASSIGNED_FUEL_DRIVER_ID) return false;
                if (t.driverId === driverId) return true;
                return false;
            });

            const driverAdjustments = adjustments.filter(
                (a) =>
                    a.driverId === driverId &&
                    isEntryInInclusiveYmdRange(a.date, startStr, endStr),
            );

            // Scope entries to "virtual" filter: pass entries with vehicleId forced through
            // by using a custom path — filter inside calc uses vehicle.id. For multi-vehicle
            // we compute on primary vehicle entries only then... Better: patch entries to
            // primary vehicle for distance buckets OR call calc with all entries matching
            // any of vehicleIds by temporarily using a synthetic filter.

            // Use primary vehicle calc with ONLY this driver's entries (rewrite vehicleId
            // for bucket calc when multi-vehicle — keep real vehicleId on cost via filter change).

            // Simpler approach: call calculateReconciliation once per vehicle for this driver's
            // slice, then merge category costs and re-apply policy. For single-vehicle (common):
            if (vehicleIds.length <= 1) {
                const scopedEntries = entries.map((e) => ({
                    ...e,
                    vehicleId: primaryVehicle.id,
                }));
                const scopedTrips = expandedTrips.map((t) => ({
                    ...t,
                    vehicleId: t.vehicleId || primaryVehicle.id,
                }));
                const report = FuelCalculationService.calculateReconciliation(
                    primaryVehicle,
                    weekStart,
                    weekEnd,
                    scopedTrips,
                    scopedEntries,
                    driverAdjustments.map((a) => ({ ...a, vehicleId: primaryVehicle.id })),
                    scenarios,
                    deadheadMap?.get(primaryVehicle.id),
                    {
                        driverId,
                        fuelScenarioId: policyId,
                        reportId: `${driverId}_${startStr}`,
                        vehicleIds: vehicleIds.length ? vehicleIds : [primaryVehicle.id],
                        vehiclePlates: plates,
                        brainClassification: brainByDriverVehicle?.get(`${driverId}:${primaryVehicle.id}`),
                        personalAllowance: personalAllowance
                            ? { ...personalAllowance, driverWeekTrips: expandedTrips }
                            : undefined,
                        externalAnchors: externalAnchorsByVehicleId?.get(primaryVehicle.id),
                    },
                );
                // Restore: pending from original entries
                report.pendingCount = entries.filter((e) => e.reconciliationStatus === 'Pending').length;
                if (driverId === UNASSIGNED_FUEL_DRIVER_ID) {
                    report.healthStatus = 'Amber';
                    report.metadata = {
                        ...report.metadata,
                        scenarioName: 'Unassigned fills',
                        unassignedFills: true,
                    };
                }
                reports.push(report);
                continue;
            }

            // Multi-vehicle driver: sum per-vehicle slices
            let merged = FuelCalculationService.calculateReconciliation(
                primaryVehicle,
                weekStart,
                weekEnd,
                [],
                [],
                [],
                scenarios,
                undefined,
                {
                    driverId,
                    fuelScenarioId: policyId,
                    reportId: `${driverId}_${startStr}`,
                    vehicleIds,
                    vehiclePlates: plates,
                },
            );
            merged.totalGasCardCost = 0;
            merged.rideShareCost = 0;
            merged.companyUsageCost = 0;
            merged.deadheadCost = 0;
            merged.personalUsageCost = 0;
            merged.miscellaneousCost = 0;
            merged.windowTimingCost = 0;
            merged.unattributedFillCost = 0;
            merged.driverMiscShare = 0;
            merged.totalTripDistance = 0;
            merged.companyMiscDistance = 0;
            merged.deadheadDistance = 0;
            merged.personalDistance = 0;
            merged.pendingCount = 0;
            merged.companyShare = 0;
            merged.driverShare = 0;
            let sliceMeta: any = null;

            for (const vid of vehicleIds) {
                const v = vehicleById.get(vid) || primaryVehicle;
                const vEntries = entries.filter((e) => e.vehicleId === vid);
                const vTrips = expandedTrips.filter((t) => t.vehicleId === vid || (!t.vehicleId && t.driverId === driverId));
                const vAdj = driverAdjustments.filter((a) => a.vehicleId === vid);
                const slice = FuelCalculationService.calculateReconciliation(
                    v,
                    weekStart,
                    weekEnd,
                    vTrips,
                    vEntries,
                    vAdj,
                    scenarios,
                    deadheadMap?.get(vid),
                    {
                        driverId,
                        fuelScenarioId: policyId,
                        brainClassification: brainByDriverVehicle?.get(`${driverId}:${vid}`),
                        skipPersonalAllowance: true,
                        externalAnchors: externalAnchorsByVehicleId?.get(vid),
                    },
                );
                if (!sliceMeta && slice.metadata?.rideShareCalc) sliceMeta = slice.metadata;
                merged.totalGasCardCost += slice.totalGasCardCost;
                merged.rideShareCost += slice.rideShareCost;
                merged.companyUsageCost += slice.companyUsageCost;
                merged.deadheadCost += slice.deadheadCost || 0;
                merged.personalUsageCost += slice.personalUsageCost;
                merged.miscellaneousCost += slice.miscellaneousCost;
                merged.windowTimingCost =
                    (merged.windowTimingCost || 0) + (Number(slice.windowTimingCost) || 0);
                merged.unattributedFillCost =
                    (merged.unattributedFillCost || 0) + (Number(slice.unattributedFillCost) || 0);
                merged.driverMiscShare =
                    (merged.driverMiscShare || 0) + (Number(slice.driverMiscShare) || 0);
                merged.totalTripDistance += slice.totalTripDistance;
                merged.companyMiscDistance += slice.companyMiscDistance;
                merged.deadheadDistance += slice.deadheadDistance || 0;
                merged.personalDistance += slice.personalDistance;
                merged.pendingCount = (merged.pendingCount || 0) + (slice.pendingCount || 0);
                merged.companyShare += slice.companyShare;
                merged.driverShare += slice.driverShare;
                merged.odometerBuckets = [
                    ...(merged.odometerBuckets || []),
                    ...(slice.odometerBuckets || []),
                ];
            }
            // P-1 harden: recompute misc from merged named buckets so a forgotten field cannot desync.
            merged.miscellaneousCost = computeMiscellaneousCost(merged.totalGasCardCost, {
                rideShare: merged.rideShareCost,
                companyUsage: merged.companyUsageCost,
                deadhead: merged.deadheadCost || 0,
                personal: merged.personalUsageCost,
                windowTiming: Number(merged.windowTimingCost) || 0,
                unattributedFill: Number(merged.unattributedFillCost) || 0,
            });
            merged.vehicleId = primaryVehicle.id;
            if (sliceMeta) {
                merged.metadata = { ...merged.metadata, ...sliceMeta };
            }
            if (personalAllowance) {
                const resolvedPa = personalAllowance.resolveForDriver?.(driverId);
                const paEnabled = (resolvedPa?.config ?? personalAllowance.config)?.enabled;
                if (paEnabled) {
                const activeScenario = pickScenarioForDriverMembership(scenarios, driverId, startStr);
                const fuelRule = activeScenario?.rules.find((r) => r.category === 'Fuel');
                // Never invent USD-era 1.50 — only use observed/org price already on the report
                const priceGuess =
                    Number(merged.metadata?.rideShareCalc?.actualPricePerLiter) > 0
                        ? Number(merged.metadata.rideShareCalc.actualPricePerLiter)
                        : 0;
                const knownEff = Number(merged.metadata?.rideShareCalc?.observedEfficiency);
                let effGuess =
                    priceGuess > 0 && merged.personalDistance > 0 && merged.personalUsageCost > 0
                        ? (merged.personalDistance * priceGuess) / merged.personalUsageCost
                        : knownEff;
                if (!(effGuess > 0) && priceGuess > 0 && merged.personalDistance > 0) {
                    const attributed =
                        (merged.rideShareCost || 0) +
                        (merged.companyUsageCost || 0) +
                        (merged.deadheadCost || 0) +
                        (merged.miscellaneousCost || 0) +
                        (Number(merged.windowTimingCost) || 0) +
                        (Number(merged.unattributedFillCost) || 0);
                    const residualCost = Math.max(0, (merged.totalGasCardCost || 0) - attributed);
                    if (residualCost > 0) {
                        effGuess = (merged.personalDistance * priceGuess) / residualCost;
                    }
                }
                if (!(effGuess > 0)) {
                    effGuess = knownEff > 0 ? knownEff : FALLBACK_EFFICIENCY_KM_L;
                }
                if (priceGuess > 0) {
                merged.metadata = {
                    ...merged.metadata,
                    rideShareCalc: {
                        ...(merged.metadata?.rideShareCalc || {}),
                        observedEfficiency: effGuess,
                        actualPricePerLiter: priceGuess,
                    },
                };
                merged = FuelCalculationService.applyPersonalAllowanceToReport(
                    merged,
                    fuelRule,
                    personalAllowance,
                    expandedTrips,
                );
                }
                }
            }
            reports.push(merged);
        }

        // Include drivers with spend-less trip activity? skip — recon is fuel-spend driven
        // Also include vehicles with fills that somehow didn't attribute (already in unassigned)

        return reports.sort((a, b) => (b.totalGasCardCost || 0) - (a.totalGasCardCost || 0));
    },

    /**
     * Stop-to-stop buckets — delegates to odometerBucketEngine (fill boundaries + referenceId join).
     */
    calculateOdometerBuckets: (
        vehicle: FuelCalcVehicle,
        fuelEntries: FuelEntry[],
        trips: FuelCalcTrip[],
        adjustments: MileageAdjustment[] = [],
        externalAnchors?: OdometerBucketAnchor[]
    ): OdometerBucket[] => {
        return calculateOdometerBucketsEngine(vehicle, fuelEntries, trips, adjustments, externalAnchors);
    }
};