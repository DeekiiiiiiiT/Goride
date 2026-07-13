/**
 * Shared utility for fuel-related calculations to ensure consistency across components.
 */

import { FuelEntry, MileageAdjustment, WeeklyFuelReport, FuelScenario, FuelRule, OdometerBucket } from '../types/fuel';
import { Vehicle } from '../types/vehicle';
import { Trip } from '../types/data';
import {
  getCategoryCoverageSplit as splitCategory,
  splitAllCategoryCosts,
  type FuelCoverageCategory,
} from '../utils/fuelCoverageSplit';
import {
  pickScenarioForDriverMembership,
  pickScenarioForDriverWeek,
  resolveDriverVersionForWeek,
} from '../utils/fuelPolicyVersion';
import { resolveFuelFillDriver } from '../utils/resolveFuelFillDriver';
import { UNASSIGNED_FUEL_DRIVER_ID } from '../types/fuel';
import type { FuelCard } from '../types/fuel';
import { isEntryInInclusiveYmdRange } from '../utils/fuelWeekPeriod';

export type { FuelCoverageCategory };

/** Per-vehicle deadhead attribution passed in from the API (Phase 2) */
export interface VehicleDeadheadInput {
    vehicleId: string;
    deadheadKm: number;
    personalKm: number;
    totalOdometerKm: number;
    method: 'A' | 'C' | 'combined' | 'fallback';
    confidenceLevel: 'high' | 'medium' | 'low';
    confidenceReason: string;
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
     * For cancelled trips, only trip.distance may be available (normalized fields default to 0).
     */
    getTotalTripRideshareKm: (trip: Trip): number => {
        const onTrip = trip.distance || 0;
        const enroute = trip.normalizedEnrouteDistance || 0;
        const open = trip.normalizedOpenDistance || 0;
        const unavailable = trip.normalizedUnavailableDistance || 0;
        return onTrip + enroute + open + unavailable;
    },

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
        if (!report.totalGasCardCost || report.totalGasCardCost <= 0) return 0;
        return report.driverShare / report.totalGasCardCost;
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
        vehicle: Vehicle,
        weekStart: Date,
        weekEnd: Date,
        trips: Trip[],
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

        // 2. Filter data for this vehicle and week (YMD — ISO timestamps normalize via toEntryYmd)
        const vehicleEntries = fuelEntries.filter(e => 
            e.vehicleId === vehicle.id && 
            isEntryInInclusiveYmdRange(e.date, startStr, endStr)
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

        // 3. Aggregate Costs
        const totalGasCardCost = vehicleEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
        const totalLiters = vehicleEntries.reduce((sum, e) => sum + (e.liters || 0), 0);

        // 3b. Compute observed efficiency (km/L) from fuel entries with odometer readings
        const entriesWithOdo = vehicleEntries
            .filter(e => e.odometer !== undefined && e.odometer !== null && e.odometer > 0 && (e.liters || 0) > 0)
            .sort((a, b) => (a.odometer || 0) - (b.odometer || 0));

        // Step 2.3: Efficiency fuel — exclude first fill-up (standard fill-to-fill method).
        // Floating entries (no odometer) are already excluded by entriesWithOdo filter.
        const efficiencyFuel = entriesWithOdo.length >= 2
            ? entriesWithOdo.slice(1).reduce((sum, e) => sum + (e.liters || 0), 0)
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
                observedEfficiency = 10; // Last resort fallback
            }
        }

        // 3c. Compute actual price per liter from fuel entries in the period
        let actualPricePerLiter = 0;
        if (totalLiters > 0 && totalGasCardCost > 0) {
            actualPricePerLiter = totalGasCardCost / totalLiters;
        }
        if (actualPricePerLiter <= 0) {
            actualPricePerLiter = 1.50; // Fallback if no fuel entries exist
        }
        
        // 4. Aggregate Distances
        const totalTripDistance = vehicleTrips.reduce(
            (sum, t) => sum + FuelCalculationService.getTotalTripRideshareKm(t), 0
        );
        const companyMiscDistance = vehicleAdjustments
            .filter(a => a.type === 'Company_Misc' || a.type === 'Maintenance')
            .reduce((sum, a) => sum + (a.distance || 0), 0);

        // 4b. Option C: Hybrid Residual — compute personal km from odometer buckets.
        // Move bucket calculation up so we can derive personal distance from the odometer delta.
        const buckets = FuelCalculationService.calculateOdometerBuckets(vehicle, vehicleEntries, vehicleTrips, vehicleAdjustments);
        const totalOdometerDelta = buckets.reduce((sum, b) => sum + (b.endOdometer - b.startOdometer), 0);

        // Step 2.3a: Compute raw residual (everything that isn't trip or company ops)
        const rawResidual = totalOdometerDelta > 0
            ? Math.max(0, totalOdometerDelta - totalTripDistance - companyMiscDistance)
            : vehicleAdjustments.filter(a => a.type === 'Personal').reduce((sum, a) => sum + (a.distance || 0), 0);

        // Step 2.3b: Split residual into deadhead + personal using server attribution
        let deadheadDistance = 0;
        let personalDistance = rawResidual;

        if (deadheadData && totalOdometerDelta > 0) {
            // Cap deadhead to never exceed the residual (server may have different odometer window)
            deadheadDistance = Math.min(deadheadData.deadheadKm, rawResidual);
            personalDistance = Math.max(0, rawResidual - deadheadDistance);
        }

        // 5. Calculate Costs using observed efficiency and actual fuel price
        const rideShareCost = (totalTripDistance / observedEfficiency) * actualPricePerLiter;
        const companyUsageCost = (companyMiscDistance / observedEfficiency) * actualPricePerLiter;
        const deadheadCost = (deadheadDistance / observedEfficiency) * actualPricePerLiter;
        const personalUsageCost = (personalDistance / observedEfficiency) * actualPricePerLiter;

        // 6. Calculate Leakage (Miscellaneous) — deadheadCost is now subtracted as an explained category
        const miscellaneousCost = totalGasCardCost - (rideShareCost + companyUsageCost + deadheadCost + personalUsageCost);

        // 7. Split Costs dynamically using Scenario Rules (shared contract)
        const weekSplit = splitAllCategoryCosts(
            {
                rideShare: rideShareCost,
                companyUsage: companyUsageCost,
                deadhead: deadheadCost,
                personal: personalUsageCost,
                misc: miscellaneousCost,
            },
            fuelRule,
        );
        const rideShareSplit = { company: weekSplit.company.rideShare, driver: weekSplit.driver.rideShare };
        const companyUsageSplit = { company: weekSplit.company.companyUsage, driver: weekSplit.driver.companyUsage };
        const deadheadSplit = { company: weekSplit.company.deadhead, driver: weekSplit.driver.deadhead };
        const personalSplit = { company: weekSplit.company.personal, driver: weekSplit.driver.personal };
        const miscSplit = { company: weekSplit.company.misc, driver: weekSplit.driver.misc };

        const companyShare = rideShareSplit.company + companyUsageSplit.company + deadheadSplit.company + personalSplit.company + miscSplit.company;
        const driverShare = rideShareSplit.driver + companyUsageSplit.driver + deadheadSplit.driver + personalSplit.driver + miscSplit.driver;

        // 8. Calculate Health Status (Phase 4)
        // Buckets already computed above in step 4b
        const efficiencySource: 'odometer' | 'vehicle_settings' | 'default_fallback' =
            entriesWithOdo.length >= 3
              ? 'odometer'
              : (vehicle.fuelSettings?.efficiencyCity ? 'vehicle_settings' : 'default_fallback');
        const priceSource: 'fuel_entries' | 'default_fallback' =
            (totalLiters > 0 && totalGasCardCost > 0) ? 'fuel_entries' : 'default_fallback';

        let healthStatus: 'Emerald' | 'Amber' | 'Red' = 'Emerald';
        let healthScore = 100;

        if (buckets.length === 0 && vehicleEntries.length > 0) {
            healthStatus = 'Red';
            healthScore = 0;
        } else if (buckets.some(b => b.status === 'Anomaly')) {
            healthStatus = 'Amber';
            healthScore = 70;
            // Check for severe anomalies
            if (buckets.some(b => b.unaccountedDistance > (b.endOdometer - b.startOdometer) * 0.3)) {
                healthStatus = 'Red';
                healthScore = 40;
            }
        }

        const reportDriverId = options?.driverId ?? vehicle.currentDriverId ?? '';
        if (reportDriverId === UNASSIGNED_FUEL_DRIVER_ID || !reportDriverId) {
            healthStatus = healthStatus === 'Emerald' ? 'Amber' : healthStatus;
            healthScore = Math.min(healthScore, 60);
        }

        // Fallback efficiency/price makes Ride Share estimates unreliable
        if (efficiencySource === 'default_fallback' || priceSource === 'default_fallback') {
            healthStatus = healthStatus === 'Emerald' ? 'Amber' : healthStatus;
            healthScore = Math.min(healthScore, 65);
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
            companyShare,
            driverShare,
            status: 'Draft',
            pendingCount,
            healthStatus,
            healthScore,
            odometerBuckets: buckets,
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
                // Ride Share calculation transparency
                rideShareCalc: {
                    totalRideshareKm: totalTripDistance,
                    observedEfficiency: Number(observedEfficiency.toFixed(2)),
                    actualPricePerLiter: Number(actualPricePerLiter.toFixed(3)),
                    efficiencySource,
                    priceSource,
                    totalLitersInPeriod: Number(totalLiters.toFixed(2)),
                    tripsIncluded: vehicleTrips.length,
                    completedTrips: vehicleTrips.filter(t => t.status === 'Completed').length,
                    cancelledTrips: vehicleTrips.filter(t => t.status === 'Cancelled').length,
                }
            }
        };
    },

    /**
     * Driver-first fleet reports: attribute fills, group by driver+week, apply driver policy.
     * Shared car → one row per driver. Unassigned fills → Amber sentinel row.
     */
    generateDriverFleetReport: (
        vehicles: Vehicle[],
        drivers: Array<{ id: string; fuelScenarioId?: string; name?: string }>,
        weekStart: Date,
        weekEnd: Date,
        trips: Trip[],
        fuelEntries: FuelEntry[],
        adjustments: MileageAdjustment[],
        scenarios: FuelScenario[],
        deadheadMap?: Map<string, VehicleDeadheadInput>,
        fuelCards: FuelCard[] = [],
    ): WeeklyFuelReport[] => {
        const startStr = FuelCalculationService.toLocalDateStr(weekStart);
        const endStr = FuelCalculationService.toLocalDateStr(weekEnd);
        const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
        const driverById = new Map(drivers.map((d) => [d.id, d]));

        const weekEntries = fuelEntries.filter((e) => e.date >= startStr && e.date <= endStr);
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
                const spend = entries.filter((e) => e.vehicleId === vid).reduce((s, e) => s + (e.amount || 0), 0);
                if (spend > maxSpend) {
                    maxSpend = spend;
                    primaryId = vid;
                }
            }
            const primaryVehicle =
                (primaryId && vehicleById.get(primaryId)) ||
                vehicles[0] ||
                ({ id: 'unknown', licensePlate: '—', fuelSettings: undefined } as Vehicle);

            const plates = vehicleIds.map((id) => {
                const v = vehicleById.get(id);
                return v?.licensePlate || id.slice(0, 8);
            });

            const hit = resolveDriverVersionForWeek(scenarios, driverId, startStr);
            const policyId = hit?.scenario.id;

            const expandedTrips = trips.filter((t) => {
                if (t.date < startStr || t.date > endStr) return false;
                if (!(t.status === 'Completed' || t.status === 'Cancelled')) return false;
                if (driverId === UNASSIGNED_FUEL_DRIVER_ID) return false;
                if (t.driverId === driverId) return true;
                return false;
            });

            const driverAdjustments = adjustments.filter(
                (a) =>
                    a.driverId === driverId &&
                    a.date >= startStr &&
                    a.date <= endStr,
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
            merged.totalTripDistance = 0;
            merged.companyMiscDistance = 0;
            merged.deadheadDistance = 0;
            merged.personalDistance = 0;
            merged.pendingCount = 0;
            merged.companyShare = 0;
            merged.driverShare = 0;

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
                    { driverId, fuelScenarioId: policyId },
                );
                merged.totalGasCardCost += slice.totalGasCardCost;
                merged.rideShareCost += slice.rideShareCost;
                merged.companyUsageCost += slice.companyUsageCost;
                merged.deadheadCost += slice.deadheadCost || 0;
                merged.personalUsageCost += slice.personalUsageCost;
                merged.miscellaneousCost += slice.miscellaneousCost;
                merged.totalTripDistance += slice.totalTripDistance;
                merged.companyMiscDistance += slice.companyMiscDistance;
                merged.deadheadDistance += slice.deadheadDistance || 0;
                merged.personalDistance += slice.personalDistance;
                merged.pendingCount = (merged.pendingCount || 0) + (slice.pendingCount || 0);
                merged.companyShare += slice.companyShare;
                merged.driverShare += slice.driverShare;
            }
            merged.vehicleId = primaryVehicle.id;
            reports.push(merged);
        }

        // Include drivers with spend-less trip activity? skip — recon is fuel-spend driven
        // Also include vehicles with fills that somehow didn't attribute (already in unassigned)

        return reports.sort((a, b) => (b.totalGasCardCost || 0) - (a.totalGasCardCost || 0));
    },

    /**
     * Generates reconciliation reports for the entire fleet (legacy vehicle-week).
     * @deprecated Prefer generateDriverFleetReport
     */
    generateFleetReport: (
        vehicles: Vehicle[],
        weekStart: Date,
        weekEnd: Date,
        trips: Trip[],
        fuelEntries: FuelEntry[],
        adjustments: MileageAdjustment[],
        checkIns: any[],
        scenarios: FuelScenario[],
        deadheadMap?: Map<string, VehicleDeadheadInput>
    ): WeeklyFuelReport[] => {
        return vehicles.map(v => 
            FuelCalculationService.calculateReconciliation(v, weekStart, weekEnd, trips, fuelEntries, adjustments, scenarios, deadheadMap?.get(v.id))
        );
    },

    /**
     * Groups fuel entries and trips into odometer-based buckets.
     * Each bucket represents the distance traveled between two verified odometer scans (Anchors),
     * accumulating any "Floating" receipts that occurred between those scans.
     */
    calculateOdometerBuckets: (
        vehicle: Vehicle,
        fuelEntries: FuelEntry[],
        trips: Trip[],
        adjustments: MileageAdjustment[] = [],
        externalAnchors?: { id: string; date: string; odometer: number }[]
    ): OdometerBucket[] => {
        // 1. Determine anchors: use external unified anchors if provided, otherwise extract from fuel entries
        let anchors: { id: string; date: string; odometer: number }[];

        if (externalAnchors && externalAnchors.length >= 2) {
            anchors = [...externalAnchors].sort((a, b) => a.odometer - b.odometer);
        } else {
            anchors = fuelEntries
                .filter(e => e.vehicleId === vehicle.id && e.odometer !== undefined && e.odometer !== null)
                .map(e => ({ id: e.id, date: e.date, odometer: e.odometer! }))
                .sort((a, b) => a.odometer - b.odometer);
        }

        const floating = fuelEntries
            .filter(e => e.vehicleId === vehicle.id && (e.odometer === undefined || e.odometer === null));

        if (anchors.length < 2) return [];

        const buckets: OdometerBucket[] = [];
        // Compute observed efficiency using the same 3-tier fallback chain as calculateReconciliation
        const allVehicleEntries = fuelEntries.filter(e => e.vehicleId === vehicle.id);
        // Step 3.2: Filter to entries with BOTH valid odometer (>0) AND valid liters (>0), sorted by odometer
        const odoEntries = allVehicleEntries
            .filter(e => e.odometer !== undefined && e.odometer !== null && e.odometer > 0 && (e.liters || 0) > 0)
            .sort((a, b) => (a.odometer || 0) - (b.odometer || 0));

        // Step 3.3: Efficiency fuel — exclude first fill-up (standard fill-to-fill method)
        const bucketEfficiencyFuel = odoEntries.length >= 2
            ? odoEntries.slice(1).reduce((sum, e) => sum + (e.liters || 0), 0)
            : 0;

        let bucketEfficiencyKmL = 0; // km/L
        // Step 3.4: >= 3 entries for reliability, use bucketEfficiencyFuel (not allLiters)
        if (odoEntries.length >= 3 && bucketEfficiencyFuel > 0) {
            const odoSpan = (odoEntries[odoEntries.length - 1].odometer || 0) - (odoEntries[0].odometer || 0);
            if (odoSpan > 0) {
                bucketEfficiencyKmL = odoSpan / bucketEfficiencyFuel;
            }
        }
        if (bucketEfficiencyKmL <= 0) {
            const cityEff = vehicle.fuelSettings?.efficiencyCity;
            if (cityEff && cityEff > 0) {
                bucketEfficiencyKmL = 100 / cityEff; // L/100km -> km/L
            } else {
                bucketEfficiencyKmL = 10; // 10 km/L default
            }
        }

        // Convert km/L to L/100km for expected fuel calculation
        const avgEfficiency = 100 / bucketEfficiencyKmL; // L/100km

        for (let i = 0; i < anchors.length - 1; i++) {
            const startAnchor = anchors[i];
            const endAnchor = anchors[i + 1];

            const startOdo = startAnchor.odometer;
            const endOdo = endAnchor.odometer;
            const bucketDistance = endOdo - startOdo;

            if (bucketDistance <= 0) continue;

            // 2. Identify "Floating" receipts that fall within this anchor window
            // We use dates as the boundary for these legacy receipts.
            const windowReceipts = floating.filter(f => 
                f.date >= startAnchor.date && f.date <= endAnchor.date
            );

            // 3. Accumulate Volume & Cost
            // Check if the closing anchor corresponds to a fuel entry (it might be a check-in or service record)
            const closingFuelEntry = fuelEntries.find(e => e.id === endAnchor.id || (e.odometer === endAnchor.odometer && e.date === endAnchor.date));
            const closingLiters = closingFuelEntry?.liters || 0;
            const closingCost = closingFuelEntry?.amount || 0;

            // Also find any fuel entries that fall WITHIN the bucket window (between anchors, with odometer readings)
            // These are fuel entries whose odometer is between startOdo and endOdo, excluding the anchors themselves
            const midBucketFuelEntries = fuelEntries.filter(e =>
                e.vehicleId === vehicle.id &&
                e.odometer !== undefined && e.odometer !== null &&
                e.odometer > startOdo && e.odometer < endOdo &&
                e.id !== startAnchor.id && e.id !== endAnchor.id
            );

            const totalLiters = closingLiters 
                + windowReceipts.reduce((sum, r) => sum + (r.liters || 0), 0)
                + midBucketFuelEntries.reduce((sum, e) => sum + (e.liters || 0), 0);
            const totalCost = closingCost 
                + windowReceipts.reduce((sum, r) => sum + (r.amount || 0), 0)
                + midBucketFuelEntries.reduce((sum, e) => sum + (e.amount || 0), 0);

            const associatedReceipts = [
                ...(closingFuelEntry ? [closingFuelEntry.id] : []),
                ...windowReceipts.map(r => r.id),
                ...midBucketFuelEntries.map(e => e.id)
            ];

            // 4. Find trips that belong to this bucket
            const bucketTrips = trips.filter(t => {
                // Only include Completed and Cancelled trips (Processing trips are unverified)
                if (t.status !== 'Completed' && t.status !== 'Cancelled') return false;
                
                const tripStart = t.startOdometer || 0;
                const tripEnd = t.endOdometer || 0;
                // If trip has odometers, use them. If not, use date range as fallback
                if (t.startOdometer && t.endOdometer) {
                    return t.vehicleId === vehicle.id && tripStart >= startOdo && tripEnd <= endOdo;
                }
                return t.vehicleId === vehicle.id && t.date >= startAnchor.date && t.date <= endAnchor.date;
            });

            // 5. Find adjustments in this bucket
            const bucketAdjustments = adjustments.filter(a => {
                return a.vehicleId === vehicle.id && a.date >= startAnchor.date && a.date <= endAnchor.date;
            });

            // 6. Calculate Distances
            const rideShareDistance = bucketTrips.reduce((sum, t) => sum + FuelCalculationService.getTotalTripRideshareKm(t), 0);
            const companyMiscDistance = bucketAdjustments
                .filter(a => a.type === 'Company_Misc' || a.type === 'Maintenance')
                .reduce((sum, a) => sum + (a.distance || 0), 0);

            // Option C: Hybrid Residual — personal km is the residual after subtracting
            // ride-share trips and known company ops from the odometer delta.
            const personalDistance = Math.max(0, bucketDistance - rideShareDistance - companyMiscDistance);

            const accountedDistance = rideShareDistance + personalDistance + companyMiscDistance;
            const unaccountedDistance = Math.max(0, bucketDistance - accountedDistance);

            // 7. Efficiency Variance
            const expectedFuelLiters = (bucketDistance / 100) * avgEfficiency;
            const varianceLiters = totalLiters - expectedFuelLiters;
            const variancePercent = expectedFuelLiters > 0 ? (varianceLiters / expectedFuelLiters) * 100 : 0;

            // 8. Phase 1 (Logic Refactoring): 105% Overflow Anomaly
            const tankCapacity = vehicle.fuelSettings?.tankCapacity || Number(vehicle.specifications?.tankCapacity) || 0;
            const isOverflow = tankCapacity > 0 && totalLiters > (tankCapacity * 1.05);

            // 9. Phase 4: Deduction Recommendation
            // Deduction = Gap * (Total Cost in Bucket / Total Distance in Bucket)
            // This charges the driver the actual cost of fuel for the unlogged distance.
            let deductionRecommendation = 0;
            let deductionReason = "";

            if (unaccountedDistance > 10) { // Threshold: 10km gap
                deductionRecommendation = Number((unaccountedDistance * (totalCost / bucketDistance)).toFixed(2));
                deductionReason = `Unaccounted distance gap of ${unaccountedDistance.toLocaleString()}km identified between odometer anchors.`;
            }

            buckets.push({
                id: `bucket_${vehicle.id}_${startOdo}_${endOdo}`,
                vehicleId: vehicle.id,
                startOdometer: startOdo,
                endOdometer: endOdo,
                startDate: startAnchor.date,
                endDate: endAnchor.date,
                actualFuelLiters: totalLiters,
                actualFuelCost: totalCost,
                associatedReceipts,
                closingEntryId: closingFuelEntry?.id || endAnchor.id,
                totalTripDistance: rideShareDistance,
                tripsCount: bucketTrips.length,
                expectedFuelLiters,
                varianceLiters,
                variancePercent,
                rideShareDistance,
                personalDistance,
                companyMiscDistance,
                unaccountedDistance,
                deductionRecommendation: deductionRecommendation > 0 ? deductionRecommendation : undefined,
                deductionReason: deductionReason || undefined,
                status: (isOverflow || unaccountedDistance > (bucketDistance * 0.1) || Math.abs(variancePercent) > 20) ? 'Anomaly' : 'Complete'
            });
        }

        return buckets;
    }
};