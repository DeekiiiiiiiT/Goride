/**
 * Dashboard Log cash quick action — rideshare Layer B only.
 * Triggers are separate (header mounts twice); this host owns picker + modal once.
 */
import { useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Banknote, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  CashGateError,
  useCashCollection,
  type CashDriver,
} from '../../hooks/useCashCollection';
import { usePermissions } from '../../hooks/usePermissions';
import { SettlementCommandApiError, isSettlementCommandUnavailable } from '../../services/settlementCommandsApi';
import { formatJMD } from '../../utils/formatJMD';
import { LogCashPaymentModal } from '../drivers/LogCashPaymentModal';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '../ui/responsive-dialog';

export type LogCashNavigate = (page: string, opts?: { weekKey: string }) => void;

export type LogCashOpenRequest = {
  driverId: string;
  driverName: string;
  nonce: number;
};

type TriggerProps = {
  variant: 'desktop' | 'mobile';
  onClick: () => void;
  /** When false, render nothing (permission / delivery gate). */
  visible?: boolean;
};

/** Outline / icon buttons — safe to mount in duplicated headerActions. */
export function LogCashTrigger({ variant, onClick, visible = true }: TriggerProps) {
  if (!visible) return null;
  if (variant === 'desktop') {
    return (
      <Button
        type="button"
        variant="outline"
        className="h-10 rounded-lg border-emerald-200 bg-white px-4 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900/50 dark:bg-transparent dark:text-emerald-400 dark:hover:bg-emerald-950/40"
        onClick={onClick}
      >
        <Banknote className="mr-2 h-4 w-4" />
        Log cash
      </Button>
    );
  }
  return (
    <Button
      type="button"
      size="icon"
      aria-label="Log cash from a driver"
      className="h-10 w-10 shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 md:hidden dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
      onClick={onClick}
    >
      <Banknote className="h-5 w-5" />
    </Button>
  );
}

type HostProps = {
  onNavigate?: LogCashNavigate;
  /** Controlled picker open from header triggers. */
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  /** Row-level open — skips picker when the driver has a collectable week. */
  openRequest?: LogCashOpenRequest | null;
  onOpenRequestHandled?: () => void;
  /** Push collectability map for row-menu disable + tooltip (after queue loads). */
  onGateMapChange?: (
    map: Record<string, { collectable: boolean; reason?: string }>,
  ) => void;
};

function oldestWeekLabel(d: CashDriver): string {
  const oldest = [...d.weeks].sort((a, b) => a.periodAnchor.localeCompare(b.periodAnchor))[0];
  if (!oldest) return '';
  try {
    return format(parseISO(`${oldest.periodEnd}T12:00:00`), 'MMM d');
  } catch {
    return oldest.periodEnd;
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/** Single host for picker + payment modal (mount once on Dashboard). */
export function LogCashQuickActionHost({
  onNavigate,
  pickerOpen,
  onPickerOpenChange,
  openRequest,
  onOpenRequestHandled,
  onGateMapChange,
}: HostProps) {
  const { can } = usePermissions();
  const canCollect = can('settlements.collect');
  const cash = useCashCollection({ enabled: canCollect });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CashDriver | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingRowOpen, setPendingRowOpen] = useState<LogCashOpenRequest | null>(null);

  // Sync external picker open into the hook so the queue stays lazy until needed.
  useEffect(() => {
    if (!canCollect) return;
    cash.setPickerOpen(pickerOpen || Boolean(pendingRowOpen));
  }, [pickerOpen, pendingRowOpen, canCollect]); // eslint-disable-line react-hooks/exhaustive-deps

  // After queue loads, publish per-driver gate map for row menus.
  useEffect(() => {
    if (!onGateMapChange || !canCollect) return;
    const rows = cash.rawRows;
    if (rows.length === 0 && !cash.pickerOpen) return;
    const map: Record<string, { collectable: boolean; reason?: string }> = {};
    const seen = new Set<string>();
    for (const d of cash.drivers) {
      map[d.driverId] = { collectable: true };
      seen.add(d.driverId);
    }
    for (const r of rows) {
      if (seen.has(r.driverId)) continue;
      const reason = cash.blockReasonForDriver(r.driverId);
      if (reason) {
        map[r.driverId] = { collectable: false, reason };
        seen.add(r.driverId);
      }
    }
    onGateMapChange(map);
  }, [cash.drivers, cash.rawRows, cash.pickerOpen, canCollect, onGateMapChange]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cash.drivers;
    return cash.drivers.filter(
      (d) =>
        d.driverName.toLowerCase().includes(q) || d.driverId.toLowerCase().includes(q),
    );
  }, [cash.drivers, search]);

  const closePicker = () => {
    onPickerOpenChange(false);
    setSearch('');
  };

  const openModalFor = (d: CashDriver) => {
    setSelected(d);
    setModalOpen(true);
    closePicker();
  };

  useEffect(() => {
    if (!canCollect || !openRequest) return;
    setPendingRowOpen(openRequest);
    onPickerOpenChange(true);
  }, [openRequest?.nonce, canCollect]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canCollect || !pendingRowOpen || cash.isLoading || cash.isFetching) return;
    // Wait until queue has settled after open.
    if (!cash.pickerOpen && pickerOpen) return;
    const d = cash.findDriver(pendingRowOpen.driverId);
    if (d) {
      openModalFor(d);
      setPendingRowOpen(null);
      onOpenRequestHandled?.();
      return;
    }
    // Only toast after we have a response (not still empty loading).
    if (cash.isLoading) return;
    const reason =
      cash.blockReasonForDriver(pendingRowOpen.driverId) ||
      'No collectable cash for this driver right now';
    toast.error(reason, {
      action: onNavigate
        ? {
            label: 'Open Settlements',
            onClick: () => onNavigate('driver-settlements'),
          }
        : undefined,
    });
    closePicker();
    setPendingRowOpen(null);
    onOpenRequestHandled?.();
  }, [pendingRowOpen, cash.isLoading, cash.isFetching, cash.drivers, canCollect]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = async (payment: {
    amount: number;
    notes: string;
    paymentMethod: string;
    referenceNumber?: string;
    transactionType: 'payment' | 'float' | 'adjustment';
    workPeriodStart?: string;
    workPeriodEnd?: string;
  }) => {
    if (!selected) return;
    if (payment.transactionType !== 'payment') {
      toast.error('Dashboard Log cash only records payments');
      throw new Error('payment_only');
    }
    const weekAnchor = String(payment.workPeriodStart || '').slice(0, 10);
    const week = selected.weeks.find((w) => w.periodAnchor === weekAnchor);
    const expectedOutstanding = week?.owedMajor ?? selected.totalOwed;
    const beforeAmt = expectedOutstanding;
    try {
      const res = await cash.collect({
        driverId: selected.driverId,
        weekAnchor,
        amount: Math.abs(Number(payment.amount) || 0),
        expectedOutstanding,
        method: payment.paymentMethod,
        reference: payment.referenceNumber,
        note: payment.notes,
      });
      const afterAmt =
        res.afterOwed != null
          ? res.afterOwed
          : Math.max(0, beforeAmt - Math.abs(Number(payment.amount) || 0));
      toast.success(
        `Collected ${formatJMD(payment.amount, 2)} — ${selected.driverName} now owes ${formatJMD(afterAmt, 2)}`,
        { duration: 7000 },
      );
      setModalOpen(false);
      setSelected(null);
    } catch (err) {
      if (err instanceof CashGateError) {
        setModalOpen(false);
        setSelected(null);
        const msg =
          err.code === 'PERIOD_FROZEN'
            ? 'Week closed — reopen it in Close Week'
            : 'Fuel/toll not cleared for this week';
        toast.error(msg, {
          action: onNavigate
            ? {
                label: 'Open Close Week',
                onClick: () => onNavigate('close-week', { weekKey: err.weekAnchor }),
              }
            : undefined,
        });
        return;
      }
      if (err instanceof SettlementCommandApiError && err.status === 409) {
        toast.error('Amount changed — refresh', {
          action: {
            label: 'Refresh',
            onClick: () => {
              void cash.refetch();
            },
          },
        });
        await cash.refetch();
        throw err;
      }
      if (isSettlementCommandUnavailable(err)) {
        toast.error('Settlement commands unavailable — redeploy fleet-server');
      }
      throw err;
    }
  };

  if (!canCollect) return null;

  const newest = selected?.weeks[0];
  const showPicker = pickerOpen && !modalOpen && !pendingRowOpen;

  return (
    <>
      <ResponsiveDialog
        open={showPicker}
        onOpenChange={(open) => {
          if (!open) closePicker();
          else onPickerOpenChange(true);
        }}
      >
        <ResponsiveDialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-md">
          <ResponsiveDialogHeader className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <ResponsiveDialogTitle>Log cash</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Pick a driver who owes collectable cash this week.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search drivers"
                className="h-10 rounded-lg pl-9"
                aria-label="Search drivers with cash outstanding"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {cash.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="space-y-3 px-3 py-10 text-center">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {cash.hasBlockedOutstanding
                    ? 'Cash is outstanding but no week is collectable yet'
                    : 'No driver has cash outstanding right now.'}
                </p>
                {cash.hasBlockedOutstanding && onNavigate ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9"
                    onClick={() => {
                      closePicker();
                      onNavigate('driver-settlements');
                    }}
                  >
                    Open Settlements
                  </Button>
                ) : null}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((d) => (
                  <li key={d.driverId}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      onClick={() => openModalFor(d)}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                        {initials(d.driverName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {d.driverName}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {d.weeks.length} week{d.weeks.length === 1 ? '' : 's'}
                          {d.weeks.length > 0 ? ` · oldest ${oldestWeekLabel(d)}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {formatJMD(d.totalOwed, 2)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {selected ? (
        <LogCashPaymentModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setSelected(null);
          }}
          onSave={handleSave}
          driverName={selected.driverName}
          cashOwed={selected.totalOwed}
          periods={cash.periodsFor(selected)}
          initialWorkPeriodStart={newest?.periodAnchor}
          initialWorkPeriodEnd={newest?.periodEnd}
          initialAmount={newest?.owedMajor}
          allowedTypes={['payment']}
        />
      ) : null}
    </>
  );
}
