/**
 * Payment / write-off / payout / delete dialogs for Driver Detail.
 * Modal open state lives here; parent opens via setters returned from useDriverDetailModals.
 * Namespace React — Vite HMR must not TDZ useState (ROAM-FLEET-1X).
 */
import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Button } from '../ui/button';
import { LogCashPaymentModal } from './LogCashPaymentModal';
import { CashWriteOffModal, type CashWriteOffSavePayload } from './CashWriteOffModal';
import { RecordPayoutModal, type RecordPayoutSavePayload } from './RecordPayoutModal';
import { PermissionGate } from '../auth/PermissionGate';
import type { FinancialTransaction } from '../../types/data';
import {
  isCashWriteOffTransaction,
  isDriverPayoutTransaction,
} from '../../utils/driverCashPayment';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import * as Lucide from 'lucide-react';
import { toast } from 'sonner';

const { Stethoscope } = Lucide;

export type PaymentModalState = {
  isOpen: boolean;
  initialWorkPeriodStart?: string;
  initialWorkPeriodEnd?: string;
  initialAmount?: number;
  editingTransaction?: FinancialTransaction;
};

export type WriteOffModalState = {
  isOpen: boolean;
  workPeriodStart: string;
  workPeriodEnd: string;
  maxAmount: number;
};

export type PayoutModalState = {
  isOpen: boolean;
  workPeriodStart: string;
  workPeriodEnd: string;
  maxAmount: number;
};

export function useDriverDetailModals() {
  const [paymentModalState, setPaymentModalState] = React.useState<PaymentModalState>({
    isOpen: false,
  });
  const [writeOffModalState, setWriteOffModalState] = React.useState<WriteOffModalState>({
    isOpen: false,
    workPeriodStart: '',
    workPeriodEnd: '',
    maxAmount: 0,
  });
  const [payoutModalState, setPayoutModalState] = React.useState<PayoutModalState>({
    isOpen: false,
    workPeriodStart: '',
    workPeriodEnd: '',
    maxAmount: 0,
  });
  const [transactionToDelete, setTransactionToDelete] = React.useState<string | null>(null);

  return {
    paymentModalState,
    setPaymentModalState,
    writeOffModalState,
    setWriteOffModalState,
    payoutModalState,
    setPayoutModalState,
    transactionToDelete,
    setTransactionToDelete,
  };
}

type SettlementPeriod = {
  start: Date;
  end: Date;
  amountOwed: number;
  amountPaid: number;
  balance: number;
  status: string;
};

export type DriverDetailModalsProps = {
  driverName: string;
  /** Default cash owed when payment modal has no initialAmount. */
  callOutstanding: number;
  logCashPeriods: SettlementPeriod[];
  transactions: FinancialTransaction[];
  paymentModalState: PaymentModalState;
  setPaymentModalState: React.Dispatch<React.SetStateAction<PaymentModalState>>;
  writeOffModalState: WriteOffModalState;
  setWriteOffModalState: React.Dispatch<React.SetStateAction<WriteOffModalState>>;
  payoutModalState: PayoutModalState;
  setPayoutModalState: React.Dispatch<React.SetStateAction<PayoutModalState>>;
  transactionToDelete: string | null;
  setTransactionToDelete: React.Dispatch<React.SetStateAction<string | null>>;
  onSavePayment: (payment: {
    id?: string;
    amount: number;
    date: string;
    notes: string;
    paymentMethod: string;
    referenceNumber?: string;
    transactionType: 'payment' | 'float' | 'adjustment';
    workPeriodStart?: string;
    workPeriodEnd?: string;
  }) => Promise<void>;
  onSaveCashWriteOff: (payload: CashWriteOffSavePayload) => Promise<void>;
  onSaveDriverPayout: (payload: RecordPayoutSavePayload) => Promise<void>;
  onConfirmDeleteTransaction: () => Promise<void>;
  tripGapDiagOpen: boolean;
  setTripGapDiagOpen: (open: boolean) => void;
  tripGapDiagResult: unknown;
};

export function DriverDetailModals({
  driverName,
  callOutstanding,
  logCashPeriods,
  transactions,
  paymentModalState,
  setPaymentModalState,
  writeOffModalState,
  setWriteOffModalState,
  payoutModalState,
  setPayoutModalState,
  transactionToDelete,
  setTransactionToDelete,
  onSavePayment,
  onSaveCashWriteOff,
  onSaveDriverPayout,
  onConfirmDeleteTransaction,
  tripGapDiagOpen,
  setTripGapDiagOpen,
  tripGapDiagResult,
}: DriverDetailModalsProps) {
  const deleteTarget = transactionToDelete
    ? transactions.find((t) => t.id === transactionToDelete)
    : undefined;
  const deletingWriteOff = isCashWriteOffTransaction(deleteTarget);
  const deletingPayout = isDriverPayoutTransaction(deleteTarget);

  return (
    <>
      {/* Trip ↔ Ledger gap diagnostic (server: GET /ledger/diagnostic-trip-ledger-gap) */}
      <Dialog open={tripGapDiagOpen} onOpenChange={setTripGapDiagOpen}>
        <DialogContent className="max-w-3xl w-full max-h-[85vh] flex flex-col gap-2">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-amber-600" />
              Trip ↔ Ledger diagnostic
            </DialogTitle>
            <DialogDescription>
              Same date range as the overview. Compares completed trips with money to{' '}
              <code className="text-xs">fare_earning</code> rows in{' '}
              <code className="text-xs">ledger_event:*</code> (org scope via server filters).
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 overflow-auto max-h-[60vh] text-xs font-mono leading-relaxed">
            {tripGapDiagResult ? (
              <pre className="whitespace-pre-wrap break-words text-slate-800 dark:text-slate-200">
                {JSON.stringify(tripGapDiagResult, null, 2)}
              </pre>
            ) : (
              <p className="text-slate-500">No data</p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                tripGapDiagResult &&
                navigator.clipboard
                  .writeText(JSON.stringify(tripGapDiagResult, null, 2))
                  .then(() => toast.success('Copied'))
              }
            >
              Copy JSON
            </Button>
            <Button size="sm" onClick={() => setTripGapDiagOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PermissionGate permission="transactions.edit" fallback={null}>
        <LogCashPaymentModal
          isOpen={paymentModalState.isOpen}
          onClose={() => setPaymentModalState({ isOpen: false })}
          onSave={onSavePayment}
          driverName={driverName}
          cashOwed={
            paymentModalState.initialAmount != null
              ? paymentModalState.initialAmount
              : callOutstanding
          }
          initialWorkPeriodStart={paymentModalState.initialWorkPeriodStart}
          initialWorkPeriodEnd={paymentModalState.initialWorkPeriodEnd}
          initialAmount={paymentModalState.initialAmount}
          initialTransaction={paymentModalState.editingTransaction}
          periods={logCashPeriods}
        />
        <CashWriteOffModal
          isOpen={writeOffModalState.isOpen}
          onClose={() =>
            setWriteOffModalState({
              isOpen: false,
              workPeriodStart: '',
              workPeriodEnd: '',
              maxAmount: 0,
            })
          }
          onSave={onSaveCashWriteOff}
          driverName={driverName}
          maxAmount={writeOffModalState.maxAmount}
          workPeriodStart={writeOffModalState.workPeriodStart}
          workPeriodEnd={writeOffModalState.workPeriodEnd}
        />
        <RecordPayoutModal
          isOpen={payoutModalState.isOpen}
          onClose={() =>
            setPayoutModalState({
              isOpen: false,
              workPeriodStart: '',
              workPeriodEnd: '',
              maxAmount: 0,
            })
          }
          onSave={onSaveDriverPayout}
          driverName={driverName}
          maxAmount={payoutModalState.maxAmount}
          workPeriodStart={payoutModalState.workPeriodStart}
          workPeriodEnd={payoutModalState.workPeriodEnd}
        />
      </PermissionGate>
      <PermissionGate permission="transactions.edit" fallback={null}>
        <AlertDialog
          open={!!transactionToDelete}
          onOpenChange={(open) => !open && setTransactionToDelete(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deletingWriteOff
                  ? 'Undo write-off?'
                  : deletingPayout
                    ? 'Undo payout?'
                    : 'Delete Transaction?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deletingWriteOff
                  ? 'This restores the cash still owed for that Settlement Week. Business Finance will update after delete.'
                  : deletingPayout
                    ? 'This restores the fleet-owes balance for that Settlement Week.'
                    : 'Are you sure you want to delete this transaction? This action cannot be undone.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onConfirmDeleteTransaction}
                className="bg-red-600 hover:bg-red-700"
              >
                {deletingWriteOff ? 'Undo write-off' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PermissionGate>
    </>
  );
}
