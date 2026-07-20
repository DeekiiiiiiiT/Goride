import { FuelEntry, FuelCycle } from '../types/fuel';
import { Vehicle } from '../types/vehicle';
import { classifyAnchor, isStableCycleId, resolveTankCapacity } from './fuelAnchorLogic';

/**
 * Groups fuel entries into tank cycles.
 * Prefers persisted server metadata (isFullTank / isSoftAnchor / volumeContributed).
 * Falls back to local classifyAnchor (98%) only when metadata is missing (legacy rows).
 * See docs/fuel-brain-spine.md.
 */
export function calculateFuelCycles(entries: FuelEntry[], vehicles: Vehicle[] = []): FuelCycle[] {
    if (!entries || entries.length === 0) return [];

    const vehicleMap = new Map<string, Vehicle>();
    vehicles.forEach(v => vehicleMap.set(v.id, v));

    const vehicleGroups = new Map<string, FuelEntry[]>();
    entries.forEach(entry => {
        if (!entry.vehicleId) return;
        if (!vehicleGroups.has(entry.vehicleId)) {
            vehicleGroups.set(entry.vehicleId, []);
        }
        vehicleGroups.get(entry.vehicleId)!.push(entry);
    });

    const allCycles: FuelCycle[] = [];

    vehicleGroups.forEach((vehicleEntries, vehicleId) => {
        const vehicle = vehicleMap.get(vehicleId);
        // UI-only fallback 40 when capacity unknown
        const tankCapacity = resolveTankCapacity(vehicle) || 40;

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
            const currentTotalVolume =
                currentCycleEntries.reduce((sum, e) => sum + (e.volumeContributed || 0), 0) + carryoverVolume;

            const meta = entry.metadata || {};
            const hasPersistedAnchor =
                meta.isFullTank === true ||
                meta.isSoftAnchor === true ||
                meta.isHardAnchor === true ||
                (meta.isAnchor === true && meta.isSoftAnchor !== true);

            let isHard = false;
            let isSoft = false;
            let volumeContributed = entryVolume;
            let excessVolume = 0;
            let isCapped = false;

            if (hasPersistedAnchor) {
                isHard =
                    meta.isFullTank === true ||
                    meta.isHardAnchor === true ||
                    (meta.isAnchor === true && meta.isSoftAnchor !== true);
                isSoft = meta.isSoftAnchor === true && !isHard;

                if (typeof meta.volumeContributed === 'number' && meta.volumeContributed >= 0) {
                    volumeContributed = meta.volumeContributed;
                    excessVolume = Number(meta.excessVolume) || Math.max(0, entryVolume - volumeContributed);
                    isCapped = isSoft || excessVolume > 0;
                } else if (isSoft) {
                    const local = classifyAnchor({
                        isFullTank: meta.isFullTank === true,
                        isAnchor: meta.isAnchor === true,
                        isHardAnchor: meta.isHardAnchor === true,
                        isSoftAnchor: true,
                        prevCumulative: currentTotalVolume,
                        volume: entryVolume,
                        tankCapacity,
                    });
                    volumeContributed = local.volumeContributed;
                    excessVolume = local.excessVolume;
                    isCapped = true;
                }
            } else {
                // Legacy rows: derive from 98% classifyAnchor
                const local = classifyAnchor({
                    isFullTank: meta.isFullTank === true,
                    isAnchor: meta.isAnchor === true,
                    isHardAnchor: meta.isHardAnchor === true,
                    isSoftAnchor: meta.isSoftAnchor === true,
                    prevCumulative: currentTotalVolume,
                    volume: entryVolume,
                    tankCapacity,
                });
                isHard = local.isHard;
                isSoft = local.isSoft;
                volumeContributed = local.volumeContributed;
                excessVolume = local.excessVolume;
                isCapped = local.isSoft;
            }

            const isCycleEnd = isHard || isSoft;

            if (isCycleEnd) {
                if (lastAnchorOdometer !== undefined) {
                    const distance = (entry.odometer || 0) - lastAnchorOdometer;

                    if (distance > 0) {
                        const cycleTransactions = [
                            ...currentCycleEntries,
                            {
                                ...entry,
                                volumeContributed,
                                carryoverVolume: excessVolume > 0 ? excessVolume : undefined,
                            },
                        ];

                        const totalLiters =
                            cycleTransactions.reduce((sum, e) => sum + (e.volumeContributed || 0), 0) +
                            carryoverVolume;
                        const totalCost = cycleTransactions.reduce((sum, e) => {
                            if (e.id === entry.id && entry.liters && entry.liters > 0) {
                                return sum + ((e.amount || 0) * (volumeContributed / entry.liters));
                            }
                            return sum + (e.amount || 0);
                        }, 0);

                        const status = entry.metadata?.integrityStatus === 'critical' ? 'Anomaly' : 'Complete';
                        const resetType: FuelCycle['resetType'] = isCapped
                            ? 'Auto_Soft'
                            : entry.metadata?.integrityStatus === 'critical'
                              ? 'Auto_Anomaly'
                              : 'Manual';
                        const trustTier: FuelCycle['trustTier'] =
                            status === 'Anomaly' ? undefined : isHard && meta.isFullTank ? 'Manual' : isSoft || isCapped ? 'Soft' : 'Manual';

                        const persistedCycleId = isStableCycleId(meta.cycleId)
                            ? (meta.cycleId as string)
                            : cycleTransactions.map((t) => t.metadata?.cycleId).find((id) => isStableCycleId(id));
                        const cycleId = persistedCycleId || `cycle_${entry.id}_${index}`;

                        allCycles.push({
                            id: cycleId,
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
                            trustTier,
                            startOdometer: lastAnchorOdometer,
                            endOdometer: entry.odometer || 0,
                            startingPercentage,
                            isCapped,
                            excessVolume: excessVolume > 0 ? excessVolume : undefined,
                        });

                        carryoverVolume = excessVolume;
                        startingPercentage = tankCapacity > 0 ? (carryoverVolume / tankCapacity) * 100 : 0;

                        currentCycleEntries = [];
                        if (excessVolume > 0) {
                            currentCycleEntries.push({
                                ...entry,
                                volumeContributed: excessVolume,
                                isCarryover: true,
                            });
                        }
                    } else {
                        currentCycleEntries.push({ ...entry, volumeContributed: entryVolume });
                    }
                } else {
                    lastAnchorOdometer = entry.odometer || 0;
                    lastAnchorDate = entry.date;
                    currentCycleEntries = [];
                    carryoverVolume = 0;
                    startingPercentage = 0;
                }

                lastAnchorOdometer = entry.odometer || 0;
                lastAnchorDate = entry.date;
            } else {
                const contrib =
                    typeof meta.volumeContributed === 'number' ? meta.volumeContributed : entryVolume;
                currentCycleEntries.push({ ...entry, volumeContributed: contrib });
            }
        });

        if (currentCycleEntries.length > 0 && lastAnchorOdometer !== undefined) {
            const totalLiters =
                currentCycleEntries.reduce((sum, e) => sum + (e.volumeContributed || 0), 0) + carryoverVolume;
            const totalCost = currentCycleEntries.reduce((sum, e) => sum + (e.amount || 0), 0);
            const latestOdo = Math.max(...currentCycleEntries.map((e) => e.odometer || 0), lastAnchorOdometer);
            const distance = latestOdo - lastAnchorOdometer;

            allCycles.push({
                id: `active_${vehicleId}`,
                vehicleId,
                startDate: lastAnchorDate || (currentCycleEntries[0]?.date ?? ''),
                endDate:
                    currentCycleEntries[currentCycleEntries.length - 1]?.date ??
                    lastAnchorDate ??
                    '',
                totalLiters,
                totalCost,
                avgPricePerLiter: totalLiters > 0 ? totalCost / totalLiters : 0,
                transactions: [...currentCycleEntries],
                status: 'Active',
                distance,
                efficiency: totalLiters > 0 && distance > 0 ? distance / totalLiters : 0,
                resetType: 'Manual',
                startOdometer: lastAnchorOdometer,
                endOdometer: latestOdo,
                startingPercentage,
            });
        }
    });

    return allCycles.sort((a, b) => {
        const dateA = new Date(a.endDate).getTime();
        const dateB = new Date(b.endDate).getTime();
        if (dateA !== dateB) return dateB - dateA;
        return 0;
    });
}
