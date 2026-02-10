app.post(`${BASE_PATH}/fuel-entries`, async (c) => {
  try {
    const entry = await c.req.json();
    if (!entry.id) entry.id = crypto.randomUUID();

    // Step 3.1: Immutability Lockdown
    const existingEntry = await kv.get(`fuel_entry:${entry.id}`);
    if (existingEntry) {
        // Only allow updating resolution metadata, not core audit data
        const protectedFields = ['liters', 'amount', 'odometer', 'date', 'vehicleId'];
        const isAttemptingIllegalChange = protectedFields.some(f => existingEntry[f] !== undefined && entry[f] !== undefined && existingEntry[f] !== entry[f]);
        
        if (isAttemptingIllegalChange) {
            entry.liters = existingEntry.liters;
            entry.amount = existingEntry.amount;
            entry.odometer = existingEntry.odometer;
            entry.date = existingEntry.date;
            entry.vehicleId = existingEntry.vehicleId;
        }
    }

    // 1. Fetch Vehicle to check tank capacity and efficiency baselines
    if (entry.vehicleId) {
        const vehicle = await kv.get(`vehicle:${entry.vehicleId}`);
        if (vehicle) {
            const { tankCapacity, baselineEfficiency, rangeMin } = fuelLogic.getVehicleBaselines(vehicle);
            const profileKmPerLiter = baselineEfficiency;

            // 2. Fetch recent entries to calculate cycle state using Step 1.3 Helper
            const lastAnchor = await fuelLogic.getLastAnchor(entry.vehicleId);
            const lastAnchorOdo = Number(lastAnchor?.odometer) || 0;
            const lastAnchorDate = lastAnchor?.date || null;
            
            const cycleEntries = await fuelLogic.getEntriesSinceLastAnchor(entry.vehicleId, lastAnchorDate);
            
            // Step 2.1: Accumulation Logic (with carryover support)
            let carryoverFromLastAnchor = 0;
            if (lastAnchor?.metadata?.isSoftAnchor && lastAnchor?.metadata?.excessVolume) {
                carryoverFromLastAnchor = Number(lastAnchor.metadata.excessVolume) || 0;
            }

            let runningCumulative = carryoverFromLastAnchor;
            for (const ce of cycleEntries) {
                if (ce.id !== entry.id) {
                    runningCumulative = Number((runningCumulative + (Number(ce.liters) || 0)).toFixed(4));
                }
            }

            const volumeAtEntry = (Number(entry.liters) || 0);
            const prevCumulative = runningCumulative;
            const totalVolumeInCycle = Number((runningCumulative + volumeAtEntry).toFixed(4));
            const distanceSinceAnchor = (entry.odometer && lastAnchorOdo) ? (entry.odometer - lastAnchorOdo) : 0;
            
            // Step 2.2: Trigger Thresholding (Roadmap: 98%)
            const isHardAnchor = entry.metadata?.isFullTank || entry.metadata?.isAnchor;
            const approachingSoftAnchor = tankCapacity > 0 && totalVolumeInCycle >= (tankCapacity * SOFT_ANCHOR_THRESHOLD);
            const isSoftAnchor = !isHardAnchor && approachingSoftAnchor;
            
            // Step 2.3: Virtual Reset Implementation
            let volumeContributed = volumeAtEntry;
            let excessVolume = 0;
            if (isSoftAnchor) {
                volumeContributed = Math.max(0, tankCapacity - prevCumulative);
                excessVolume = Number((volumeAtEntry - volumeContributed).toFixed(4));
            }

            // Efficiency Math
            let actualKmPerLiter = 0;
            let efficiencyVariance = 0;
            if (distanceSinceAnchor > 0 && totalVolumeInCycle > 0) {
                actualKmPerLiter = distanceSinceAnchor / totalVolumeInCycle;
                if (profileKmPerLiter > 0) {
                    efficiencyVariance = (profileKmPerLiter - actualKmPerLiter) / profileKmPerLiter;
                }
            }

            // Flagging Logic
            let integrityStatus = 'valid';
            let anomalyReason = null;
            let auditStatus = 'Clear';

            // Behavioral checks
            const recentTimeWindow = new Date(new Date(entry.date).getTime() - (4 * 60 * 60 * 1000)).toISOString();
            // Note: For behavioral checks we still need context from all vehicle entries, not just since anchor
            const allVehicleEntries = (await kv.getByPrefix("fuel_entry:"))
                .filter((e: any) => e.vehicleId === entry.vehicleId && e.id !== entry.id);
                
            const recentTxCount = allVehicleEntries.filter((e: any) => e.date >= recentTimeWindow).length;
            const isHighFrequency = recentTxCount >= 1; 
            const isFragmented = tankCapacity > 0 && (volumeAtEntry / tankCapacity) < 0.15 && !entry.metadata?.isTopUp;

            // Check 1: Tank Overfill
            if (tankCapacity > 0 && volumeAtEntry > (tankCapacity * OVERFILL_THRESHOLD)) {
                integrityStatus = 'critical';
                anomalyReason = 'Tank Overfill Anomaly';
                auditStatus = 'Flagged';
            } 
            // Check 2: Efficiency Flag
            else if (isHardAnchor || isSoftAnchor) {
                const isHighConsumption = efficiencyVariance > 0.25; 
                const isRangeSuspicious = rangeMin > 0 && distanceSinceAnchor < (rangeMin * 0.5) && (totalVolumeInCycle / tankCapacity) > 0.8;

                if (isHighConsumption || isRangeSuspicious) {
                    integrityStatus = 'critical';
                    anomalyReason = 'High Fuel Consumption';
                    auditStatus = 'Flagged';
                }
            }
            // Check 3: High Frequency
            else if (isHighFrequency) {
                integrityStatus = 'critical';
                anomalyReason = 'High Transaction Frequency';
                auditStatus = 'Flagged';
            }
            // Check 4: Fragmented Purchase
            else if (isFragmented) {
                integrityStatus = 'warning';
                anomalyReason = 'Fragmented Purchase';
                auditStatus = 'Flagged';
            }
            // Check 5: Approaching Capacity
            else if (tankCapacity > 0 && totalVolumeInCycle > (tankCapacity * 0.85)) {
                integrityStatus = 'warning';
                anomalyReason = 'Approaching Capacity';
                auditStatus = 'Observing';
            }

            // Update Entry Metadata
            entry.metadata = {
                ...entry.metadata,
                volumeContributed: Number(volumeContributed.toFixed(2)),
                excessVolume: excessVolume > 0 ? Number(excessVolume.toFixed(2)) : undefined,
                cumulativeLitersAtEntry: Number(totalVolumeInCycle.toFixed(2)),
                tankUtilizationPercentage: tankCapacity > 0 ? Number(((totalVolumeInCycle / tankCapacity) * 100).toFixed(1)) : 0,
                distanceSinceAnchor,
                actualKmPerLiter: Number(actualKmPerLiter.toFixed(2)),
                profileKmPerLiter,
                efficiencyVariance: Number((efficiencyVariance * 100).toFixed(1)),
                isSoftAnchor,
                integrityStatus,
                anomalyReason,
                auditStatus,
                isFragmented,
                isHighFrequency,
                cycleId: `cycle_${entry.vehicleId}_${lastAnchorOdo || 'start'}`,
                flaggedAt: (integrityStatus === 'critical' || integrityStatus === 'warning') ? new Date().toISOString() : undefined
            };

            entry.isFlagged = integrityStatus === 'critical';
            entry.auditStatus = auditStatus;

            if (isSoftAnchor) {
                entry.metadata.softAnchorNote = `Soft Anchor: Cumulative volume reached 98% of ${tankCapacity}L. Resetting cycle.`;
            }

            // Step 3.2: Automated Healing Logic
            if (isHardAnchor || isSoftAnchor) {
                const isAggregatedEfficiencyValid = efficiencyVariance < 0.15;
                if (isAggregatedEfficiencyValid) {
                    for (const ce of cycleEntries) {
                        if (ce.auditStatus === 'Flagged' || ce.auditStatus === 'Observing') {
                            ce.metadata.isHealed = true;
                            ce.metadata.healedAt = new Date().toISOString();
                            ce.metadata.auditStatus = 'Auto-Resolved';
                            ce.metadata.healingReason = `Healed by cycle completion: Aggregate efficiency is valid.`;
                            ce.auditStatus = 'Auto-Resolved';
                            await kv.set(`fuel_entry:${ce.id}`, ce);
                        }
                    }
                }
            }
        }
    }

    await kv.set(`fuel_entry:${entry.id}`, entry);
    return c.json({ success: true, data: entry });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});
