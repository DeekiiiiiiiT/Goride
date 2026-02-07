import { FuelEntry, FuelCycle } from '../types/fuel';

/**
 * Transforms a flat list of fuel entries into grouped fuel cycles.
 * Logic: A cycle begins after a "Full Tank" event and ends at the next "Full Tank" event.
 */
export function calculateFuelCycles(entries: FuelEntry[]): FuelCycle[] {
    if (!entries || entries.length === 0) return [];

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
        // Sort entries by date/time and then odometer
        const sorted = [...vehicleEntries].sort((a, b) => {
            // Robust date parsing: avoid "T" separator with M/D/YYYY dates which causes Invalid Date
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

        sorted.forEach((entry, index) => {
            // A "Full Tank" event is either a metadata flag or a Reimbursement type (which are anchors)
            const isFullTank = 
                entry.metadata?.isFullTank || 
                entry.metadata?.isAnchor || 
                entry.metadata?.isSoftAnchor ||
                entry.type === 'Reimbursement';
            
            // Add entry to current working set
            currentCycleEntries.push(entry);

            if (isFullTank) {
                // If we have a previous anchor, we can close a cycle
                if (lastAnchorOdometer !== undefined) {
                    const distance = (entry.odometer || 0) - lastAnchorOdometer;
                    
                    // Liters consumed to cover this distance are all receipts AFTER the last anchor up to this one
                    // In our current list, it's everything in currentCycleEntries except the one that started it?
                    // Wait, if we use the "Full to Full" method:
                    // We start the distance at Anchor A. We end at Anchor B.
                    // The liters at Anchor B (plus any intermediate ones) are the ones that filled the tank back up.
                    
                    // However, if the very first entry is an anchor, we don't have a distance yet.
                    
                    if (distance > 0) {
                        const totalLiters = currentCycleEntries.reduce((sum, e) => sum + (e.liters || 0), 0);
                        const totalCost = currentCycleEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
                        
                        const status = entry.metadata?.integrityStatus === 'critical' ? 'Anomaly' : 'Complete';
                        const resetType = entry.metadata?.isSoftAnchor ? 'Auto_Soft' : 
                                        entry.metadata?.integrityStatus === 'critical' ? 'Auto_Anomaly' : 'Manual';

                        allCycles.push({
                            id: `cycle_${entry.id}`,
                            vehicleId,
                            startDate: lastAnchorDate || entry.date,
                            endDate: entry.date,
                            totalLiters,
                            totalCost,
                            avgPricePerLiter: totalLiters > 0 ? totalCost / totalLiters : 0,
                            transactions: [...currentCycleEntries],
                            status,
                            distance,
                            efficiency: totalLiters > 0 ? distance / totalLiters : 0,
                            resetType,
                            startOdometer: lastAnchorOdometer,
                            endOdometer: entry.odometer || 0
                        });
                    }
                }

                // Reset for next cycle
                // Note: The closing anchor of the PREVIOUS cycle is NOT included in the liters of the NEXT cycle
                // It just sets the starting odometer for the next distance measurement.
                currentCycleEntries = [];
                lastAnchorOdometer = entry.odometer || 0;
                lastAnchorDate = entry.date;
            }
        });

        // 3. Handle Active Cycle (In-progress)
        if (currentCycleEntries.length > 0 && lastAnchorOdometer !== undefined) {
            const totalLiters = currentCycleEntries.reduce((sum, e) => sum + (e.liters || 0), 0);
            const totalCost = currentCycleEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
            const latestOdo = Math.max(...currentCycleEntries.map(e => e.odometer || 0), lastAnchorOdometer);
            const distance = latestOdo - lastAnchorOdometer;

            allCycles.push({
                id: `active_${vehicleId}`,
                vehicleId,
                startDate: lastAnchorDate || currentCycleEntries[0].date,
                endDate: currentCycleEntries[currentCycleEntries.length - 1].date,
                totalLiters,
                totalCost,
                avgPricePerLiter: totalLiters > 0 ? totalCost / totalLiters : 0,
                transactions: [...currentCycleEntries],
                status: 'Active',
                distance,
                efficiency: (totalLiters > 0 && distance > 0) ? distance / totalLiters : 0,
                resetType: 'Manual', // Placeholder
                startOdometer: lastAnchorOdometer,
                endOdometer: latestOdo
            });
        }
    });

    // Return all cycles sorted by end date descending
    return allCycles.sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime());
}
