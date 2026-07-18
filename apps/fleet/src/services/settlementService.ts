import { api, fetchWithRetry } from './api';
import { FuelEntry, FuelScenario, WeeklyFuelReport, OdometerBucket } from '../types/fuel';
import { FinancialTransaction } from '../types/data';
import { FuelCalculationService } from './fuelCalculationService';
import { API_ENDPOINTS } from './apiConfig';

import { requireAuthHeaders } from '../utils/authHeaders';
import { pickScenarioForDriverMembership, resolveActiveFuelPolicyForDriverWeek } from '../utils/fuelPolicyVersion';
import { reportWeekYmdBounds, toEntryYmd } from '../utils/fuelWeekPeriod';
import { isGasCardFuelEntry } from '../utils/fuelPaidByDriver';
import {
  isCashStyleFuelPaymentSource,
  normalizeFuelPaymentSourceEnum,
  fuelPaymentSourceToMeta,
} from '../utils/fuelPaymentSource';

/** Calendar day YYYY-MM-DD from stored date/datetime strings. */
function toYmd(d: string | undefined | null): string {
  return toEntryYmd(d);
}

/**
 * Service to handle automated financial settlements for fuel and other expenses.
 * Wallet credits / fuel deductions are written ONLY at Finalize (commitWeeklyStatement).
 */
export const settlementService = {
  /**
   * Reverse Enterprise_Fuel_Sync (and related finalize posts) for a locked week
   * so re-finalize can repost all fills at current ratios.
   */
  async reverseEnterpriseFuelSyncForReport(report: WeeklyFuelReport): Promise<number> {
    const driverId = report.driverId?.trim();
    if (!driverId) return 0;

    const { start: weekKey, end: weekEnd } = reportWeekYmdBounds(report);
    const reportIdCandidates = new Set<string>([
      report.id,
      `${driverId}_${weekKey}`,
      ...(report.vehicleId ? [`${report.vehicleId}_${weekKey}`] : []),
    ].filter(Boolean));

    const txPage = await api.getTransactions(driverId, { limit: 5000 });
    const allTransactions: FinancialTransaction[] = Array.isArray(txPage) ? txPage : [];
    const toDelete: string[] = [];

    for (const tx of allTransactions) {
      if (!tx?.id) continue;
      const rid = tx.metadata?.reportId ? String(tx.metadata.reportId) : '';
      if (rid && reportIdCandidates.has(rid)) {
        toDelete.push(tx.id);
        continue;
      }
      if (tx.metadata?.settlementType === 'Enterprise_Fuel_Sync') {
        const wp = String(tx.metadata?.workPeriodStart || '').split('T')[0];
        if (wp === weekKey) toDelete.push(tx.id);
      }
    }

    for (const id of toDelete) {
      try {
        await api.deleteTransaction(id);
      } catch (e) {
        console.warn(`[SettlementService] Failed to reverse tx ${id}:`, e);
      }
    }

    // Reset fuel entries previously finalized into this statement so they can repost
    try {
      const res = await fetchWithRetry(
        `${API_ENDPOINTS.fuel}/fuel-entries?startDate=${weekKey}&endDate=${weekEnd}&limit=2000`,
        { headers: await requireAuthHeaders(null) },
      );
      if (res.ok) {
        const entries: FuelEntry[] = await res.json();
        for (const entry of entries || []) {
          const fbr = entry.metadata?.finalizedByReport
            ? String(entry.metadata.finalizedByReport)
            : '';
          const match =
            (fbr && reportIdCandidates.has(fbr)) ||
            (entry.reconciliationStatus === 'Verified' &&
              entry.driverId === driverId &&
              String(entry.date || '').split('T')[0] >= weekKey &&
              String(entry.date || '').split('T')[0] <= weekEnd);
          if (!match) continue;

          const meta = { ...(entry.metadata || {}) };
          delete (meta as any).finalizedAt;
          delete (meta as any).finalizedByReport;
          delete (meta as any).splitApplied;
          const updated = {
            ...entry,
            reconciliationStatus: 'Pending' as const,
            metadata: meta,
          };
          await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries`, {
            method: 'POST',
            headers: await requireAuthHeaders(),
            body: JSON.stringify(updated),
          });
        }
      }
    } catch (e) {
      console.warn('[SettlementService] Failed to reset fuel entries after reverse:', e);
    }

    return toDelete.length;
  },

  // --- Phase 4: Commit Weekly Statement ---
  async commitWeeklyStatement(report: WeeklyFuelReport, entries: FuelEntry[]): Promise<void> {
    try {
        // 1. Fetch dependencies
        const [vehicles, drivers, scenariosResponse] = await Promise.all([
            api.getVehicles(),
            api.getDrivers().catch(() => []),
            fetchWithRetry(`${API_ENDPOINTS.fuel}/scenarios`, {
                headers: await requireAuthHeaders(null)
            })
        ]);
        
        if (!scenariosResponse.ok) throw new Error("Failed to fetch scenarios");
        const scenarios: FuelScenario[] = await scenariosResponse.json();
        const vehicle = vehicles.find(v => v.id === report.vehicleId);
        
        if (!vehicle) throw new Error(`Vehicle ${report.vehicleId} not found`);

        // 2. Determine Active Scenario from driver policy (dual-read vehicle fallback)
        const weekStartYmd = reportWeekYmdBounds(report).start;
        const driver = (drivers || []).find(
          (d: any) => d.id === report.driverId || d.driverId === report.driverId,
        );
        const activeScenario =
          resolveActiveFuelPolicyForDriverWeek(
            scenarios,
            report.driverId || driver?.id,
            weekStartYmd,
          )?.scenario ||
          pickScenarioForDriverMembership(
            scenarios,
            report.driverId || driver?.id,
            weekStartYmd,
          );

        if (!activeScenario?.id) {
          throw new Error(`No fuel scenario for driver ${report.driverId} week ${weekStartYmd}`);
        }

        const driverRatio = FuelCalculationService.getBlendedDriverShareRatio(report);

        // 3. Process each entry
        for (const entry of entries) {
            // Skip already reconciled or awaiting review — only genuinely pending
            // entries should be swept into settlement.
            if (
                entry.reconciliationStatus === 'Verified' ||
                entry.reconciliationStatus === 'Archived' ||
                entry.reconciliationStatus === 'Flagged' ||
                entry.reconciliationStatus === 'Observing'
            ) continue;

            // Normalize blank payment source before money write
            const paymentSource = normalizeFuelPaymentSourceEnum(
              entry.paymentSource || (entry.metadata as any)?.paymentSource
            );
            const entryForSettle = { ...entry, paymentSource };

            const driverAmount = entry.amount * driverRatio;
            const split = { company: entry.amount - driverAmount, driver: driverAmount };
            
            let walletPayment: Partial<FinancialTransaction> | null = null;
            let payoutDeduction: Partial<FinancialTransaction> | null = null;
            
            if (isGasCardFuelEntry(entryForSettle as FuelEntry)) {
                // Case A: Company Paid (Gas Card) — deduct driver share only
                if (split.driver > 0.01) {
                    payoutDeduction = {
                        type: 'Expense',
                        category: 'Fuel Deduction',
                        description: `Fuel Deduction: Driver Share of ${entry.location || 'Fuel'}`,
                        amount: -Math.abs(split.driver),
                        paymentMethod: 'Cash',
                    };
                }
            } else if (isCashStyleFuelPaymentSource(paymentSource)) {
                // Case B: Driver OOP / RideShare / Personal — reimburse full + deduct share
                walletPayment = {
                    type: 'Payment_Received',
                    category: 'Fuel Reimbursement',
                    description: `Fuel Credit: Spent cash on ${entry.location || 'Fuel'}`,
                    amount: Math.abs(entry.amount),
                    paymentMethod: 'Cash',
                    metadata: { isFuelCredit: true }
                };

                if (split.driver > 0.01) {
                    payoutDeduction = {
                        type: 'Expense',
                        category: 'Fuel Deduction',
                        description: `Fuel Deduction: Driver Share of ${entry.location || 'Fuel'}`,
                        amount: -Math.abs(split.driver),
                        paymentMethod: 'Cash',
                    };
                }
            } else {
                console.warn(
                  `[SettlementService] Skipping unsettled paymentSource '${paymentSource}' for entry ${entry.id}`
                );
                continue;
            }

            const processTx = async (tx: Partial<FinancialTransaction>) => {
                const fullTx = {
                    ...tx,
                    id: crypto.randomUUID(),
                    date: entry.date.split('T')[0],
                    time: entry.time,
                    driverId: entry.driverId || report.driverId,
                    vehicleId: entry.vehicleId,
                    status: 'Approved',
                    isReconciled: true,
                    metadata: {
                        ...tx.metadata,
                        sourceId: entry.id,
                        scenarioId: activeScenario.id,
                        settlementType: 'Enterprise_Fuel_Sync',
                        totalCost: entry.amount,
                        companyShare: split.company,
                        driverShare: split.driver,
                        reportId: report.id,
                        workPeriodStart: report.weekStart,
                        workPeriodEnd: report.weekEnd
                    }
                };
                return await api.saveTransaction(fullTx);
            };

            let savedTxId: string | undefined = undefined;

            if (walletPayment) {
                const saved = await processTx(walletPayment);
                savedTxId = saved.id;
            }
            if (payoutDeduction) {
                await processTx(payoutDeduction);
            }

            // 4. Update Fuel Entry
            const updatedEntry = {
                ...entry,
                paymentSource,
                reconciliationStatus: 'Verified',
                transactionId: savedTxId || entry.transactionId,
                metadata: {
                    ...entry.metadata,
                    paymentSource: fuelPaymentSourceToMeta(paymentSource),
                    finalizedAt: new Date().toISOString(),
                    finalizedByReport: report.id,
                    splitApplied: split
                }
            };

            await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries`, {
                method: 'POST',
                headers: await requireAuthHeaders(),
                body: JSON.stringify(updatedEntry)
            });
        }
    } catch (error) {
        console.error("Failed to commit weekly statement:", error);
        throw error;
    }
  },

  /**
   * Discovers all financial records associated with a fuel log ID (Expense + Settlement).
   * Uses both explicit metadata IDs and "Signature Matching" (fingerprinting)
   * to catch orphans that lost their explicit links.
   */
  async getRelatedTransactions(fuelEntry: FuelEntry): Promise<FinancialTransaction[]> {
    const driverId = fuelEntry.driverId?.trim();
    const txPage = await api.getTransactions(driverId || undefined, { limit: 5000 });
    const allTransactions: FinancialTransaction[] = Array.isArray(txPage) ? txPage : [];

    // 1. Primary Match: Explicit Metadata Links
    const explicitMatches = allTransactions.filter(t => 
      t.metadata?.sourceId === fuelEntry.id || 
      t.metadata?.linkedFuelId === fuelEntry.id ||
      t.id === fuelEntry.transactionId
    );

    // 2. Secondary Match: Signature/Fingerprint Matching
    // Matches transactions by Vehicle, Date, and Amount (handling both Debit and Credit variants)
    const entryDate = toYmd(fuelEntry.date);
    const signatureMatches = allTransactions.filter(t => {
      // Skip if already found in explicit matches
      if (explicitMatches.some(em => em.id === t.id)) return false;

      const sameVehicle = t.vehicleId === fuelEntry.vehicleId;
      const sameDate = toYmd(t.date) === entryDate;
      
      // Look for amount matches (Expense - amount, or Settlement - coverage amount)
      const absTxAmount = Math.abs(t.amount);
      const absEntryAmount = Math.abs(fuelEntry.amount);
      
      const sameAmount = absTxAmount === absEntryAmount || 
                         (t.metadata?.totalCost && Math.abs(t.metadata.totalCost) === absEntryAmount);
      
      // We look for Fuel or Reimbursement categories for this vehicle/date/amount
      const relevantCategory = t.category?.toLowerCase().includes('fuel') || t.category?.toLowerCase().includes('reimbursement');
      
      return sameVehicle && sameDate && sameAmount && relevantCategory;
    });

    return [...explicitMatches, ...signatureMatches];
  },

  /**
   * Finds the parent FuelEntry for a given financial transaction.
   */
  async getParentFuelEntry(transaction: FinancialTransaction): Promise<FuelEntry | null> {
    const { fuelService } = await import('./fuelService');
    const fuelEntries = await fuelService.getFuelEntries();
    
    // 1. Explicit Link
    const sourceId = transaction.metadata?.sourceId || transaction.metadata?.linkedFuelId;
    if (sourceId) {
      const match = fuelEntries.find(e => e.id === sourceId);
      if (match) return match;
    }

    // 2. Fingerprint Match
    const txDay = toYmd(transaction.date);
    const absTxAmount = Math.abs(transaction.amount);
    
    return fuelEntries.find(e => {
      const sameVehicle = e.vehicleId === transaction.vehicleId;
      const sameDate = toYmd(e.date) === txDay;
      const sameAmount = Math.abs(e.amount) === absTxAmount || 
                         (transaction.metadata?.totalCost && Math.abs(e.amount) === Math.abs(transaction.metadata.totalCost));
      
      return sameVehicle && sameDate && sameAmount;
    }) || null;
  },

  /**
   * @deprecated Money posts only at Finalize via commitWeeklyStatement.
   * Kept as a no-op so portal/legacy callers do not create early RideShare_Cash_Offset rows.
   */
  async processFuelSettlement(_entryOrTx: FuelEntry | FinancialTransaction, _scenarios: FuelScenario[]): Promise<FinancialTransaction | null> {
    console.log('[SettlementService] processFuelSettlement skipped — Finalize-only settlement writer');
    return null;
  },

  /**
   * Processes a gap deduction for unlogged mileage.
   */
  async processGapDeduction(bucket: OdometerBucket): Promise<FinancialTransaction | null> {
    if (!bucket.deductionRecommendation || bucket.deductionRecommendation <= 0) {
      return null;
    }

    // Identify the driver (this is tricky as multiple drivers might have used the car)
    // For simplicity, we assign to the driver of the CLOSING anchor, or the first trip driver.
    // In a real system, you might split it.
    const vehicles = await api.getVehicles();
    const vehicle = vehicles.find(v => v.id === bucket.vehicleId);
    
    // Fallback driverId
    const driverId = vehicle?.assignedDriverId || "fleet_general";

    const deductionTx: Partial<FinancialTransaction> = {
      id: crypto.randomUUID(),
      date: bucket.endDate.split('T')[0],
      time: bucket.endDate.includes('T') ? bucket.endDate.split('T')[1].substring(0, 8) : undefined,
      driverId: driverId,
      vehicleId: bucket.vehicleId,
      type: 'Expense',
      category: 'Fuel',
      description: `Mileage Leakage Deduction: ${bucket.unaccountedDistance}km unlogged`,
      amount: -Math.abs(bucket.deductionRecommendation), // NEGATIVE amount to charge the ledger
      paymentMethod: 'Cash',
      status: 'Approved',
      isReconciled: true,
      metadata: {
        bucketId: bucket.id,
        gapDistance: bucket.unaccountedDistance,
        deductionReason: bucket.deductionReason,
        automated: true,
        transactionType: 'Gap_Deduction'
      }
    };

    return await api.saveTransaction(deductionTx);
  }
};