/**
 * Shared utility for fuel-related calculations to ensure consistency across components.
 */

import { FuelEntry, MileageAdjustment, WeeklyFuelReport, FuelScenario, OdometerBucket } from '../types/fuel';
import { Vehicle } from '../types/vehicle';
import { Trip } from '../types/data';

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
     * Generates a reconciliation report for a single vehicle.
     */
    calculateReconciliation: (
        vehicle: Vehicle,
        weekStart: Date,
        weekEnd: Date,
        trips: Trip[],
        fuelEntries: FuelEntry[],
        adjustments: MileageAdjustment[],
        scenarios: FuelScenario[] = []
    ): WeeklyFuelReport => {
        const startStr = weekStart.toISOString().split('T')[0];
        const endStr = weekEnd.toISOString().split('T')[0];

        // 1. Find the active scenario for this vehicle
        const activeScenario = scenarios.find(s => s.id === vehicle.fuelScenarioId) || 
                             scenarios.find(s => s.isDefault) || 
                             scenarios[0];

        // Helper to get rule for a specific category
        const getCoverage = (category: 'rideShare' | 'companyUsage' | 'personal' | 'misc', amount: number) => {
            if (!activeScenario) return { company: amount, driver: 0 }; // Default to company pays all if no scenario

            const rule = activeScenario.rules.find(r => r.category === 'Fuel');
            if (!rule) return { company: amount, driver: 0 };

            // Determine specific percentage/value for this sub-category
            let coveragePercent = rule.coverageValue;
            if (category === 'rideShare' && rule.rideShareCoverage !== undefined) coveragePercent = rule.rideShareCoverage;
            if (category === 'companyUsage' && rule.companyUsageCoverage !== undefined) coveragePercent = rule.companyUsageCoverage;
            if (category === 'personal' && rule.personalCoverage !== undefined) coveragePercent = rule.personalCoverage;
            if (category === 'misc' && rule.miscCoverage !== undefined) coveragePercent = rule.miscCoverage;

            if (rule.coverageType === 'Full') {
                return { company: amount, driver: 0 };
            } else if (rule.coverageType === 'Percentage') {
                const companyPay = amount * (coveragePercent / 100);
                return { company: companyPay, driver: amount - companyPay };
            } else if (rule.coverageType === 'Fixed_Amount') {
                const companyPay = Math.min(amount, rule.coverageValue);
                return { company: companyPay, driver: amount - companyPay };
            }

            return { company: amount, driver: 0 };
        };

        // 2. Filter data for this vehicle and week
        const vehicleEntries = fuelEntries.filter(e => 
            e.vehicleId === vehicle.id && 
            e.date >= startStr && 
            e.date <= endStr
        );

        // Phase 3: Calculate Pending Count
        const pendingCount = vehicleEntries.filter(e => e.reconciliationStatus === 'Pending').length;

        const vehicleTrips = trips.filter(t => 
            t.vehicleId === vehicle.id && 
            t.date >= startStr && 
            t.date <= endStr &&
            t.status === 'Completed'
        );

        const vehicleAdjustments = adjustments.filter(a => 
            a.vehicleId === vehicle.id && 
            a.date >= startStr && 
            a.date <= endStr
        );

        // 3. Aggregate Costs
        const totalGasCardCost = vehicleEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
        
        // 4. Aggregate Distances
        const totalTripDistance = vehicleTrips.reduce((sum, t) => sum + (t.distance || 0), 0);
        const companyMiscDistance = vehicleAdjustments
            .filter(a => a.type === 'Company_Misc' || a.type === 'Maintenance')
            .reduce((sum, a) => sum + (a.distance || 0), 0);
        const personalDistance = vehicleAdjustments
            .filter(a => a.type === 'Personal')
            .reduce((sum, a) => sum + (a.distance || 0), 0);

        // 5. Calculate Costs (Simple estimation logic)
        // In a real system, this would use vehicle MPG. Using a default 10km/L and $1.50/L for estimation.
        const estKmL = 10; 
        const estPrice = 1.50;
        
        const rideShareCost = (totalTripDistance / estKmL) * estPrice;
        const companyUsageCost = (companyMiscDistance / estKmL) * estPrice;
        const personalUsageCost = (personalDistance / estKmL) * estPrice;

        // 6. Calculate Leakage (Miscellaneous)
        const miscellaneousCost = totalGasCardCost - (rideShareCost + companyUsageCost + personalUsageCost);

        // 7. Split Costs dynamically using Scenario Rules
        const rideShareSplit = getCoverage('rideShare', rideShareCost);
        const companyUsageSplit = getCoverage('companyUsage', companyUsageCost);
        const personalSplit = getCoverage('personal', personalUsageCost);
        const miscSplit = getCoverage('misc', miscellaneousCost);

        const companyShare = rideShareSplit.company + companyUsageSplit.company + personalSplit.company + miscSplit.company;
        const driverShare = rideShareSplit.driver + companyUsageSplit.driver + personalSplit.driver + miscSplit.driver;

        // 8. Calculate Health Status (Phase 4)
        const buckets = FuelCalculationService.calculateOdometerBuckets(vehicle, vehicleEntries, vehicleTrips, vehicleAdjustments);
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

        return {
            id: `${vehicle.id}_${startStr}`,
            weekStart: weekStart.toISOString(),
            weekEnd: weekEnd.toISOString(),
            vehicleId: vehicle.id,
            driverId: vehicle.currentDriverId || '',
            totalGasCardCost,
            totalTripDistance,
            rideShareCost,
            companyMiscDistance,
            companyUsageCost,
            personalDistance,
            personalUsageCost,
            miscellaneousCost,
            companyShare,
            driverShare,
            status: 'Draft',
            pendingCount,
            healthStatus,
            healthScore,
            metadata: {
                scenarioName: activeScenario?.name || 'Standard (Fallback)',
                scenarioId: activeScenario?.id
            }
        };
    },

    /**
     * Generates reconciliation reports for the entire fleet.
     */
    generateFleetReport: (
        vehicles: Vehicle[],
        weekStart: Date,
        weekEnd: Date,
        trips: Trip[],
        fuelEntries: FuelEntry[],
        adjustments: MileageAdjustment[],
        checkIns: any[],
        scenarios: FuelScenario[]
    ): WeeklyFuelReport[] => {
        return vehicles.map(v => 
            FuelCalculationService.calculateReconciliation(v, weekStart, weekEnd, trips, fuelEntries, adjustments, scenarios)
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
        adjustments: MileageAdjustment[] = []
    ): OdometerBucket[] => {
        // 1. Separate entries into Anchors (Verified Odo) and Floating (Legacy/Cash)
        // We consider an entry an "Anchor" if it has a valid odometer reading.
        const anchors = fuelEntries
            .filter(e => e.vehicleId === vehicle.id && e.odometer !== undefined && e.odometer !== null)
            .sort((a, b) => (a.odometer || 0) - (b.odometer || 0));

        const floating = fuelEntries
            .filter(e => e.vehicleId === vehicle.id && (e.odometer === undefined || e.odometer === null));

        if (anchors.length < 2) return [];

        const buckets: OdometerBucket[] = [];
        const avgEfficiency = vehicle.fuelSettings?.efficiencyCity || 10; 

        for (let i = 0; i < anchors.length - 1; i++) {
            const startAnchor = anchors[i];
            const endAnchor = anchors[i + 1];

            const startOdo = startAnchor.odometer || 0;
            const endOdo = endAnchor.odometer || 0;
            const bucketDistance = endOdo - startOdo;

            if (bucketDistance <= 0) continue;

            // 2. Identify "Floating" receipts that fall within this anchor window
            // We use dates as the boundary for these legacy receipts.
            const windowReceipts = floating.filter(f => 
                f.date >= startAnchor.date && f.date <= endAnchor.date
            );

            // 3. Accumulate Volume & Cost
            // The fuel that "filled" this distance includes all mid-window receipts PLUS the closing anchor's fuel.
            const totalLiters = (endAnchor.liters || 0) + windowReceipts.reduce((sum, r) => sum + (r.liters || 0), 0);
            const totalCost = (endAnchor.amount || 0) + windowReceipts.reduce((sum, r) => sum + (r.amount || 0), 0);
            
            const associatedReceipts = [endAnchor.id, ...windowReceipts.map(r => r.id)];

            // 4. Find trips that belong to this bucket
            const bucketTrips = trips.filter(t => {
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
            const rideShareDistance = bucketTrips.reduce((sum, t) => sum + (t.distance || 0), 0);
            const personalDistance = bucketAdjustments
                .filter(a => a.type === 'Personal')
                .reduce((sum, a) => sum + (a.distance || 0), 0);
            const companyMiscDistance = bucketAdjustments
                .filter(a => a.type === 'Company_Misc' || a.type === 'Maintenance')
                .reduce((sum, a) => sum + (a.distance || 0), 0);

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
                closingEntryId: endAnchor.id,
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
