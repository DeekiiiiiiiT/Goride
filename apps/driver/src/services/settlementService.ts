import { api, fetchWithRetry } from './api';
import { FuelEntry, FuelScenario, WeeklyFuelReport } from '../types/fuel';
import { FinancialTransaction } from '../types/data';
import { FuelCalculationService } from './fuelCalculationService';
import { format } from 'date-fns';
import { API_ENDPOINTS } from './apiConfig';
import { publicAnonKey } from '../utils/supabase/info';

/**
 * Service to handle automated financial settlements for fuel and other expenses.
 * Specifically handles the logic of crediting drivers for out-of-pocket expenses
 * paid with RideShare cash.
 */
export const settlementService = {
  // --- Phase 4: Commit Weekly Statement ---
  async commitWeeklyStatement(report: WeeklyFuelReport, entries: FuelEntry[]): Promise<void> {
    try {
        // 1. Fetch dependencies
        const [vehicles, scenariosResponse] = await Promise.all([
            api.getVehicles(),
            fetchWithRetry(`${API_ENDPOINTS.fuel}/scenarios`, {
                headers: { 'Authorization': `Bearer ${publicAnonKey}` }
            })
        ]);
        
        if (!scenariosResponse.ok) throw new Error("Failed to fetch scenarios");
        const scenarios: FuelScenario[] = await scenariosResponse.json();
        const vehicle = vehicles.find(v => v.id === report.vehicleId);
        
        if (!vehicle) throw new Error(`Vehicle ${report.vehicleId} not found`);

        // 2. Determine Active Scenario
        const activeScenario = scenarios.find(s => s.id === vehicle.fuelScenarioId) || 
                               scenarios.find(s => s.isDefault) || 
                               scenarios[0];

        // Helper for coverage (duplicated from FuelCalculationService to ensure consistency)
        const getCoverage = (category: 'rideShare' | 'companyUsage' | 'deadhead' | 'personal' | 'misc', amount: number) => {
            if (!activeScenario) return { company: amount, driver: 0 };
            
            const rule = activeScenario.rules.find(r => r.category === 'Fuel');
            if (!rule) return { company: amount, driver: 0 };

            let coveragePercent = rule.coverageValue;
            if (category === 'rideShare' && rule.rideShareCoverage !== undefined) coveragePercent = rule.rideShareCoverage;
            if (category === 'companyUsage' && rule.companyUsageCoverage !== undefined) coveragePercent = rule.companyUsageCoverage;
            if (category === 'deadhead' && rule.deadheadCoverage !== undefined) coveragePercent = rule.deadheadCoverage;
            else if (category === 'deadhead' && rule.companyUsageCoverage !== undefined) coveragePercent = rule.companyUsageCoverage;
            if (category === 'personal' && rule.personalCoverage !== undefined) coveragePercent = rule.personalCoverage;
            if (category === 'misc' && rule.miscCoverage !== undefined) coveragePercent = rule.miscCoverage;

            if (rule.coverageType === 'Full') {
                return { company: amount, driver: 0 };
            } else if (rule.coverageType === 'Percentage') {
                const companyPay = amount * (coveragePercent / 100);
                return { company: companyPay, driver: amount - companyPay };
            } else if (rule.coverageType === 'Fixed_Amount') {
                const companyPay = Math.min(amount, rule.coverageValue);
                return { company: companyPay, driver: amount - companyPay };
            }
            return { company: amount, driver: 0 };
        };

        // 3. Process each entry
        for (const entry of entries) {
            // Skip already reconciled
            if (entry.reconciliationStatus === 'Verified' || entry.reconciliationStatus === 'Archived') continue;

            // Apply the 'rideShare' rule as the primary split for the entry
            const split = getCoverage('rideShare', entry.amount); 
            
            let walletPayment: Partial<FinancialTransaction> | null = null;
            let payoutDeduction: Partial<FinancialTransaction> | null = null;
            
            if (entry.paymentSource === 'Gas_Card') {
                // Case A: Company Paid (Gas Card)
                // We only need to deduct the driver's portion from their paycheck.
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
                // Case B: Driver Paid (RideShare Cash)
                // 1. Credit the WALLET for the FULL amount spent (because that cash is gone).
                walletPayment = {
                    type: 'Payment_Received',
                    category: 'Fuel Reimbursement',
                    description: `Fuel Credit: Spent cash on ${entry.location || 'Fuel'}`,
                    amount: Math.abs(entry.amount),
                    paymentMethod: 'Cash',
                    metadata: { isFuelCredit: true }
                };

                // 2. Deduct the DRIVER'S SHARE from their payout.
                if (split.driver > 0.01) {
                    payoutDeduction = {
                        type: 'Expense',
                        category: 'Fuel Deduction',
                        description: `Fuel Deduction: Driver Share of ${entry.location || 'Fuel'}`,
                        amount: -Math.abs(split.driver),
                        paymentMethod: 'Cash',
                    };
                }
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
                        // Enterprise Sync: Attach work period for correct weekly bucketing
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
                reconciliationStatus: 'Verified',
                transactionId: savedTxId || entry.transactionId, // Keep old if exists, else new
                metadata: {
                    ...entry.metadata,
                    finalizedAt: new Date().toISOString(),
                    finalizedByReport: report.id,
                    splitApplied: split
                }
            };

            await fetchWithRetry(`${API_ENDPOINTS.fuel}/fuel-entries`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${publicAnonKey}`
                },
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
    const allTransactions = await api.getTransactions();
    
    // 1. Primary Match: Explicit Metadata Links
    const explicitMatches = allTransactions.filter(t => 
      t.metadata?.sourceId === fuelEntry.id || 
      t.metadata?.linkedFuelId === fuelEntry.id ||
      t.id === fuelEntry.transactionId
    );

    // 2. Secondary Match: Signature/Fingerprint Matching
    // Matches transactions by Vehicle, Date, and Amount (handling both Debit and Credit variants)
    const entryDate = fuelEntry.date.split('T')[0];
    const signatureMatches = allTransactions.filter(t => {
      // Skip if already found in explicit matches
      if (explicitMatches.some(em => em.id === t.id)) return false;

      const sameVehicle = t.vehicleId === fuelEntry.vehicleId;
      const sameDate = t.date === entryDate;
      
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
    const fuelEntries = await fuelService.getFuelEntries();
    
    // 1. Explicit Link
    const sourceId = transaction.metadata?.sourceId || transaction.metadata?.linkedFuelId;
    if (sourceId) {
      const match = fuelEntries.find(e => e.id === sourceId);
      if (match) return match;
    }

    // 2. Fingerprint Match
    const txDate = transaction.date;
    const absTxAmount = Math.abs(transaction.amount);
    
    return fuelEntries.find(e => {
      const sameVehicle = e.vehicleId === transaction.vehicleId;
      const sameDate = e.date.split('T')[0] === txDate;
      const sameAmount = Math.abs(e.amount) === absTxAmount || 
                         (transaction.metadata?.totalCost && Math.abs(e.amount) === Math.abs(transaction.metadata.totalCost));
      
      return sameVehicle && sameDate && sameAmount;
    }) || null;
  },

  /**
   * Processes a fuel entry and creates the corresponding financial settlement
   * if it was paid with RideShare cash.
   */
  async processFuelSettlement(entryOrTx: FuelEntry | FinancialTransaction, scenarios: FuelScenario[]): Promise<FinancialTransaction | null> {
    // 1. Normalize input (Handle both FuelEntry and FinancialTransaction)
    let driverId = '';
    let vehicleId = '';
    let amount = 0;
    let date = '';
    let location = '';
    let liters = 0;
    let paymentSource = '';
    let entryId = '';
    let existingTxId: string | undefined;

    if ('paymentSource' in entryOrTx) {
      // It's a FuelEntry
      const entry = entryOrTx as FuelEntry;
      driverId = entry.driverId || '';
      vehicleId = entry.vehicleId || '';
      amount = entry.amount || 0;
      date = entry.date;
      location = entry.location || '';
      liters = entry.liters || 0;
      paymentSource = entry.paymentSource;
      entryId = entry.id;
      existingTxId = entry.transactionId;
    } else {
      // It's a FinancialTransaction (likely coming from a manual approval flow)
      const tx = entryOrTx as FinancialTransaction;
      driverId = tx.driverId || '';
      vehicleId = tx.vehicleId || '';
      amount = Math.abs(tx.amount || 0);
      date = tx.date;
      location = tx.merchant || tx.description || '';
      liters = tx.quantity || 0;
      entryId = tx.id;
      existingTxId = tx.id; // If it's already a tx, we might be updating it
      
      if (tx.paymentMethod === 'Cash' || tx.type === 'Reimbursement') {
        paymentSource = 'RideShare_Cash';
      }
    }

    // 2. Check if this is a cash-based settlement candidate
    if (paymentSource !== 'RideShare_Cash') {
      return null;
    }

    if (!driverId || !vehicleId) {
        console.warn("[SettlementService] Missing driver or vehicle ID for settlement.");
        return null;
    }

    // 3. Identify the active scenario for the vehicle
    const [vehicles, allDrivers, allTransactions] = await Promise.all([
      api.getVehicles(),
      api.getDrivers(),
      api.getTransactions()
    ]);
    
    const vehicle = vehicles.find(v => v.id === vehicleId);
    const driver = allDrivers.find(d => d.id === driverId);
    
    if (!vehicle) {
      console.warn(`[SettlementService] Vehicle ${vehicleId} not found for settlement.`);
      return null;
    }

    const activeScenario = scenarios.find(s => s.id === vehicle.fuelScenarioId) || 
                          scenarios.find(s => s.isDefault) || 
                          scenarios[0];

    if (!activeScenario) {
      console.warn(`[SettlementService] No fuel scenario found for settlement.`);
      return null;
    }

    // 4. Calculate Company Share
    const fuelRule = activeScenario.rules.find(r => r.category === 'Fuel');
    let creditAmount = 0;

    if (fuelRule) {
      if (fuelRule.coverageType === 'Full') {
        creditAmount = amount;
      } else if (fuelRule.coverageType === 'Percentage') {
        const percent = fuelRule.rideShareCoverage !== undefined ? fuelRule.rideShareCoverage : fuelRule.coverageValue;
        creditAmount = amount * (percent / 100);
      } else if (fuelRule.coverageType === 'Fixed_Amount') {
        creditAmount = Math.min(amount, fuelRule.coverageValue);
      }
    } else {
      creditAmount = amount;
    }

    if (creditAmount <= 0) return null;

    // 5. Phase 4: Automated Settlement Validation & Audit
    let auditFlags: string[] = [];
    let reconciliationStatus: 'Verified' | 'Flagged' | 'Observing' = 'Verified';

    // Validation: Suspicious Fuel Volume
    if (liters > 100) {
        auditFlags.push("High volume (>100L) detected");
        reconciliationStatus = 'Flagged';
    }

    // Validation: Suspicious Price Per Liter (assuming USD/standard range)
    const pPl = amount / (liters || 1);
    if (pPl > 5 || pPl < 0.5) {
        auditFlags.push(`Suspicious price per liter: $${pPl.toFixed(2)}`);
        reconciliationStatus = 'Flagged';
    }

    // Validation: Duplicate Check (Same driver, vehicle, and date/time/amount)
    const isDuplicate = allTransactions.some(t => 
        t.driverId === driverId && 
        t.vehicleId === vehicleId && 
        t.date === date.split('T')[0] && 
        Math.abs(t.amount) === amount && 
        t.id !== entryId && 
        t.metadata?.sourceId !== entryId
    );

    if (isDuplicate) {
        auditFlags.push("Possible duplicate transaction detected");
        reconciliationStatus = 'Flagged';
    }

    // 6. Check for existing settlement transaction to avoid duplicates during edits
    // IMPORTANT: The settlement is a SEPARATE transaction from the expense.
    // If we're passed a transaction, we shouldn't use its ID as our settlement ID.
    const settlementTxId = (entryOrTx as any).metadata?.settlementTxId || 
                          allTransactions.find(t => t.metadata?.sourceId === entryId && t.type === 'Reimbursement')?.id || 
                          crypto.randomUUID();

    // 7. Create or Update the Financial Transaction (Credit)
    const settlementTx: Partial<FinancialTransaction> = {
      id: settlementTxId,
      date: date.split('T')[0],
      time: date.includes('T') ? date.split('T')[1].substring(0, 8) : (entryOrTx as any).time || undefined,
      driverId: driverId,
      driverName: driver?.name || 'Unknown Driver',
      vehicleId: vehicleId,
      type: 'Reimbursement',
      category: 'Fuel Reimbursement',
      description: `Fuel Reimbursement: ${location || 'Unknown Station'}${liters ? ` - ${liters}L @ $${(amount / liters).toFixed(3)}/L` : ''}`,
      merchant: location,
      amount: Number(creditAmount.toFixed(2)), 
      paymentMethod: 'Cash',
      status: reconciliationStatus === 'Flagged' ? 'Pending' : 'Approved', 
      quantity: liters,
      isReconciled: reconciliationStatus === 'Verified',
      metadata: {
        sourceId: entryId,
        settlementType: 'RideShare_Cash_Offset',
        scenarioId: activeScenario.id,
        totalCost: amount,
        coveragePercent: (creditAmount / amount) * 100,
        automated: true,
        auditFlags: auditFlags.length > 0 ? auditFlags : undefined,
        reconciliationStatus: reconciliationStatus,
        // Carry over audit flags if it's an update
        isEdited: (entryOrTx as any).metadata?.isEdited,
        lastEditedAt: (entryOrTx as any).metadata?.lastEditedAt,
        editReason: (entryOrTx as any).metadata?.editReason,
        syncSource: 'fuel_log',
        // Phase 3: Preservation of Manual Origin
        isManual: true,
        portal_type: 'Manual_Entry'
      }
    };

    return await api.saveTransaction(settlementTx);
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