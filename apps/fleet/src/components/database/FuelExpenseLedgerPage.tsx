/**
 * Ledgers › Fuel Expenses — Approved/Rejected fuel expense & reimbursement rows (KV).
 * Distinct from Fuel Ledger (fuel_entry fills).
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import {
  purgeFuelExpense,
  saveFuelExpense,
} from '../../services/fuelExpenseMutationService';
import { useLedgerPeriod } from '../../contexts/LedgerPeriodContext';
import { usePermissions } from '../../hooks/usePermissions';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { SubmitExpenseModal } from '../fuel/SubmitExpenseModal';
import type { FinancialTransaction } from '../../types/data';
import { isFuelExpenseLedgerVisibleRow } from '../../utils/fuelExpenseLedgerFilter';

function txYmd(t: FinancialTransaction): string {
  const raw = String(t.date || '');
  if (raw.includes('T')) return raw.split('T')[0] || '';
  return raw.slice(0, 10);
}

function canManualEdit(t: FinancialTransaction): boolean {
  const src = t.metadata?.source;
  return (
    src === 'Manual' ||
    src === 'Bulk Manual' ||
    src === 'Manual Request' ||
    !src
  );
}

export function FuelExpenseLedgerPage() {
  const { period } = useLedgerPeriod();
  const { can } = usePermissions();
  const queryClient = useQueryClient();
  const startDate = period.startDate || '2020-01-01';
  const endDate = period.endDate || new Date().toISOString().slice(0, 10);

  const [selected, setSelected] = useState<FinancialTransaction | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialTransaction | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: transactions = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['fuel-expense-ledger', startDate, endDate],
    queryFn: () => api.getAllTransactionsInRange({ startDate, endDate }),
    staleTime: 30_000,
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-roster-fuel-expense-ledger'],
    queryFn: () => api.getDrivers(),
    staleTime: 60_000,
    enabled: editOpen,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['vehicles-fuel-expense-ledger'],
    queryFn: () => api.getVehicles(),
    staleTime: 60_000,
    enabled: editOpen,
  });

  const rows = useMemo(() => {
    return (transactions as FinancialTransaction[])
      .filter((t) => isFuelExpenseLedgerVisibleRow(t))
      .sort((a, b) => txYmd(b).localeCompare(txYmd(a)));
  }, [transactions]);

  const canEdit = can('fuel.edit_entry');
  const canDelete = can('fuel.delete_entry');

  const openDetail = (t: FinancialTransaction) => {
    setSelected(t);
    setDetailOpen(true);
  };

  const startEdit = (t: FinancialTransaction) => {
    setDetailOpen(false);
    setEditing(t);
    setEditOpen(true);
  };

  const handleSave = async (transactionData: unknown) => {
    const result = await saveFuelExpense(transactionData as FinancialTransaction, {
      previous: editing,
    });
    const bits: string[] = ['Fuel expense updated'];
    if (result.syncedFuelEntryId) bits.push('linked fill synced');
    if (result.removedFuelCreditId) bits.push('wallet credit removed');
    toast.success(bits.join(' — '));
    setEditOpen(false);
    setEditing(null);
    await queryClient.invalidateQueries({ queryKey: ['fuel-expense-ledger'] });
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const tx =
      selected?.id === deleteId
        ? selected
        : (transactions as FinancialTransaction[]).find((t) => t.id === deleteId);
    if (!tx) {
      setDeleteId(null);
      return;
    }
    setDeleting(true);
    try {
      const result = await purgeFuelExpense(tx, { cascade: true });
      const n = result.deletedTransactionIds.length;
      toast.success(
        result.deletedFuelEntryId
          ? `Purged ${n} ledger row(s) and linked fill-up`
          : `Removed ${n} ledger row(s)`,
        {
          description: result.deletedFuelEntryId
            ? 'Linked fill-up and related wallet credit were cleared to keep money records aligned.'
            : 'No linked fill-up was found for this row.',
        },
      );
      setDeleteId(null);
      setDetailOpen(false);
      setSelected(null);
      await queryClient.invalidateQueries({ queryKey: ['fuel-expense-ledger'] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Delete failed';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading fuel expenses…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm text-rose-800">
        Could not load fuel expenses.{' '}
        <button type="button" className="underline font-medium" onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm text-slate-700">
        <p className="font-medium text-slate-800">Fuel expenses (accounting)</p>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Approved or rejected fuel claims and Expense lines. Click a row for details, edit, or
          delete where allowed. Posted fill-ups live under Fuel Ledger / Transaction Logs.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-slate-200 bg-white p-8 text-center space-y-2">
          <p className="text-sm text-slate-600">No fuel expense lines in this period.</p>
          <p className="text-xs text-slate-400">Widen the shared ledger period if you expect rows here.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow
                  key={t.id}
                  className="cursor-pointer hover:bg-slate-50"
                  onClick={() => openDetail(t)}
                >
                  <TableCell className="whitespace-nowrap">{txYmd(t)}</TableCell>
                  <TableCell>{t.driverName || t.driverId || '—'}</TableCell>
                  <TableCell>{t.vehiclePlate || t.vehicleId || '—'}</TableCell>
                  <TableCell>{t.vendor || '—'}</TableCell>
                  <TableCell className="text-xs text-slate-600">{t.type || '—'}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {Math.abs(Number(t.amount) || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        t.status === 'Approved'
                          ? 'bg-emerald-100 text-emerald-800 border-0'
                          : 'bg-rose-100 text-rose-800 border-0'
                      }
                    >
                      {t.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Fuel expense detail</DialogTitle>
            <DialogDescription>
              Accounting record for this fuel claim or expense line.
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500">Date</p>
                  <p className="font-medium">{txYmd(selected)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Status</p>
                  <Badge
                    variant="secondary"
                    className={
                      selected.status === 'Approved'
                        ? 'bg-emerald-100 text-emerald-800 border-0'
                        : 'bg-rose-100 text-rose-800 border-0'
                    }
                  >
                    {selected.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Driver</p>
                  <p className="font-medium">{selected.driverName || selected.driverId || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Vehicle</p>
                  <p className="font-medium">{selected.vehiclePlate || selected.vehicleId || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Vendor</p>
                  <p className="font-medium">{selected.vendor || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Amount</p>
                  <p className="font-medium tabular-nums">
                    {Math.abs(Number(selected.amount) || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Type</p>
                  <p className="font-medium">{selected.type || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Payment</p>
                  <p className="font-medium">{selected.paymentMethod || '—'}</p>
                </div>
              </div>
              {selected.description ? (
                <div>
                  <p className="text-xs text-slate-500">Description</p>
                  <p className="text-slate-700 bg-slate-50 rounded p-2">{selected.description}</p>
                </div>
              ) : null}
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <div className="flex gap-2 mr-auto">
              {canEdit && selected && canManualEdit(selected) && (
                <Button type="button" variant="outline" onClick={() => startEdit(selected)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </Button>
              )}
              {canDelete && selected && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setDeleteId(selected.id)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
            </div>
            <Button type="button" variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editOpen && (
        <SubmitExpenseModal
          isOpen={editOpen}
          onClose={() => {
            setEditOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
          drivers={drivers}
          vehicles={vehicles}
          initialData={editing}
          canApproveFuel={false}
        />
      )}

      <AlertDialog open={Boolean(deleteId)} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this fuel expense?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the accounting row and also clears the linked fill-up and any related
              wallet credit when they exist — so money records stay aligned. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
