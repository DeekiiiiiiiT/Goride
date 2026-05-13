import { useMemo, useCallback } from 'react';
import { FuelEntry } from '../types/fuel';
import { FinancialTransaction } from '../types/data';

export function useFuelAnchors(entries: FuelEntry[], transactions: FinancialTransaction[]) {
    const transactionMap = useMemo(() => {
        return new Map(transactions.map(t => [t.id, t]));
    }, [transactions]);

    const getLinkedTransaction = useCallback((entry: FuelEntry) => {
        if (entry.transactionId) return transactionMap.get(entry.transactionId);
        return transactions.find(t => t.metadata?.sourceId === entry.id);
    }, [transactions, transactionMap]);

    const trustedEntryIds = useMemo(() => {
        const trusted = new Set<string>();
        entries.forEach(entry => {
            const isVerified = entry.metadata?.isVerified === true;
            const isModifiedAnchor = (entry.metadata?.isEdited === true || !!entry.metadata?.editReason || isVerified) && entry.type === 'Reimbursement';
            if (isModifiedAnchor || isVerified) {
                trusted.add(entry.id);
                return;
            }
            const tx = getLinkedTransaction(entry);
            const isOriginallyTrusted = tx && tx.metadata?.source !== 'Manual' && tx.metadata?.source !== 'Fuel Log';
            if (isOriginallyTrusted) trusted.add(entry.id);
        });
        return trusted;
    }, [entries, getLinkedTransaction]);

    const anchorData = useMemo(() => {
        const anchors = new Set<string>();
        const failures = new Map<string, string>();
        const candidates: FuelEntry[] = [];
        
        entries.forEach(e => {
            if (e.type !== 'Reimbursement') return;
            if ((e.odometer ?? 0) <= 0) {
                failures.set(e.id, "Invalid Odometer (0)");
                return;
            }
            if (!trustedEntryIds.has(e.id)) {
                 failures.set(e.id, "Unverified Source");
                 return;
            }
            candidates.push(e);
        });

        const byVehicle = new Map<string, FuelEntry[]>();
        candidates.forEach(e => {
            const vId = e.vehicleId || 'unknown';
            if (!byVehicle.has(vId)) byVehicle.set(vId, []);
            byVehicle.get(vId)!.push(e);
        });

        byVehicle.forEach((vehicleEntries) => {
            vehicleEntries.sort((a, b) => {
                const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
                if (dateDiff !== 0) return dateDiff;
                return (a.odometer || 0) - (b.odometer || 0);
            });
            let maxOdometer = 0;
            vehicleEntries.forEach(entry => {
                const odo = entry.odometer || 0;
                if (odo >= maxOdometer) {
                    anchors.add(entry.id);
                    maxOdometer = odo;
                } else {
                    failures.set(entry.id, `Sequential Error (${odo} < ${maxOdometer})`);
                }
            });
        });
        return { validAnchorIds: anchors, anchorFailures: failures };
    }, [entries, trustedEntryIds]);

    return {
        ...anchorData,
        getLinkedTransaction,
        transactionMap
    };
}
