import { FuelEntry, FuelCycle } from '../types/fuel';
import { Vehicle } from '../types/vehicle';

/**
 * Transforms a flat list of fuel entries into grouped fuel cycles.
 * Logic: A cycle begins after a "Full Tank" event and ends at the next "Full Tank" event.
 * Enhanced: Implements "Threshold Cap & Reset" where cycles are capped at 100% capacity.
 */
export function calculateFuelCycles(entries: FuelEntry[], vehicles: Vehicle[] = []): FuelCycle[] {
    if (!entries || entries.length === 0) return [];

    const vehicleMap = new Map<string, Vehicle>();
    vehicles.forEach(v => vehicleMap.set(v.id, v));

    // 1. Group by vehicle
    const vehicleGroups = new Map<string, FuelEntry[]>();
    entries.forEach(entry => {
        if (!entry.vehicleId) return;
        if (!vehicleGroups.has(entry.vehicleId)) {
            vehicleGroups.set(entry.vehicleId, []);
        }
        vehicleGroups.get(entry.vehicleId)!.push(entry);
    });

    const allCycles: FuelCycle[] = [];

    // 2. Process each vehicle group
    vehicleGroups.forEach((vehicleEntries, vehicleId) => {
        const vehicle = vehicleMap.get(vehicleId);
        const tankCapacity = Number(vehicle?.specifications?.tankCapacity) || vehicle?.fuelSettings?.tankCapacity || 40;
        
        // Sort entries by date/time and then odometer
        const sorted = [...vehicleEntries].sort((a, b) => {
            const dateStrA = a.date.includes('-') ? a.date : a.date.replace(/\//g, '-');
            const dateStrB = b.date.includes('-') ? b.date : b.date.replace(/\//g, '-');
            const fullDateA = a.time ? `${dateStrA} ${a.time}` : dateStrA;
            const fullDateB = b.time ? `${dateStrB} ${b.time}` : dateStrB;
            const dateA = new Date(fullDateA).getTime();
            const dateB = new Date(fullDateB).getTime();
            if (!isNaN(dateA) && !isNaN(dateB)) {
                if (dateA !== dateB) return dateA - dateB;
            }
            return (a.odometer || 0) - (b.odometer || 0);
        });

        let currentCycleEntries: FuelEntry[] = [];
        let lastAnchorOdometer: number | undefined = undefined;
        let lastAnchorDate: string | undefined = undefined;
        
        let carryoverVolume = 0;
        let startingPercentage = 0;

        sorted.forEach((entry, index) => {
            const entryVolume = entry.liters || 0;
            // Volume already in the tank + this entry
            const currentTotalVolume = currentCycleEntries.reduce((sum, e) => sum + (e.volumeContributed || 0), 0) + carryoverVolume;
            
            // Determine if this entry causes a "Full Tank" or "Capped" event
            // We removed the automatic "Reimbursement" anchor to prevent over-splitting
            const isExplicitFullTank = entry.metadata?.isFullTank || entry.metadata?.isAnchor;
            const wouldExceedCapacity = (currentTotalVolume + entryVolume) >= tankCapacity;
            
            const isCycleEnd = isExplicitFullTank || wouldExceedCapacity;

            if (isCycleEnd) {
                // If we have a previous anchor, we can close a cycle
                if (lastAnchorOdometer !== undefined) {
                    const distance = (entry.odometer || 0) - lastAnchorOdometer;
                    
                    if (distance > 0) {
                        // Calculate contribution
                        let volumeContributed = entryVolume;
                        let excessVolume = 0;
                        let isCapped = false;

                        if (wouldExceedCapacity) {
                            volumeContributed = Math.max(0, tankCapacity - currentTotalVolume);
                            excessVolume = entryVolume - volumeContributed;
                            isCapped = true;
                        }

                        // Prepare entries for the cycle
                        // The current entry is included with its "volumeContributed"
                        const cycleTransactions = [...currentCycleEntries, { 
                            ...entry, 
                            volumeContributed,
                            carryoverVolume: excessVolume > 0 ? excessVolume : undefined
                        }];

                        const totalLiters = cycleTransactions.reduce((sum, e) => sum + (e.volumeContributed || 0), 0) + carryoverVolume;
                        const totalCost = cycleTransactions.reduce((sum, e) => {
                            // Calculate proportional cost for the split entry
                            if (e.id === entry.id && entry.liters && entry.liters > 0) {
                                return sum + ((e.amount || 0) * (volumeContributed / entry.liters));
                            }
                            return sum + (e.amount || 0);
                        }, 0);

                        const status = entry.metadata?.integrityStatus === 'critical' ? 'Anomaly' : 'Complete';
                        const resetType = isCapped ? 'Auto_Soft' : 
                                        entry.metadata?.integrityStatus === 'critical' ? 'Auto_Anomaly' : 'Manual';

                        allCycles.push({
                            id: `cycle_${entry.id}_${index}`,
                            vehicleId,
                            startDate: lastAnchorDate || entry.date,
                            endDate: entry.date,
                            totalLiters,
                            totalCost,
                            avgPricePerLiter: totalLiters > 0 ? totalCost / totalLiters : 0,
                            transactions: cycleTransactions,
                            status,
                            distance,
                            efficiency: totalLiters > 0 ? distance / totalLiters : 0,
                            resetType,
                            startOdometer: lastAnchorOdometer,
                            endOdometer: entry.odometer || 0,
                            startingPercentage,
                            isCapped,
                            excessVolume: excessVolume > 0 ? excessVolume : undefined
                        });

                        // Prepare carryover for NEXT cycle
                        carryoverVolume = excessVolume;
                        startingPercentage = (carryoverVolume / tankCapacity) * 100;
                        
                        // New cycle starting data
                        currentCycleEntries = [];
                        // If there was excess, we create a "virtual" entry for the next cycle
                        if (excessVolume > 0) {
                            currentCycleEntries.push({
                                ...entry,
                                volumeContributed: excessVolume,
                                isCarryover: true
                            });
                        }
                    } else {
                        // Distance is 0, might be a double entry or same-day fill
                        // Just accumulate
                        currentCycleEntries.push({ ...entry, volumeContributed: entryVolume });
                    }
                } else {
                    // First anchor
                    lastAnchorOdometer = entry.odometer || 0;
                    lastAnchorDate = entry.date;
                    currentCycleEntries = [];
                    carryoverVolume = 0;
                    startingPercentage = 0;
                }
                
                // Update anchor points
                lastAnchorOdometer = entry.odometer || 0;
                lastAnchorDate = entry.date;
            } else {
                // Not a cycle end, just add to current cycle
                currentCycleEntries.push({ ...entry, volumeContributed: entryVolume });
            }
        });

        // 3. Handle Active Cycle (In-progress)
        if (currentCycleEntries.length > 0 && lastAnchorOdometer !== undefined) {
            const totalLiters = currentCycleEntries.reduce((sum, e) => sum + (e.volumeContributed || 0), 0) + carryoverVolume;
            const totalCost = currentCycleEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
            const latestOdo = Math.max(...currentCycleEntries.map(e => e.odometer || 0), lastAnchorOdometer);
            const distance = latestOdo - lastAnchorOdometer;

            allCycles.push({
                id: `active_${vehicleId}`,
                vehicleId,
                startDate: lastAnchorDate || (currentCycleEntries.length > 0 ? currentCycleEntries[0].date : lastAnchorDate || ''),
                endDate: currentCycleEntries.length > 0 ? currentCycleEntries[currentCycleEntries.length - 1].date : lastAnchorDate || '',
                totalLiters,
                totalCost,
                avgPricePerLiter: totalLiters > 0 ? totalCost / totalLiters : 0,
                transactions: [...currentCycleEntries],
                status: 'Active',
                distance,
                efficiency: (totalLiters > 0 && distance > 0) ? distance / totalLiters : 0,
                resetType: 'Manual',
                startOdometer: lastAnchorOdometer,
                endOdometer: latestOdo,
                startingPercentage
            });
        }
    });

    // Return all cycles sorted by end date descending
    return allCycles.sort((a, b) => {
        const dateA = new Date(a.endDate).getTime();
        const dateB = new Date(b.endDate).getTime();
        if (dateA !== dateB) return dateB - dateA;
        return 0;
    });
}