import { Vehicle } from '../types/vehicle';
import { Trip } from '../types/data';
import { FuelEntry, FuelCard, WeeklyFuelReport, MileageAdjustment } from '../types/fuel';

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
        adjustments: MileageAdjustment[] = []
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
        // We only count 'Card_Transaction' or 'Reimbursement' as cost to company?
        // Usually, 'Card_Transaction' is the main one. 
        const totalGasCardCost = vehicleEntries
            .filter(e => e.type === 'Card_Transaction')
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
        const personalDistance = personalAdj.reduce((sum, a) => sum + a.distance, 0);

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
        adjustments: MileageAdjustment[] = []
    ): WeeklyFuelReport[] {
        return vehicles.map(v => 
            this.calculateReconciliation(v, weekStart, weekEnd, trips, fuelEntries, adjustments)
        );
    }
};
