// ════════════════════════════════════════════════════════════════════════════
// Shared utility: Weekly Cash Settlement Calculation
// ════════════════════════════════════════════════════════════════════════════
// Extracted from WeeklySettlementView.tsx so both the Cash Wallet tab and
// the new Settlement sub-tab can use the exact same math without duplication.
//
// Pure function — no React, no side effects, no UI.
// ════════════════════════════════════════════════════════════════════════════

import { Trip, FinancialTransaction, DriverMetrics } from '../types/data';
import {
    startOfWeek,
    endOfWeek,
    eachWeekOfInterval,
    isWithinInterval,
    parseISO,
    areIntervalsOverlapping,
} from 'date-fns';

// ── Input ──

export interface CashSettlementInput {
    trips: Trip[];
    transactions: FinancialTransaction[];
    csvMetrics: DriverMetrics[];
}

// ── Output ──

export interface CashWeekData {
    start: Date;
    end: Date;
    amountOwed: number;     // cash collected + float issued
    amountPaid: number;     // allocated payments + FIFO + surplus + toll credits + fuel credits
    balance: number;        // amountOwed - amountPaid
    status: 'Paid' | 'Partial' | 'Unpaid' | 'Overpaid' | 'No Activity';
    tripCount: number;
    cashTripCount: number;
    isFromCsv: boolean;
    weeklyFuelCredits: number;
    breakdown: {
        cashCollected: number;
        floatIssued: number;
        allocatedPayments: number;
        fifoPayments: number;
        surplusPayments: number;
        tollExpenses: number;
        fuelCredits: number;
    };
}

// ── Main function ──

export function computeWeeklyCashSettlement(input: CashSettlementInput): CashWeekData[] {
    // Safe access to arrays and filtering out null/undefined items
    const safeTrips = Array.isArray(input.trips) ? input.trips.filter(Boolean) : [];
    const safeTransactions = Array.isArray(input.transactions) ? input.transactions.filter(Boolean) : [];
    const safeCsvMetrics = Array.isArray(input.csvMetrics) ? input.csvMetrics.filter(Boolean) : [];

    // If we have CSV metrics but no trips, we should still show something
    if (safeTrips.length === 0 && safeCsvMetrics.length === 0) return [];

    // 1. Determine Range
    const dates = [
        ...safeTrips.map(t => new Date(t.date)),
        ...safeCsvMetrics.map(m => new Date(m.periodStart)),
    ];

    if (dates.length === 0) return [];

    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(); // Up to today

    // Align to weeks (Monday start)
    const start = startOfWeek(minDate, { weekStartsOn: 1 });
    const end = endOfWeek(maxDate, { weekStartsOn: 1 });

    // Generate Weeks (Oldest to Newest)
    const weekIntervals = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });

    // Phase 1: Calculate Basics (Owed, Allocated Payments, Expenses)
    const weeksData = weekIntervals.map(weekStart => {
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

        // --- Calculate Owed (Cash Collected + Float Issued) ---
        const relevantCsvMetrics = safeCsvMetrics.filter(m => {
            if (!m || !m.periodStart || !m.periodEnd) return false;
            const mStart = parseISO(m.periodStart);
            const mEnd = parseISO(m.periodEnd);
            const overlaps = areIntervalsOverlapping({ start: mStart, end: mEnd }, { start: weekStart, end: weekEnd });
            if (!overlaps) return false;
            const overlapStart = mStart > weekStart ? mStart : weekStart;
            const overlapEnd = mEnd < weekEnd ? mEnd : weekEnd;
            const overlapDuration = overlapEnd.getTime() - overlapStart.getTime();
            const oneDay = 24 * 60 * 60 * 1000;
            return overlapDuration > (oneDay * 0.5);
        });

        const csvCash = relevantCsvMetrics.reduce((sum, m) => sum + (m.cashCollected || 0), 0);

        const weekTrips = safeTrips.filter(t => {
            if (!t || !t.date) return false;
            return isWithinInterval(new Date(t.date), { start: weekStart, end: weekEnd });
        });

        const tripCalculatedCash = weekTrips.reduce((sum, t) => {
            const cash = Number(t.cashCollected || 0);
            if (Math.abs(cash) > 0) return sum + Math.abs(cash);
            const platform = (t.platform || '').toLowerCase();
            const isCashPlatform = ['indrive', 'bolt', 'cash', 'goride', 'roam', 'private'].includes(platform);
            const isCashMethod = t['paymentMethod'] === 'Cash';
            if (isCashPlatform || isCashMethod) return sum + Number(t.amount || 0);
            return sum;
        }, 0);

        // Float Issued in this week (Increases Debt)
        const weeklyFloat = safeTransactions
            .filter(t => {
                if (!t || !t.date) return false;
                const tDate = new Date(t.date);
                return t.category === 'Float Issue' && isWithinInterval(tDate, { start: weekStart, end: weekEnd });
            })
            .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

        const amountOwed = Math.max(csvCash, tripCalculatedCash) + weeklyFloat;
        const isFromCsv = csvCash > tripCalculatedCash;

        // --- Calculate Credits (Allocated Payments + Approved Cash Tolls) ---

        // 1. Allocated Payments (Metadata based)
        const allocatedPayments = safeTransactions.filter(t => {
            if (!t) return false;
            if (t.metadata?.workPeriodStart) {
                // Strip time and reconstruct as local noon to avoid UTC-midnight timezone day-shift
                const startStr = t.metadata.workPeriodStart.split('T')[0];
                const endStr = t.metadata.workPeriodEnd ? t.metadata.workPeriodEnd.split('T')[0] : startStr;
                const payStart = new Date(startStr + 'T12:00:00');
                const payEnd = new Date(endStr + 'T12:00:00');
                return areIntervalsOverlapping({ start: payStart, end: payEnd }, { start: weekStart, end: weekEnd });
            }
            return false;
        });

        // 2. Approved Cash Toll Expenses (Treated as Credit/Payment)
        const weeklyExpenses = safeTransactions
            .filter(t => {
                if (!t || !t.date) return false;
                const tDate = new Date(t.date);
                const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
                const isCash = t.paymentMethod === 'Cash' || !!t.receiptUrl;
                const isResolved = t.status === 'Resolved' || t.status === 'Approved';
                return isToll && isCash && isResolved && isWithinInterval(tDate, { start: weekStart, end: weekEnd });
            })
            .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

        // 3. Approved Fuel Reimbursement Credits in this week
        const weeklyFuelCredits = safeTransactions
            .filter(t => {
                if (!t || !t.date) return false;
                const tDate = new Date(t.date);
                return t.category === 'Fuel Reimbursement Credit'
                    && t.amount > 0
                    && isWithinInterval(tDate, { start: weekStart, end: weekEnd });
            })
            .reduce((sum, t) => sum + (t.amount || 0), 0);

        const allocatedPaid = allocatedPayments.reduce((sum, t) => sum + (t.amount || 0), 0) + weeklyExpenses + weeklyFuelCredits;

        return {
            start: weekStart,
            end: weekEnd,
            amountOwed,
            allocatedPaid,
            weeklyFuelCredits,
            weekTrips,
            isFromCsv,
            debtPaid: 0,      // Will be filled in Phase 2 (FIFO)
            surplusPaid: 0,   // Will be filled in Phase 2 (Surplus)
            // Breakdown detail fields
            _cashCollected: Math.max(csvCash, tripCalculatedCash),
            _floatIssued: weeklyFloat,
            _allocatedPaymentsOnly: allocatedPayments.reduce((sum, t) => sum + (t.amount || 0), 0),
            _tollExpenses: weeklyExpenses,
            _fuelCredits: weeklyFuelCredits,
        };
    });

    // Phase 2: Distribute Unallocated Payments (FIFO)
    // 1. Identify Unallocated Transactions
    const unallocatedTransactions = safeTransactions.filter(t => {
        if (!t) return false;
        // Exclude Float Issue (Debt)
        if (t.category === 'Float Issue') return false;
        // Exclude Fuel Credits (already date-allocated above)
        if (t.category === 'Fuel Reimbursement Credit') return false;

        // Strict Safety: Never include Tag Balance operations as Driver Credits
        if (t.paymentMethod === 'Tag Balance') return false;
        if (t.description?.toLowerCase().includes('top-up')) return false;

        // Exclude Tolls (Expenses)
        const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
        if (isToll) return false;

        // Exclude Allocated (Metadata)
        if (t.metadata?.workPeriodStart) return false;

        // STRICT PAYMENT LOGIC: Only count explicit Cash Collections or Payment Received types
        const isPayment = t.category === 'Cash Collection' || t.type === 'Payment_Received';

        return isPayment && (t.amount || 0) > 0;
    });

    let totalUnallocatedPool = unallocatedTransactions.reduce((sum, t) => sum + (t.amount || 0), 0);

    // 2. Pay off Debt (Oldest Week First)
    weeksData.forEach(week => {
        const deficit = week.amountOwed - week.allocatedPaid;
        if (deficit > 0 && totalUnallocatedPool > 0) {
            const payment = Math.min(deficit, totalUnallocatedPool);
            week.debtPaid = payment;
            totalUnallocatedPool -= payment;
        }
    });

    // 3. Distribute Surplus (If any pool remains)
    if (totalUnallocatedPool > 0) {
        const sortedTx = [...unallocatedTransactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        for (const tx of sortedTx) {
            if (totalUnallocatedPool <= 0) break;

            const amountToAssign = Math.min(tx.amount || 0, totalUnallocatedPool);

            const txDate = new Date(tx.date);
            const targetWeek = weeksData.find(w => isWithinInterval(txDate, { start: w.start, end: w.end }));

            if (targetWeek) {
                targetWeek.surplusPaid += amountToAssign;
            } else {
                if (weeksData.length > 0) {
                    weeksData[weeksData.length - 1].surplusPaid += amountToAssign;
                }
            }

            totalUnallocatedPool -= amountToAssign;
        }
    }

    // Phase 3: Final Assembly
    return weeksData.map(week => {
        const amountPaid = week.allocatedPaid + week.debtPaid + week.surplusPaid;

        const cashTripCount = week.weekTrips.filter(t => {
            const cash = Number(t.cashCollected || 0);
            const platform = (t.platform || '').toLowerCase();
            const isCashPlatform = ['indrive', 'bolt', 'cash', 'goride', 'roam', 'private'].includes(platform);
            const isCashMethod = t['paymentMethod'] === 'Cash';
            return Math.abs(cash) > 0 || isCashPlatform || isCashMethod;
        }).length;

        // Status Logic
        let status: 'Paid' | 'Partial' | 'Unpaid' | 'Overpaid' | 'No Activity' = 'Unpaid';
        if (week.amountOwed === 0 && amountPaid === 0) status = 'No Activity';
        else if (amountPaid >= week.amountOwed - 0.01) status = 'Paid';
        else if (amountPaid > 0) status = 'Partial';

        if (amountPaid > week.amountOwed + 1) status = 'Overpaid';

        return {
            start: week.start,
            end: week.end,
            amountOwed: week.amountOwed,
            amountPaid,
            balance: week.amountOwed - amountPaid,
            status,
            tripCount: week.weekTrips.length,
            cashTripCount,
            isFromCsv: week.isFromCsv,
            weeklyFuelCredits: week.weeklyFuelCredits,
            // Breakdown details for overlay
            breakdown: {
                cashCollected: week._cashCollected,
                floatIssued: week._floatIssued,
                allocatedPayments: week._allocatedPaymentsOnly,
                fifoPayments: week.debtPaid,
                surplusPayments: week.surplusPaid,
                tollExpenses: week._tollExpenses,
                fuelCredits: week._fuelCredits,
            },
        };
    }).reverse(); // Most recent first
}
