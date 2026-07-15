// ════════════════════════════════════════════════════════════════════════════
// Shared utility: Weekly Cash Settlement Calculation
// ════════════════════════════════════════════════════════════════════════════
// Extracted from WeeklySettlementView.tsx so both the Cash Wallet tab and
// the new Settlement sub-tab can use the exact same math without duplication.
//
// Pure function — no React, no side effects, no UI.
// ════════════════════════════════════════════════════════════════════════════

import { Trip, FinancialTransaction, DriverMetrics } from '../types/data';
import { getTripPhysicalCashCollected } from './tripPhysicalCash';
import {
    isCashReturnedForWeek,
    isClearedDriverCashPayment,
    isDriverCashPaymentTransaction,
} from './driverCashPayment';
import { isDriverTollChargeRow, netDriverTollCharges } from './netDriverTollCharges';
import { weekBucketForDate } from './tollWeekPeriod';
import { buildWeeklyCashRisk } from './buildWeeklyCashRisk';
import {
    sumLedgerBankSettledForWeek,
    sumLedgerCashCollectedForWeek,
    type PayoutBankEventLike,
} from './ledgerBankSettled';
import {
    startOfWeek,
    endOfWeek,
    eachWeekOfInterval,
    isWithinInterval,
    format,
} from 'date-fns';

// ── Input ──

export interface CashSettlementInput {
    trips: Trip[];
    transactions: FinancialTransaction[];
    csvMetrics: DriverMetrics[];
    /**
     * Unified toll settlement: when true, the cash calc is toll-NEUTRAL — it
     * omits the cash-toll credit and the personal-toll debit so the shared
     * driverPeriodSettlement calc can apply the server's reconciliation-aware
     * disposition exactly once. Default false = legacy behavior.
     */
    excludeTollEffects?: boolean;
    /** Fleet IANA tz — Monday–Sunday weeks match Toll Reconciliation. */
    timezone?: string;
    /** Ledger `payout_bank` / `payout_cash` rows — same SSOT as PERIOD bank + Uber cash. */
    payoutBankEvents?: PayoutBankEventLike[];
    /** Optional overview fallbacks when payout_* events are empty (weekStart ymd → amount). */
    overviewUberCashByWeek?: Record<string, number>;
}

// ── Output ──

export interface CashWeekData {
    start: Date;
    end: Date;
    amountOwed: number;     // passenger cash (Uber payout_cash + InDrive/Roam) — never bank/float/personal
    /**
     * Cash Returned — Log Cash Payment rows tagged to this Settlement Week only.
     * Never includes fuel reimbursements, toll wash, fleet fuel share, or untagged date buckets.
     */
    amountPaid: number;
    balance: number;        // amountOwed - amountPaid
    /** Uber bank settled for the week — informational; not debt. */
    bankSettled: number;
    status: 'Paid' | 'Partial' | 'Unpaid' | 'Overpaid' | 'No Activity';
    tripCount: number;
    cashTripCount: number;
    isFromCsv: boolean;
    weeklyFuelCredits: number;
    breakdown: {
        cashCollected: number;
        floatIssued: number;
        allocatedPayments: number;
        /** @deprecated Deficit FIFO removed — always 0; kept for overlay compat. */
        fifoPayments: number;
        /** Untagged cash payments whose transaction date falls in this week. */
        surplusPayments: number;
        tollExpenses: number;
        /** Always 0 in Cash Returned path — fuel credits live on Settlement / Fuel desk. */
        fuelCredits: number;
        tollCharges: number;   // personal-use tolls billed to the driver (debit → increases owed)
        bankSettled: number;
        uberCash: number;
        nonUberTripCash: number;
    };
}

// ── Main function ──

export function computeWeeklyCashSettlement(input: CashSettlementInput): CashWeekData[] {
    // Safe access to arrays and filtering out null/undefined items
    const safeTrips = Array.isArray(input.trips) ? input.trips.filter(Boolean) : [];
    const safeTransactions = Array.isArray(input.transactions) ? input.transactions.filter(Boolean) : [];
    const safeCsvMetrics = Array.isArray(input.csvMetrics) ? input.csvMetrics.filter(Boolean) : [];
    const excludeToll = input.excludeTollEffects === true;
    const payoutBankEvents = Array.isArray(input.payoutBankEvents) ? input.payoutBankEvents : [];
    const overviewUberCashByWeek = input.overviewUberCashByWeek || {};

    // If we have CSV metrics but no trips, we should still show something
    if (safeTrips.length === 0 && safeCsvMetrics.length === 0) return [];

    // 1. Determine Range
    const dates = [
        ...safeTrips.map(t => new Date(t.date)),
        ...safeCsvMetrics.map(m => new Date(m.periodStart)),
    ];

    if (dates.length === 0) return [];

    const fleetTz = input.timezone;
    let weekIntervals: Date[];
    if (fleetTz) {
      const byKey = new Map<string, Date>();
      const seedDates = [...dates, new Date()];
      for (const d of seedDates) {
        if (isNaN(d.getTime())) continue;
        const { key, weekStart } = weekBucketForDate(d, fleetTz);
        if (!byKey.has(key)) byKey.set(key, weekStart);
      }
      weekIntervals = Array.from(byKey.entries())
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([, weekStart]) => weekStart);
    } else {
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date();
      const start = startOfWeek(minDate, { weekStartsOn: 1 });
      const end = endOfWeek(maxDate, { weekStartsOn: 1 });
      weekIntervals = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
    }

    // Phase 1: Calculate Basics (Owed, Allocated Payments, Expenses)
    const weeksData = weekIntervals.map(weekStart => {
        const weekEnd = fleetTz
            ? weekBucketForDate(weekStart, fleetTz).weekEnd
            : endOfWeek(weekStart, { weekStartsOn: 1 });

        const weekTrips = safeTrips.filter(t => {
            if (!t || !t.date) return false;
            return isWithinInterval(new Date(t.date), { start: weekStart, end: weekEnd });
        });

        // Float Issued in this week (Increases Debt)
        const weeklyFloat = safeTransactions
            .filter(t => {
                if (!t || !t.date) return false;
                const tDate = new Date(t.date);
                return t.category === 'Float Issue' && isWithinInterval(tDate, { start: weekStart, end: weekEnd });
            })
            .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

        // Personal-use tolls billed to the driver — net charge projections with
        // reversals (Math.abs of every Toll Charge row inflated the debt).
        const weeklyTollCharges = excludeToll
            ? 0
            : netDriverTollCharges(
                safeTransactions.filter(t => {
                    if (!t || !t.date || !isDriverTollChargeRow(t)) return false;
                    if (fleetTz) {
                      return weekBucketForDate(t.date, fleetTz).key === format(weekStart, 'yyyy-MM-dd');
                    }
                    return isWithinInterval(new Date(t.date), { start: weekStart, end: weekEnd });
                }),
            );

        // Cash risk SSOT — PERIOD Uber cash + non-Uber trip cash (+ float/tolls). Never bank.
        const ledgerBankSettled = sumLedgerBankSettledForWeek(
            payoutBankEvents,
            weekStart,
            weekEnd,
            fleetTz,
        );
        let ledgerUberCash = sumLedgerCashCollectedForWeek(
            payoutBankEvents,
            weekStart,
            weekEnd,
            fleetTz,
        );
        if (!(ledgerUberCash > 0.005)) {
            const weekKey = format(weekStart, 'yyyy-MM-dd');
            const fromOverview = Math.abs(Number(overviewUberCashByWeek[weekKey]) || 0);
            if (fromOverview > 0.005) ledgerUberCash = fromOverview;
        }
        const risk = buildWeeklyCashRisk({
            weekStart,
            weekEnd,
            trips: weekTrips,
            csvMetrics: safeCsvMetrics,
            floatIssued: weeklyFloat,
            tollCharges: weeklyTollCharges,
            ledgerBankSettled,
            ledgerUberCash,
        });
        // Passenger cash = Uber statement cash + InDrive/Roam only (never float / personal / bank).
        // Personal tag charges are applied later on Settlement; float stays on the Float desk.
        const amountOwed = risk.cashCollected;
        const isFromCsv = risk.breakdown.uberFromStatement;

        // --- Calculate Credits (Allocated Payments + Approved Cash Tolls) ---

        // 1. Cleared Log Cash tagged exactly to this Settlement Week Monday.
        const weekMondayYmd = format(weekStart, 'yyyy-MM-dd');
        const allocatedPayments = safeTransactions.filter(t =>
            isCashReturnedForWeek(t, weekMondayYmd),
        );

        // 2. Approved Cash Toll Expenses (Treated as Credit/Payment)
        const weeklyExpenses = excludeToll ? 0 : safeTransactions
            .filter(t => {
                if (!t || !t.date) return false;
                const tDate = new Date(t.date);
                const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
                const isCash = t.paymentMethod === 'Cash' || !!t.receiptUrl;
                const isResolved = t.status === 'Resolved' || t.status === 'Approved';
                return isToll && isCash && isResolved && isWithinInterval(tDate, { start: weekStart, end: weekEnd });
            })
            .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);

        // Fuel accounting credits (companyShare) — NEVER Cash Returned; Settlement applies fleet fuel separately.
        const fuelInWeek = (t: FinancialTransaction): boolean => {
            if (!t || (t.amount || 0) <= 0) return false;
            if (t.metadata?.reportId) {
                const parts = String(t.metadata.reportId).split('_');
                const dateStr = parts[parts.length - 1];
                if (dateStr && dateStr.length === 10 && dateStr.includes('-')) {
                    const reportStart = new Date(dateStr + 'T12:00:00');
                    return isWithinInterval(reportStart, { start: weekStart, end: weekEnd });
                }
            }
            if (t.metadata?.workPeriodStart) {
                const startStr = String(t.metadata.workPeriodStart).split('T')[0];
                const payStart = new Date(startStr + 'T12:00:00');
                return isWithinInterval(payStart, { start: weekStart, end: weekEnd });
            }
            if (!t.date) return false;
            return isWithinInterval(new Date(t.date), { start: weekStart, end: weekEnd });
        };

        const weeklyFuelCredits = safeTransactions
            .filter(t => {
                if (!t || !fuelInWeek(t)) return false;
                return t.category === 'Fuel Settlement Credit' || t.category === 'Fuel Settlement';
            })
            .reduce((sum, t) => {
                if (t.category === 'Fuel Settlement Credit') return sum + (t.amount || 0);
                if (t.category === 'Fuel Settlement' && t.metadata?.companyShare) {
                    return sum + (Number(t.metadata.companyShare) || 0);
                }
                return sum + (t.amount || 0);
            }, 0);

        // Cash Returned SSOT = Settlement Week–tagged Log Cash Payment rows only.
        // Fuel reimbursements and tolls belong to Fuel / Toll desks — never here.
        // Fleet Financials bank confirms / bank CSV match must NEVER feed this sum.
        const allocatedPaymentsOnly = allocatedPayments.reduce((sum, t) => sum + (t.amount || 0), 0);

        return {
            start: weekStart,
            end: weekEnd,
            amountOwed,
            allocatedPaid: allocatedPaymentsOnly,
            weeklyFuelCredits,
            weekTrips,
            isFromCsv,
            bankSettled: risk.bankSettled,
            debtPaid: 0,
            surplusPaid: 0, // untagged cash tracked for visibility; not Cash Returned
            _cashCollected: risk.cashCollected,
            _floatIssued: weeklyFloat,
            _allocatedPaymentsOnly: allocatedPaymentsOnly,
            _tollExpenses: weeklyExpenses,
            _fuelCredits: 0,
            _tollCharges: weeklyTollCharges,
            _uberCash: risk.breakdown.uberCash,
            _nonUberTripCash: risk.breakdown.nonUberTripCash,
        };
    });

    // Phase 2: Track untagged cash by payment date (ops visibility only — does NOT inflate Cash Returned).
    const unallocatedTransactions = safeTransactions.filter(t => {
        if (!t) return false;
        if (t.category === 'Float Issue') return false;
        if (
            t.category === 'Fuel Settlement Credit' ||
            t.category === 'Fuel Settlement' ||
            t.category === 'Fuel Reimbursement' ||
            t.category === 'Fuel Reimbursement Credit'
        ) {
            return false;
        }
        if (t.paymentMethod === 'Tag Balance') return false;
        if (t.description?.toLowerCase().includes('top-up')) return false;
        const isToll = t.category === 'Toll Usage' || t.category === 'Toll' || t.category === 'Tolls';
        if (isToll) return false;
        if (t.metadata?.workPeriodStart) return false;
        // Untagged visibility — cleared only (Pending bank stays Unverified)
        return isClearedDriverCashPayment(t);
    });

    for (const tx of unallocatedTransactions) {
        if (!tx?.date) continue;
        const txDate = new Date(tx.date);
        const targetWeek = weeksData.find(w => isWithinInterval(txDate, { start: w.start, end: w.end }));
        if (targetWeek) {
            targetWeek.surplusPaid += tx.amount || 0;
        } else if (weeksData.length > 0) {
            weeksData[weeksData.length - 1].surplusPaid += tx.amount || 0;
        }
    }

    // Phase 3: amountPaid = Cash Returned = work-period tagged cash only
    return weeksData.map(week => {
        const amountPaid = week.allocatedPaid;

        const cashTripCount = week.weekTrips.filter(t => getTripPhysicalCashCollected(t) > 0).length;

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
            bankSettled: week.bankSettled || 0,
            status,
            tripCount: week.weekTrips.length,
            cashTripCount,
            isFromCsv: week.isFromCsv,
            weeklyFuelCredits: week.weeklyFuelCredits,
            breakdown: {
                cashCollected: week._cashCollected,
                floatIssued: week._floatIssued,
                allocatedPayments: week._allocatedPaymentsOnly,
                fifoPayments: 0,
                surplusPayments: week.surplusPaid,
                tollExpenses: week._tollExpenses,
                fuelCredits: week._fuelCredits,
                tollCharges: week._tollCharges,
                bankSettled: week.bankSettled || 0,
                uberCash: week._uberCash || 0,
                nonUberTripCash: week._nonUberTripCash || 0,
            },
        };
    }).reverse(); // Most recent first
}
