import { FuelEntry, OdometerBucket } from '../types/fuel';
import { FinancialTransaction } from '../types/data';

/**
 * Maps a fuel entry to its logical odometer bucket window.
 */
export const findBucketForEntry = (entry: FuelEntry, buckets: OdometerBucket[]): OdometerBucket | undefined => {
    // If the entry already has an anchorPeriodId, use it
    if (entry.anchorPeriodId) {
        return buckets.find(b => b.id === entry.anchorPeriodId);
    }

    // Otherwise, find a bucket where the entry date falls within the bucket range
    // Priority 1: Exact match on closingEntryId (if this entry was the anchor)
    const closingMatch = buckets.find(b => b.closingEntryId === entry.id);
    if (closingMatch) return closingMatch;

    // Priority 2: Date range match
    // Note: We use ISO date strings for comparison
    return buckets.find(b => 
        entry.date >= b.startDate && 
        entry.date <= b.endDate &&
        entry.vehicleId === b.vehicleId
    );
};

/**
 * Identifies if a transaction is a credit that reconciles a specific fuel entry.
 * Currently, settlements are weekly, but this helper prepares for granular reconciliation mapping.
 */
export const getReconciliationLink = (
    entry: FuelEntry, 
    transactions: FinancialTransaction[]
): FinancialTransaction | undefined => {
    // Look for a transaction that matches the entry's transactionId (Direct link)
    if (entry.transactionId) {
        const directMatch = transactions.find(t => t.id === entry.transactionId);
        if (directMatch) return directMatch;
    }

    // Look for an automated settlement that covers this period/report
    // This allows the ledger to show the "Company Share" even if linked via a weekly report
    return transactions.find(t => 
        t.metadata?.automated && 
        t.category?.toLowerCase().includes('fuel settlement') &&
        entry.date >= (t.metadata.weekStart || t.date) &&
        entry.date <= (t.metadata.weekEnd || t.date)
    );
};

/**
 * Determines if a transaction should be displayed as a Debit in the Fuel Ledger.
 */
export const isFuelDebit = (tx: FinancialTransaction): boolean => {
    if (tx.metadata?.isDebit !== undefined) return tx.metadata.isDebit;
    
    const cat = tx.category?.toLowerCase() || "";
    const desc = tx.description?.toLowerCase() || "";
    
    // Physical fuel purchases are debits (negative amounts)
    return (cat === 'fuel' || desc.includes('fuel expense')) && tx.amount < 0;
};

/**
 * Determines if a transaction should be displayed as a Credit in the Fuel Ledger.
 */
export const isFuelCredit = (tx: FinancialTransaction): boolean => {
    if (tx.metadata?.isCredit !== undefined) return tx.metadata.isCredit;

    const cat = tx.category?.toLowerCase() || "";
    const desc = tx.description?.toLowerCase() || "";
    
    // Reimbursements and Settlements are credits (positive amounts)
    return (cat.includes('reimbursement') || desc.includes('settlement')) && tx.amount > 0;
};
