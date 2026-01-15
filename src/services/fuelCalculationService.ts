import { Vehicle } from '../types/vehicle';
import { Trip } from '../types/data';
import { FuelEntry, FuelCard, WeeklyFuelReport, MileageAdjustment } from '../types/fuel';
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
        checkIns: WeeklyCheckIn[] = []
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

        // 3. Calculate Operating Fuel (The "Should Be" Cost)
        const totalTripDistance = vehicleTrips.reduce((sum, t) => sum + (t.distance || 0), 0);
        const operatingFuelCost = this.calculateOperatingCost(totalTripDistance, vehicle, avgPrice);

        // 4. Adjustments (Misc & Personal)
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
        
        // Use calculated residual if we found a valid range, otherwise fallback to manual adjustments
        const personalDistance = calculatedPersonalDistance > 0 
            ? calculatedPersonalDistance 
            : personalAdj.reduce((sum, a) => sum + a.distance, 0);

        const companyMiscCost = this.calculateOperatingCost(companyMiscDistance, vehicle, avgPrice);
        const personalCost = this.calculateOperatingCost(personalDistance, vehicle, avgPrice);

        // 5. The Leakage (Fuel Misc)
        // Formula: Actual Spend - (Operating + CompanyMisc + Personal)
        // If positive, it's unexplained usage (leakage/theft/idling).
        // If negative, it means they are hyper-efficient or we missed fuel logs.
        const fuelMiscCost = totalGasCardCost - (operatingFuelCost + companyMiscCost + personalCost);

        // 6. The Split
        // 50/50 rule on the Leakage
        // Driver Pays: Personal Cost + 50% of Fuel Misc (if positive)
        // Company Pays: Operating + Company Misc + 50% of Fuel Misc
        
        // Note: If Fuel Misc is negative (savings), who gets it? 
        // Typically strict logic: Driver pays 0 on negative misc.
        const miscSplit = fuelMiscCost > 0 ? (fuelMiscCost / 2) : 0;
        
        const driverShare = personalCost + miscSplit;
        const companyShare = operatingFuelCost + companyMiscCost + (fuelMiscCost > 0 ? miscSplit : fuelMiscCost);

        return {
            id: `${vehicle.id}_${startStr.split('T')[0]}_${endStr.split('T')[0]}`,
            weekStart: startStr,
            weekEnd: endStr,
            vehicleId: vehicle.id,
            driverId: vehicle.currentDriverId || 'unassigned',
            
            totalGasCardCost,
            
            totalTripDistance,
            operatingFuelCost,
            
            companyMiscDistance,
            companyMiscCost,
            
            personalDistance,
            personalCost,
            
            fuelMiscCost,
            
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
        checkIns: WeeklyCheckIn[] = []
    ): WeeklyFuelReport[] {
        return vehicles.map(v => 
            this.calculateReconciliation(v, weekStart, weekEnd, trips, fuelEntries, adjustments, checkIns)
        );
    }
};
