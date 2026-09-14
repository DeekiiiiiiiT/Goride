/**
 * Shared fuel expense save/purge — Ledgers + Fuel Management parity (R8).
 * Delete cascade lives on the server; edit sync (credit orphan + linked fill) stays here.
 */
import { api } from './api';
import { fuelService } from './fuelService';
import type { FinancialTransaction } from '../types/data';
import type { FuelEntry } from '../types/fuel';

export type FuelExpensePurgeResult = {
  deletedTransactionIds: string[];
  deletedFuelEntryId?: string | null;
  cascaded: boolean;
};

export type FuelExpenseSaveResult = {
  saved: FinancialTransaction;
  syncedFuelEntryId?: string;
  removedFuelCreditId?: string;
};

function isFuelCategory(tx: Pick<FinancialTransaction, 'category'>): boolean {
  return tx.category === 'Fuel' || tx.category === 'Fuel Reimbursement';
}

/**
 * Purge a fuel expense. Server cascades linked fill + fuel-credit-* by default.
 */
export async function purgeFuelExpense(
  tx: FinancialTransaction | { id: string },
  opts: { cascade?: boolean } = {},
): Promise<FuelExpensePurgeResult> {
  const cascade = opts.cascade !== false;
  const res = (await api.deleteTransaction(tx.id, { cascade })) as {
    success?: boolean;
    deletedTransactionIds?: string[];
    deletedFuelEntryId?: string | null;
    cascaded?: boolean;
  };
  const deletedTransactionIds = Array.isArray(res?.deletedTransactionIds)
    ? res.deletedTransactionIds.filter(Boolean)
    : [tx.id];
  return {
    deletedTransactionIds,
    deletedFuelEntryId: res?.deletedFuelEntryId ?? null,
    cascaded: res?.cascaded !== false && cascade,
  };
}

/**
 * Save a fuel expense and keep linked fill / wallet credit consistent.
 */
export async function saveFuelExpense(
  transactionData: FinancialTransaction | Record<string, unknown>,
  opts: {
    previous?: FinancialTransaction | null;
    /** In-memory logs for linked-entry lookup (Fuel Management). */
    fuelEntries?: FuelEntry[];
  } = {},
): Promise<FuelExpenseSaveResult> {
  const savedTx = (await api.saveTransaction(transactionData)) as FinancialTransaction;
  let removedFuelCreditId: string | undefined;
  let syncedFuelEntryId: string | undefined;
  const previous = opts.previous;

  if (previous) {
    const oldPaymentSource = previous.metadata?.paymentSource;
    const actualNewSource = savedTx.metadata?.paymentSource;
    if (
      previous.status === 'Approved' &&
      oldPaymentSource === 'driver_cash' &&
      actualNewSource &&
      actualNewSource !== 'driver_cash'
    ) {
      const creditId = `fuel-credit-${savedTx.id}`;
      try {
        await api.deleteTransaction(creditId, { cascade: false });
        removedFuelCreditId = creditId;
      } catch {
        // Credit may not exist
      }
    }

    if (isFuelCategory(savedTx)) {
      const logs = opts.fuelEntries || [];
      let linkedLog =
        logs.find(
          (l) => l.transactionId === savedTx.id || l.id === savedTx.metadata?.sourceId,
        ) || null;

      if (!linkedLog) {
        const sourceId =
          savedTx.metadata?.fuelEntryId ||
          savedTx.metadata?.sourceId ||
          savedTx.metadata?.linkedFuelId;
        if (sourceId) {
          linkedLog = await fuelService.getFuelEntry(String(sourceId)).catch(() => null);
        }
      }

      if (linkedLog) {
        const updatedLog: FuelEntry = {
          ...linkedLog,
          amount: Math.abs(Number(savedTx.amount) || 0),
          date: String(savedTx.date || '').includes('T')
            ? String(savedTx.date)
            : `${savedTx.date}T${savedTx.time || '12:00:00'}`,
          location: savedTx.vendor || savedTx.merchant || linkedLog.location,
          vendor: savedTx.vendor || savedTx.merchant || linkedLog.vendor,
          matchedStationId:
            savedTx.matchedStationId ||
            (savedTx.metadata?.matchedStationId as string | undefined) ||
            linkedLog.matchedStationId,
          driverId: savedTx.driverId || linkedLog.driverId,
          vehicleId: savedTx.vehicleId || linkedLog.vehicleId,
          odometer: savedTx.odometer || linkedLog.odometer,
          liters: savedTx.quantity || linkedLog.liters,
          metadata: {
            ...linkedLog.metadata,
            isEdited: true,
            lastEditedAt: new Date().toISOString(),
            syncSource: 'financial_transaction',
            editReason: 'Financial record reconciliation sync',
          },
        };

        if (updatedLog.liters && updatedLog.liters > 0) {
          updatedLog.pricePerLiter = Number((updatedLog.amount / updatedLog.liters).toFixed(3));
          if (updatedLog.metadata) {
            updatedLog.metadata.pricePerLiter = updatedLog.pricePerLiter;
          }
        }

        await fuelService.saveFuelEntry(updatedLog);
        syncedFuelEntryId = updatedLog.id;
      }
    }
  }

  return { saved: savedTx, syncedFuelEntryId, removedFuelCreditId };
}
