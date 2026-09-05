import { FuelEntry, FuelCycle } from '../types/fuel';
import { Vehicle } from '../types/vehicle';
import { classifyAnchor, isStableCycleId, resolveTankCapacity } from './fuelAnchorLogic';
import {
    evaluateCycleClose,
    resolveCycleCloseMode,
    type CycleCloseMode,
} from './fuelCycleClosePolicy';
import { isJaaStatementLedgerRow } from './jaaFuelStatementMatcher';

/**
 * Groups fuel entries into tank cycles.
 * Prefers persisted server metadata (isCapacityClose / isSoftAnchor / volumeContributed).
 * Capacity close = full-tank cycle with spillover. Driver Full Tank is ignored.
 * Falls back to local classifyAnchor (98%) only when metadata is missing (legacy rows).
 * Card statement ledger rows (jaa_raw fees/declines/statement fills) never participate —
 * they have no trustworthy odometer and must not reset anchors to 0.
 * See docs/fuel-brain-spine.md.
 */
export function calculateFuelCycles(entries: FuelEntry[], vehicles: Vehicle[] = []): FuelCycle[] {
    if (!entries || entries.length === 0) return [];

    const vehicleMap = new Map<string, Vehicle>();
    vehicles.forEach(v => vehicleMap.set(v.id, v));

    const vehicleGroups = new Map<string, FuelEntry[]>();
    entries.forEach(entry => {
        if (!entry.vehicleId) return;
        // Statement ledger belongs on Card Inventory — never Full Tanks cycle math
        if (isJaaStatementLedgerRow(entry)) return;
        if (!vehicleGroups.has(entry.vehicleId)) {
            vehicleGroups.set(entry.vehicleId, []);
        }
        vehicleGroups.get(entry.vehicleId)!.push(entry);
    });

    const allCycles: FuelCycle[] = [];

    vehicleGroups.forEach((vehicleEntries, vehicleId) => {
        const vehicle = vehicleMap.get(vehicleId);
        // Prefer real tank capacity. Do NOT invent 40 L — but still process vehicles
        // that already have server capacity-close stamps (volumeContributed / isSoftAnchor).
        const tankCapacity = resolveTankCapacity(vehicle);
        const hasPersistedClose = vehicleEntries.some((e) => {
            const m = e.metadata || {};
            return (
                m.isCapacityClose === true ||
                m.isSoftAnchor === true ||
                m.isHardAnchor === true ||
                m.isFullTank === true ||
                (typeof m.volumeContributed === 'number' && m.volumeContributed > 0)
            );
        });
        // Without capacity AND without stamps there is no defensible close math.
        if (!(tankCapacity > 0) && !hasPersistedClose) return;

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
        // Marks the first cycle emitted after a fresh chain origin so callers can
        // tell that its opening spillover was preserved (not a mid-chain close).
        let pendingChainOrigin = false;

        // Legacy rows honor an explicit per-vehicle close mode; otherwise the engine
        // keeps its historical 98% cumulative spine (docs/fuel-brain-spine.md).
        const explicitCloseMode = (vehicle as { fuelSettings?: { cycleCloseMode?: string } } | undefined)
            ?.fuelSettings?.cycleCloseMode;
        const legacyCloseMode: CycleCloseMode = explicitCloseMode
            ? resolveCycleCloseMode(vehicle as { fuelSettings?: { cycleCloseMode?: string } })
            : 'cumulative_98';

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

                if (typeof meta.volumeContributed === 'number' && meta.volumeContributed > 0) {
                    volumeContributed = meta.volumeContributed;
                    excessVolume = Number(meta.excessVolume) || Math.max(0, entryVolume - volumeContributed);
                    isCapped = isSoft || excessVolume > 0;
                } else if (typeof meta.volumeContributed === 'number' && meta.volumeContributed === 0 && entryVolume > 0) {
                    // Stale zero stamp after CSV match — use real liters
                    volumeContributed = entryVolume;
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
                // Legacy rows need a real tank capacity to decide closes.
                if (!(tankCapacity > 0)) {
                    currentCycleEntries.push({ ...entry, volumeContributed: entryVolume });
                    return;
                }
                // Legacy rows (no server metadata): decide the close via the shared
                // cycle-close policy instead of a hard-wired 98% classifyAnchor.
                const decision = evaluateCycleClose({
                    closeMode: legacyCloseMode,
                    prevCumulative: currentTotalVolume,
                    volume: entryVolume,
                    tankCapacity,
                    paymentSource: entry.paymentSource,
                    entryMode: entry.entryMode,
                });
                isHard = false;
                isSoft = decision.shouldClose;
                volumeContributed = decision.volumeContributed;
                excessVolume = decision.excessVolume;
                isCapped = decision.isSoft;
            }

            const isCycleEnd = isHard || isSoft;
            const entryOdo = Number(entry.odometer);
            const hasValidOdo = Number.isFinite(entryOdo) && entryOdo > 0;

            if (isCycleEnd) {
                if (lastAnchorOdometer !== undefined) {
                    const distance = hasValidOdo ? entryOdo - lastAnchorOdometer : 0;

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

                        const status =
                            entry.metadata?.signalTier === 'exception' ||
                            (!entry.metadata?.signalTier &&
                                entry.metadata?.integrityStatus === 'critical' &&
                                !entry.metadata?.jaaMatchedStatementId &&
                                !entry.metadata?.jaaMatchedDriverEntryId)
                              ? 'Anomaly'
                              : 'Complete';
                        const cycleSignalTier =
                            entry.metadata?.signalTier === 'exception'
                              ? 'exception'
                              : entry.metadata?.signalTier === 'review'
                                ? 'review'
                                : status === 'Anomaly'
                                  ? 'exception'
                                  : 'observe';
                        const resetType: FuelCycle['resetType'] = isCapped || isSoft || meta.isCapacityClose
                            ? 'Auto_Soft'
                            : entry.metadata?.integrityStatus === 'critical'
                              ? 'Auto_Anomaly'
                              : 'Manual';
                        // Capacity full is the only trusted close; Soft label kept for older readers
                        const trustTier: FuelCycle['trustTier'] =
                            status === 'Anomaly'
                              ? undefined
                              : isSoft || isCapped || meta.isCapacityClose || meta.isSoftAnchor
                                ? 'Soft'
                                : 'Manual';

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
                            endOdometer: entryOdo,
                            startingPercentage,
                            isCapped,
                            excessVolume: excessVolume > 0 ? excessVolume : undefined,
                            signalTier: cycleSignalTier,
                            isChainOrigin: pendingChainOrigin || undefined,
                        });
                        // First real cycle after the origin has now been emitted.
                        pendingChainOrigin = false;

                        // Carry spillover as a number only — do NOT also insert a synthetic
                        // duplicate of this fill (that double-counted liters + fake SPLIT rows).
                        carryoverVolume = excessVolume;
                        startingPercentage = tankCapacity > 0 ? (carryoverVolume / tankCapacity) * 100 : 0;
                        currentCycleEntries = [];
                    } else if (hasValidOdo) {
                        // Odometer regressed at a close: no valid distance. The anchor still
                        // advances (below); drop the open cycle so this fill's liters are not
                        // double-counted into the next cycle.
                        currentCycleEntries = [];
                        carryoverVolume = 0;
                        startingPercentage = 0;
                    } else {
                        // Capacity close with no odo can't advance the anchor — keep liters flowing.
                        currentCycleEntries.push({ ...entry, volumeContributed: entryVolume });
                    }
                } else if (hasValidOdo) {
                    // Chain origin: first trusted anchor. Preserve any over-capacity
                    // spillover as carryover instead of dropping it to zero.
                    lastAnchorOdometer = entryOdo;
                    lastAnchorDate = entry.date;
                    currentCycleEntries = [];
                    carryoverVolume = excessVolume > 0 ? excessVolume : 0;
                    startingPercentage = tankCapacity > 0 ? (carryoverVolume / tankCapacity) * 100 : 0;
                    pendingChainOrigin = true;
                } else {
                    // Capacity-close with no odo cannot open/advance the anchor chain
                    currentCycleEntries.push({ ...entry, volumeContributed: entryVolume });
                }

                // Never stamp lastAnchor from a null/zero odo (would inflate next cycle distance)
                if (hasValidOdo) {
                    lastAnchorOdometer = entryOdo;
                    lastAnchorDate = entry.date;
                }
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
