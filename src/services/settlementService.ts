import { api } from './api';
import { FuelEntry, FuelScenario } from '../types/fuel';
import { FinancialTransaction } from '../types/data';
import { FuelCalculationService } from './fuelCalculationService';
import { format } from 'date-fns';

/**
 * Service to handle automated financial settlements for fuel and other expenses.
 * Specifically handles the logic of crediting drivers for out-of-pocket expenses
 * paid with RideShare cash.
 */
export const settlementService = {
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

    // 5. Check for existing settlement transaction to avoid duplicates during edits
    const existingTx = allTransactions.find(t => 
      t.id === existingTxId || (t.metadata?.sourceId === entryId && t.type === 'Reimbursement')
    );

    // 6. Create or Update the Financial Transaction (Credit)
    const settlementTx: Partial<FinancialTransaction> = {
      id: existingTx?.id || crypto.randomUUID(),
      date: date.split('T')[0],
      time: date.includes('T') ? date.split('T')[1].substring(0, 8) : (existingTx?.time || format(new Date(), 'HH:mm:ss')),
      driverId: driverId,
      driverName: driver?.name || 'Unknown Driver',
      vehicleId: vehicleId,
      type: 'Reimbursement',
      category: 'Fuel Reimbursement',
      description: `Fuel Reimbursement: ${location || 'Unknown Station'} - ${liters}L @ $${(amount/liters).toFixed(3)}/L`,
      merchant: location,
      amount: Number(creditAmount.toFixed(2)), 
      paymentMethod: 'Cash',
      status: 'Approved', 
      quantity: liters,
      isReconciled: true,
      metadata: {
        ...(existingTx?.metadata || {}),
        sourceId: entryId,
        settlementType: 'RideShare_Cash_Offset',
        scenarioId: activeScenario.id,
        totalCost: amount,
        coveragePercent: (creditAmount / amount) * 100,
        automated: true,
        // Carry over audit flags if it's an update
        isEdited: (entryOrTx as any).metadata?.isEdited || existingTx?.metadata?.isEdited,
        lastEditedAt: (entryOrTx as any).metadata?.lastEditedAt || existingTx?.metadata?.lastEditedAt,
        editReason: (entryOrTx as any).metadata?.editReason || existingTx?.metadata?.editReason,
        syncSource: 'fuel_log'
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
      time: bucket.endDate.includes('T') ? bucket.endDate.split('T')[1].substring(0, 8) : format(new Date(), 'HH:mm:ss'),
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
