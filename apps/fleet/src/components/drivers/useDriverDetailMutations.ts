/**
 * Cash / write-off / payout / delete / ledger-repair mutations for Driver Detail.
 * Extracted from DriverDetail (Round 4 Phase 3) — behavior unchanged.
 */
import * as React from 'react';
import { toast } from 'sonner';
import type { QueryKey, QueryClient } from '@tanstack/react-query';
import type { FinancialTransaction, Trip } from '../../types/data';
import type { CashWriteOffSavePayload } from './CashWriteOffModal';
import type { RecordPayoutSavePayload } from './RecordPayoutModal';
import type {
  PaymentModalState,
  WriteOffModalState,
  PayoutModalState,
} from './DriverDetailModals';
import { api } from '../../services/api';
import { trackDriverOpsEvent } from '../../utils/driverOpsEvents';
import { isCashWriteOffTransaction } from '../../utils/driverCashPayment';
import {
  buildCashCollectionTx,
  buildCashWriteOffTx,
  buildDriverPayoutTx,
} from '../../utils/driverSettlementTx';

export type UseDriverDetailMutationsArgs = {
  driverId: string;
  driverName: string;
  driver?: any;
  transactions: FinancialTransaction[];
  rqTollLogs: unknown[];
  allTrips: Trip[];
  txQueryKey: QueryKey;
  queryClient: QueryClient;
  invalidateFinancialPeriods: (driverId: string) => void;
  setLedgerRefreshKey: React.Dispatch<React.SetStateAction<number>>;
  paymentModalState: PaymentModalState;
  setPaymentModalState: React.Dispatch<React.SetStateAction<PaymentModalState>>;
  writeOffModalState: WriteOffModalState;
  payoutModalState: PayoutModalState;
  transactionToDelete: string | null;
  setTransactionToDelete: React.Dispatch<React.SetStateAction<string | null>>;
  ledgerDateRangeStrings: { startDate: string; endDate: string } | null;
  /** Kept for the disabled auto-repair effect deps (parity with prior shell). */
  resolvedFinancialsSource: string;
  resolvedFinancialsMissingPlatforms?: string[];
  ledgerOverviewLoaded: boolean;
};

export function useDriverDetailMutations({
  driverId,
  driverName,
  driver,
  transactions,
  rqTollLogs,
  allTrips,
  txQueryKey,
  queryClient,
  invalidateFinancialPeriods,
  setLedgerRefreshKey,
  paymentModalState: _paymentModalState,
  setPaymentModalState,
  writeOffModalState,
  payoutModalState,
  transactionToDelete,
  setTransactionToDelete,
  ledgerDateRangeStrings,
  resolvedFinancialsSource,
  resolvedFinancialsMissingPlatforms,
  ledgerOverviewLoaded,
}: UseDriverDetailMutationsArgs) {
  void _paymentModalState;

  const [repairInProgress, setRepairInProgress] = React.useState(false);
  const [repairResult, setRepairResult] = React.useState<any>(null);
  const [tripGapDiagOpen, setTripGapDiagOpen] = React.useState(false);
  const [tripGapDiagResult, setTripGapDiagResult] = React.useState<any>(null);
  const [tripGapDiagLoading, setTripGapDiagLoading] = React.useState(false);

  const patchTransactionsCache = (
    updater: (prev: FinancialTransaction[]) => FinancialTransaction[],
  ) => {
    queryClient.setQueryData(txQueryKey, (prev: FinancialTransaction[] | undefined) =>
      updater(Array.isArray(prev) ? prev.filter(Boolean) : []),
    );
  };

  /** Invalidate only — RQ refetch is driven by invalidateQueries (no double-fire). */
  const refreshData = () => {
    void queryClient.invalidateQueries({ queryKey: txQueryKey });
    void queryClient.invalidateQueries({ queryKey: ['driverTollLogs'] });
    void queryClient.invalidateQueries({ queryKey: ['driverFinancialBundle', driverId] });
  };
  void refreshData; // available for header refresh wiring without unused-lint noise until UI binds it

  const handleSavePayment = async (payment: {
    id?: string;
    amount: number;
    date: string;
    notes: string;
    paymentMethod: string;
    referenceNumber?: string;
    transactionType: 'payment' | 'float' | 'adjustment';
    workPeriodStart?: string;
    workPeriodEnd?: string;
  }) => {
    const newTx = buildCashCollectionTx(payment, {
      driverId,
      driverName: driver?.name || driverName,
    });

    if (payment.id) {
      const updatedTx = { ...newTx, id: payment.id };
      await api.saveTransaction(updatedTx);
      patchTransactionsCache((prev) =>
        prev.map((t) => (t.id === payment.id ? ({ ...t, ...updatedTx } as FinancialTransaction) : t)),
      );
    } else {
      const saved = await api.saveTransaction(newTx);
      const savedTx = saved?.data || saved;
      patchTransactionsCache((prev) => [savedTx, ...prev].filter(Boolean));
    }
    void queryClient.invalidateQueries({ queryKey: txQueryKey });
    void invalidateFinancialPeriods(driverId);
  };

  const handleSaveCashWriteOff = async (payload: CashWriteOffSavePayload) => {
    if (payload.amount > writeOffModalState.maxAmount + 0.005) {
      throw new Error(
        `Cannot write off more than cash still owed (${writeOffModalState.maxAmount.toFixed(2)})`,
      );
    }
    const newTx = buildCashWriteOffTx(payload, {
      driverId,
      driverName: driver?.name || driverName,
    });
    const saved = await api.saveTransaction(newTx);
    const savedTx = saved?.data || saved;
    patchTransactionsCache((prev) => [savedTx, ...prev].filter(Boolean));
    void queryClient.invalidateQueries({ queryKey: txQueryKey });
    void invalidateFinancialPeriods(driverId);
    void api
      .appendDriverAudit(driverId, {
        action: 'cash_write_off',
        reason: payload.notes,
        after: savedTx,
      })
      .catch(() => {});
    trackDriverOpsEvent('cash_write_off_success', {
      driverId,
      amount: payload.amount,
    });
  };

  const handleSaveDriverPayout = async (payload: RecordPayoutSavePayload) => {
    if (payload.amount > payoutModalState.maxAmount + 0.005) {
      throw new Error(`Cannot pay more than fleet owes (${payoutModalState.maxAmount.toFixed(2)})`);
    }
    const newTx = buildDriverPayoutTx(payload, {
      driverId,
      driverName: driver?.name || driverName,
    });
    const saved = await api.saveTransaction(newTx);
    const savedTx = saved?.data || saved;
    patchTransactionsCache((prev) => [savedTx, ...prev].filter(Boolean));
    void queryClient.invalidateQueries({ queryKey: txQueryKey });
    void invalidateFinancialPeriods(driverId);
    void api
      .appendDriverAudit(driverId, {
        action: 'driver_payout',
        reason: payload.notes,
        after: savedTx,
      })
      .catch(() => {});
    trackDriverOpsEvent('driver_payout_success', {
      driverId,
      amount: payload.amount,
    });
  };

  const handleEditTransaction = (tx: FinancialTransaction) => {
    setPaymentModalState({
      isOpen: true,
      editingTransaction: tx,
    });
  };

  const handleVerifyTransaction = async (id: string) => {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;

    try {
      const updatedTx = { ...tx, status: 'Verified' as const };
      patchTransactionsCache((prev) => prev.map((t) => (t.id === id ? updatedTx : t)));

      await api.saveTransaction(updatedTx);
      void queryClient.invalidateQueries({ queryKey: txQueryKey });
      void invalidateFinancialPeriods(driverId);
      toast.success('Transaction verified');
    } catch (e) {
      toast.error('Failed to verify transaction');
      patchTransactionsCache((prev) => prev.map((t) => (t.id === id ? tx : t)));
    }
  };

  const confirmDeleteTransaction = async () => {
    if (!transactionToDelete) return;

    const deletedTx = transactions.find((t) => t.id === transactionToDelete);
    const tollIds = new Set((rqTollLogs || []).map((t: any) => t?.id).filter(Boolean));
    const originalRqSlice = transactions.filter((t) => t?.id && !tollIds.has(t.id));
    patchTransactionsCache((prev) => prev.filter((t) => t.id !== transactionToDelete));

    try {
      await api.deleteTransaction(transactionToDelete);
      void queryClient.invalidateQueries({ queryKey: txQueryKey });
      void invalidateFinancialPeriods(driverId);
      void api
        .appendDriverAudit(driverId, {
          action: 'transaction_delete',
          before: deletedTx,
        })
        .catch(() => {});
      toast.success(
        isCashWriteOffTransaction(deletedTx) ? 'Write-off undone' : 'Transaction deleted',
      );
    } catch (e) {
      queryClient.setQueryData(txQueryKey, originalRqSlice);
      toast.error('Failed to delete transaction');
    } finally {
      setTransactionToDelete(null);
    }
  };

  const handleDeleteTransaction = (id: string) => {
    setTransactionToDelete(id);
  };

  // Repair via ensure-from-trip-ids (repair-driver is retired 410).
  const handleRepairLedger = async () => {
    setRepairInProgress(true);
    setRepairResult(null);
    try {
      const clientTripIds = allTrips
        .filter((t) => t?.id && t.status === 'Completed')
        .map((t) => t.id);
      const result = await api.ensureLedgerFromTripIds(clientTripIds);
      const written = Number(result.stats?.ledgerRowsWritten) || 0;
      const loaded = Number(result.stats?.tripsLoaded) || 0;
      setRepairResult({
        success: result.success,
        stats: {
          ledgerRowsWritten: written,
          tripsLoaded: loaded,
          skippedNoMoney: Number(result.stats?.skippedNoMoney) || 0,
          ...result.stats,
        },
        durationMs: result.durationMs,
      });
      setLedgerRefreshKey((k) => k + 1);
      toast.success(
        written > 0
          ? `Ledger ensure wrote ${written} row(s) from ${loaded} trip(s)`
          : `Ledger ensure complete — 0 new rows (${loaded} trip(s) checked)`,
      );
    } catch (err: any) {
      setRepairResult({ success: false, error: err.message });
      toast.error(err?.message || 'Ledger repair failed');
    } finally {
      setRepairInProgress(false);
    }
  };

  const handleTripLedgerGapDiagnostic = async () => {
    if (!ledgerDateRangeStrings) {
      toast.error('Select a date range first');
      return;
    }
    setTripGapDiagLoading(true);
    setTripGapDiagResult(null);
    try {
      const r = await api.getLedgerTripLedgerGapDiagnostic({
        driverId,
        startDate: ledgerDateRangeStrings.startDate,
        endDate: ledgerDateRangeStrings.endDate,
      });
      setTripGapDiagResult(r);
      setTripGapDiagOpen(true);
      if (!r?.success) toast.error(r?.error || 'Diagnostic failed');
    } catch (err: any) {
      toast.error(err?.message || 'Diagnostic failed');
    } finally {
      setTripGapDiagLoading(false);
    }
  };

  // Auto-repair when completeness guard detects missing platforms — disabled (manual button only).
  React.useEffect(() => {
    if (
      resolvedFinancialsSource === 'trips' &&
      (resolvedFinancialsMissingPlatforms?.length ?? 0) > 0 &&
      ledgerOverviewLoaded &&
      !repairInProgress &&
      repairResult === null
    ) {
      // DISABLED: Auto-repair was firing on every date change. Use manual button instead.
      // handleRepairLedger();
    }
  }, [
    resolvedFinancialsSource,
    resolvedFinancialsMissingPlatforms,
    ledgerOverviewLoaded,
    driverId,
    repairInProgress,
    repairResult,
  ]);

  return {
    repairInProgress,
    repairResult,
    tripGapDiagOpen,
    setTripGapDiagOpen,
    tripGapDiagResult,
    tripGapDiagLoading,
    handleSavePayment,
    handleSaveCashWriteOff,
    handleSaveDriverPayout,
    handleEditTransaction,
    handleVerifyTransaction,
    confirmDeleteTransaction,
    handleDeleteTransaction,
    handleRepairLedger,
    handleTripLedgerGapDiagnostic,
  };
}
