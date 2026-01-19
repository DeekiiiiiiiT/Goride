import { Vehicle } from '../types/vehicle';
import { Trip } from '../types/data';
import { FuelEntry, FuelCard, WeeklyFuelReport, MileageAdjustment, FuelScenario } from '../types/fuel';
import { WeeklyCheckIn } from '../types/check-in';

// Defaults if missing from Vehicle Profile
const DEFAULT_EFFICIENCY_L_100KM = 10; // ~23 MPG
const DEFAULT_FUEL_PRICE = 1.75; // $ per Liter

export const FuelCalculationService = {

    /**
     * Calculates the estimated fuel cost for a given distance.
     * Handles L/100km and MPG conversions.
     */
    calculateOperatingCost(
        distanceKm: number, 
        vehicle: Vehicle, 
        pricePerLiter: number = DEFAULT_FUEL_PRICE
    ): number {
        if (!vehicle.fuelSettings) {
            // Fallback
            return (distanceKm / 100) * DEFAULT_EFFICIENCY_L_100KM * pricePerLiter;
        }

        const { efficiencyCity, efficiencyHighway, fuelType } = vehicle.fuelSettings;

        // Simplified: Use City efficiency for all calculations for now (conservative)
        // In future: Use Trip type or speed to blend City/Highway
        let efficiency = efficiencyCity || DEFAULT_EFFICIENCY_L_100KM;

        // If user entered MPG (assuming < 50 usually means MPG is unlikely for gas cars? No, 20-30 is MPG. 
        // 5-15 is L/100km. If it's > 15, likely MPG. 
        // Better: We should have a unit flag. 
        // For now, assuming the inputs are normalized to L/100km by the UI or Profile.
        // If not, we'd add logic here.
        
        const litersUsed = (distanceKm / 100) * efficiency;
        return litersUsed * pricePerLiter;
    },

    /**
     * Aggregates data for a specific period and vehicle to produce the reconciliation row.
     */
    calculateReconciliation(
        vehicle: Vehicle,
        weekStart: Date,
        weekEnd: Date,
        trips: Trip[],
        fuelEntries: FuelEntry[],
        adjustments: MileageAdjustment[] = [],
        checkIns: WeeklyCheckIn[] = [],
        scenarios: FuelScenario[] = []
    ): WeeklyFuelReport {
        const startStr = weekStart.toISOString();
        const endStr = weekEnd.toISOString();

        // 1. Filter Data for this Vehicle & Period
        const vehicleTrips = trips.filter(t => 
            t.vehicleId === vehicle.id && 
            t.date && t.date >= startStr && t.date <= endStr
        );

        const vehicleEntries = fuelEntries.filter(e => 
            e.vehicleId === vehicle.id && 
            e.date >= startStr && e.date <= endStr
        );

        const vehicleAdjustments = adjustments.filter(a => 
            a.vehicleId === vehicle.id && 
            a.date >= startStr && a.date <= endStr
        );

        // 2. Calculate Gas Card Charges (Actual Spend)
        // Updated: Now includes 'Reimbursement' as Company Cost (Phase 1 Fuel Logic)
        const totalGasCardCost = vehicleEntries
            .filter(e => e.type === 'Card_Transaction' || e.type === 'Reimbursement')
            .reduce((sum, e) => sum + e.amount, 0);

        // Determine average fuel price for this week (weighted average)
        const totalLiters = vehicleEntries.reduce((sum, e) => sum + (e.liters || 0), 0);
        const totalCost = vehicleEntries.reduce((sum, e) => sum + e.amount, 0);
        const avgPrice = totalLiters > 0 ? (totalCost / totalLiters) : DEFAULT_FUEL_PRICE;

        // 3. Calculate Ride Share (Operating Fuel - The "Should Be" Cost)
        // STRICT ISOLATION: This must only include Trips (Business Rides).
        // No manual adjustments or misc distances should be added here.
        const totalTripDistance = vehicleTrips.reduce((sum, t) => sum + (t.distance || 0), 0);
        
        // Calculate Cost strictly: Distance * Efficiency * Price
        const rideShareCost = this.calculateOperatingCost(totalTripDistance, vehicle, avgPrice);

        // 4. Adjustments (Company Usage & Personal)
        // Phase 3: STRICT ISOLATION for Company Usage
        // Must strictly filter for 'Company_Misc' type only.
        // Represents authorized non-trip business operations (e.g., getting maintenance, office errands).
        const companyMiscAdj = vehicleAdjustments.filter(a => a.type === 'Company_Misc');
        const personalAdj = vehicleAdjustments.filter(a => a.type === 'Personal');

        const companyMiscDistance = companyMiscAdj.reduce((sum, a) => sum + a.distance, 0);
        
        // Phase 2: Residual Personal KM Calculation
        // Priority 1: Use Weekly Check-Ins (Start/End of Week)
        // Priority 2: Use Fuel Logs (Phase 1 Logic)
        
        let derivedTotalDistance = 0;
        let calculatedPersonalDistance = 0;
        let method = 'Manual';

        // Filter check-ins for this vehicle
        const vehicleCheckIns = checkIns
            .filter(c => c.vehicleId === vehicle.id)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        // We need a check-in roughly at weekStart and weekEnd
        // weekStart is usually Monday 00:00. weekEnd is Sunday 23:59.
        // We look for check-ins within a reasonable window (e.g. +/- 3 days of the boundary)
        const findClosestCheckIn = (targetDate: Date) => {
            const targetTime = targetDate.getTime();
            return vehicleCheckIns.find(c => {
                const checkTime = new Date(c.timestamp).getTime();
                const diffDays = Math.abs(checkTime - targetTime) / (1000 * 60 * 60 * 24);
                return diffDays <= 3; // within 3 days
            });
        };

        const startCheckIn = findClosestCheckIn(weekStart);
        // For end of week, we ideally want the check-in of the *next* Monday
        const nextMonday = new Date(weekEnd);
        nextMonday.setDate(nextMonday.getDate() + 1);
        const endCheckIn = findClosestCheckIn(nextMonday);

        if (startCheckIn && endCheckIn && endCheckIn.odometer > startCheckIn.odometer) {
             derivedTotalDistance = endCheckIn.odometer - startCheckIn.odometer;
             method = 'CheckIn';
        } else {
            // Fallback: Fuel Logs (Phase 1)
            const odometers = vehicleEntries
                .map(e => e.odometer)
                .filter(o => o !== undefined && o > 0)
                .sort((a, b) => a - b);
            
            if (odometers.length >= 2) {
                const minOdo = odometers[0];
                const maxOdo = odometers[odometers.length - 1];
                derivedTotalDistance = maxOdo - minOdo;
                method = 'FuelLog';
            }
        }
        
        if (derivedTotalDistance > 0) {
             // Formula: Personal = Total - (Business Trips + Authorized Misc)
            const businessTotal = totalTripDistance + companyMiscDistance;
            
            // Only apply residual if valid (positive)
            if (derivedTotalDistance > businessTotal) {
                calculatedPersonalDistance = derivedTotalDistance - businessTotal;
            }
        }
        
        // Phase 4: Driver Personal Fuel Usage Isolation
        // This bucket strictly represents fuel used for personal trips.
        // It combines explicitly logged 'Personal' adjustments + calculated residual distance.
        const personalDistance = calculatedPersonalDistance > 0 
            ? calculatedPersonalDistance 
            : personalAdj.reduce((sum, a) => sum + a.distance, 0);

        // Phase 3: Calculate Company Usage Cost
        // This is 100% Company Liability by definition.
        const companyUsageCost = this.calculateOperatingCost(companyMiscDistance, vehicle, avgPrice);
        
        const personalUsageCost = this.calculateOperatingCost(personalDistance, vehicle, avgPrice);

        // Phase 4: Miscellaneous (Leakage) Isolation
        // Formula: Actual Spend - (Ride Share + Company Usage + Personal)
        // This math ensures that the 4 buckets sum up exactly to the Total Gas Card Cost (ignoring rounding differences).
        // If positive, it's unexplained usage (leakage/theft/idling).
        // If negative, it means they are hyper-efficient or we missed fuel logs (savings).
        const miscellaneousCost = totalGasCardCost - (rideShareCost + companyUsageCost + personalUsageCost);

        // 6. The Split (Phase 5)
        let companyShare = 0;
        let driverShare = 0;

        let scenario = scenarios.find(s => s.id === vehicle.fuelScenarioId);
        
        // Phase 10: Fallback to System Default Scenario if no specific assignment
        if (!scenario) {
            scenario = scenarios.find(s => s.isDefault);
        }

        const fuelRule = scenario?.rules.find(r => r.category === 'Fuel');

        if (fuelRule) {
             // Phase 5: Applied Scenario Logic
             
             if (fuelRule.coverageType === 'Full') {
                 // Full Coverage: Company pays for (Ride Share + Company Usage + Misc)
                 // Personal is always Driver liability.
                 
                 // Note: If misc is negative (savings), adding it reduces the company share, which is correct.
                 companyShare = rideShareCost + companyUsageCost + miscellaneousCost;
             } 
             else if (fuelRule.coverageType === 'Percentage') {
                 // Percentage Split with Granular Control (Phase 10)
                 
                 // 1. Resolve Percentages (Use Granular if present, else fall back to Legacy/Defaults)
                 // Legacy behavior: 'coverageValue' applied to Ride Share & Misc. Company Ops was 100%. Personal was 0%.
                 
                 const rideSharePct = (fuelRule.rideShareCoverage ?? fuelRule.coverageValue ?? 100) / 100;
                 const companyOpsPct = (fuelRule.companyUsageCoverage ?? 100) / 100;
                 const personalPct = (fuelRule.personalCoverage ?? 0) / 100;
                 const miscPct = (fuelRule.miscCoverage ?? fuelRule.coverageValue ?? 50) / 100; // Default 50% if totally missing
                 
                 // 2. Calculate Components
                 const coveredRideShare = rideShareCost * rideSharePct;
                 const coveredCompanyOps = companyUsageCost * companyOpsPct;
                 const coveredPersonal = personalUsageCost * personalPct;
                 const coveredMisc = miscellaneousCost * miscPct;
                 
                 // 3. Sum Company Share
                 companyShare = coveredRideShare + coveredCompanyOps + coveredPersonal + coveredMisc;
             }
             else if (fuelRule.coverageType === 'Fixed_Amount') {
                 // Fixed Allowance
                 // Company pays 100% of Company Usage
                 // Company pays up to $Allowance for (Ride Share + Misc)
                 
                 const allowance = fuelRule.coverageValue || 0;
                 
                 // Combine variable business costs
                 const variableBusinessCost = rideShareCost + miscellaneousCost;
                 
                 // Apply cap
                 // If variable cost is negative (huge savings), we limit company share to just Company Usage + Negative?
                 // Let's assume allowance is positive cap on positive costs.
                 const coveredVariable = Math.min(allowance, variableBusinessCost);
                 
                 companyShare = companyUsageCost + coveredVariable;
             }
             
             // Driver pays the remainder
             driverShare = totalGasCardCost - companyShare;
             
             // Safety: If Total Spend is 0, shares are 0
             if (totalGasCardCost === 0) {
                 companyShare = 0;
                 driverShare = 0;
             }
        } else {
            // Default Legacy Logic (No Scenario Assigned)
            // Ride Share: 100% Company
            // Company Usage: 100% Company
            // Personal: 100% Driver
            // Misc: 50% / 50%
            
            const miscSplit = miscellaneousCost * 0.5;
            
            companyShare = rideShareCost + companyUsageCost + miscSplit;
            driverShare = totalGasCardCost - companyShare;
        }

        return {
            id: `${vehicle.id}_${startStr.split('T')[0]}_${endStr.split('T')[0]}`,
            weekStart: startStr,
            weekEnd: endStr,
            vehicleId: vehicle.id,
            driverId: vehicle.currentDriverId || 'unassigned',
            
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
            
            status: 'Draft'
        };
    },

    /**
     * Batch generator for multiple vehicles
     */
    generateFleetReport(
        vehicles: Vehicle[],
        weekStart: Date,
        weekEnd: Date,
        trips: Trip[],
        fuelEntries: FuelEntry[],
        adjustments: MileageAdjustment[] = [],
        checkIns: WeeklyCheckIn[] = [],
        scenarios: FuelScenario[] = []
    ): WeeklyFuelReport[] {
        return vehicles.map(v => 
            this.calculateReconciliation(v, weekStart, weekEnd, trips, fuelEntries, adjustments, checkIns, scenarios)
        );
    }
};
