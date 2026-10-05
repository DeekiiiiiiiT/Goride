/**
 * Dashboard Log cash quick action — rideshare Layer B only.
 * Triggers are separate (header mounts twice); this host owns picker + modal once.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, Loader2, Plus, Search } from 'lucide-react';
import { DEFAULT_FLEET_TZ, periodKeyFor } from '@roam/finance-core';
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

export type LogCashRosterDriver = { id: string; name: string };

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
  /** Rideshare drivers on the dashboard. The desk shows the first three, not only people who already owe. */
  roster?: LogCashRosterDriver[];
};

const PICKER_PREVIEW = 3;

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
  roster = [],
}: HostProps) {
  const { can } = usePermissions();
  const canCollect = can('settlements.collect');
  const cash = useCashCollection({ enabled: canCollect });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CashDriver | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingRowOpen, setPendingRowOpen] = useState<LogCashOpenRequest | null>(null);
  /** Dashboard button keeps the name list open for the next driver. A row open does not. */
  const [stayInSession, setStayInSession] = useState(false);
  const savedThisOpen = useRef(false);
  /** Ignore the picker closing itself while the amount screen is up. */
  const hidePickerForPayment = useRef(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

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
    for (const person of roster) {
      if (!person.id) continue;
      map[person.id] = { collectable: true };
      seen.add(person.id);
    }
    for (const d of cash.drivers) {
      map[d.driverId] = { collectable: true };
      seen.add(d.driverId);
    }
    for (const r of rows) {
      if (seen.has(r.driverId)) continue;
      if (r.periodFrozen === true) {
        map[r.driverId] = { collectable: false, reason: 'Week closed — reopen it in Close Week' };
        seen.add(r.driverId);
      }
    }
    onGateMapChange(map);
  }, [cash.drivers, cash.rawRows, cash.pickerOpen, canCollect, onGateMapChange, roster]); // eslint-disable-line react-hooks/exhaustive-deps

  const defaultIds = useMemo(
    () => roster.filter((d) => d.id && d.name).slice(0, PICKER_PREVIEW).map((d) => d.id),
    [roster],
  );
  const sessionIds = useMemo(
    () => [...new Set([...defaultIds, ...pinnedIds])],
    [defaultIds, pinnedIds],
  );

  const listedPeople = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = adding
      ? roster.filter((d) => d.id && !sessionIds.includes(d.id))
      : roster.filter((d) => sessionIds.includes(d.id));
    const named = pool.filter((d) => d.name);
    if (!q) return named;
    return named.filter(
      (d) => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q),
    );
  }, [adding, roster, search, sessionIds]);

  const asCashDriver = (id: string, name: string): CashDriver =>
    cash.findDriver(id) ?? {
      driverId: id,
      driverName: name,
      totalOwed: 0,
      weeks: [],
      blockedCount: 0,
    };

  const closePicker = () => {
    onPickerOpenChange(false);
    setSearch('');
    setStayInSession(false);
    setPinnedIds([]);
    setAdding(false);
  };

  const openModalFor = (d: CashDriver, opts?: { stayInSession?: boolean }) => {
    savedThisOpen.current = false;
    setStayInSession(Boolean(opts?.stayInSession));
    setSelected(d);
    setModalOpen(true);
    if (opts?.stayInSession) hidePickerForPayment.current = true;
    else closePicker();
  };

  const leavePayment = () => {
    hidePickerForPayment.current = false;
    const saved = savedThisOpen.current;
    savedThisOpen.current = false;
    setModalOpen(false);
    setSelected(null);
    if (!stayInSession) {
      closePicker();
      return;
    }
    if (saved) setSearch('');
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
    const d = asCashDriver(pendingRowOpen.driverId, pendingRowOpen.driverName);
    openModalFor(d);
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
      const err = new Error('payment_only');
      (err as Error & { quiet?: boolean }).quiet = true;
      throw err;
    }
    const weekAnchor = String(payment.workPeriodStart || '').slice(0, 10);
    const currentAnchor = String(periodKeyFor(new Date().toISOString(), DEFAULT_FLEET_TZ) || '');
    const week = selected.weeks.find((w) => w.periodAnchor === weekAnchor);
    const expectedOutstanding =
      weekAnchor === currentAnchor ? (week?.owedMajor ?? 0) : (week?.owedMajor ?? selected.totalOwed);
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
      savedThisOpen.current = true;
    } catch (err) {
      if (err instanceof CashGateError) {
        savedThisOpen.current = false;
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
        setModalOpen(false);
        setSelected(null);
        if (!stayInSession) closePicker();
        const quiet = new Error('cash_gate');
        (quiet as Error & { quiet?: boolean }).quiet = true;
        throw quiet;
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

  const showPicker = pickerOpen && !modalOpen && !pendingRowOpen;

  return (
    <>
      <ResponsiveDialog
        open={showPicker}
        onOpenChange={(open) => {
          if (!open) {
            if (hidePickerForPayment.current) {
              hidePickerForPayment.current = false;
              return;
            }
            closePicker();
          } else onPickerOpenChange(true);
        }}
      >
        <ResponsiveDialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-md">
          <ResponsiveDialogHeader className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <ResponsiveDialogTitle>Log cash</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              {adding ? 'Add a driver to this cash collection.' : 'Pick a driver. Add anyone who is not listed.'}
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
            {listedPeople.length === 0 ? (
              <div className="px-3 py-10 text-center">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {roster.length === 0 && cash.isLoading
                    ? 'Loading…'
                    : search.trim() || adding
                      ? 'No driver matches that name.'
                      : 'No drivers in this fleet yet.'}
                </p>
                {roster.length === 0 && cash.isLoading ? (
                  <Loader2 className="mx-auto mt-3 h-4 w-4 animate-spin text-slate-400" />
                ) : null}
              </div>
            ) : (
              <ul className="space-y-0.5">
                {listedPeople.map((person) => (
                  <li key={person.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                      onClick={() => {
                        if (adding) {
                          setPinnedIds((ids) => ids.includes(person.id) ? ids : [...ids, person.id]);
                          setAdding(false);
                          setSearch('');
                          return;
                        }
                        openModalFor(asCashDriver(person.id, person.name), { stayInSession: true });
                      }}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                        {initials(person.name)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {person.name}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            {adding ? (
              <Button type="button" variant="outline" className="h-10 flex-1" onClick={() => { setAdding(false); setSearch(''); }}>
                Back
              </Button>
            ) : roster.some((d) => d.id && !sessionIds.includes(d.id)) ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1"
                onClick={() => { setAdding(true); setSearch(''); }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add driver
              </Button>
            ) : null}
            <Button type="button" variant="outline" className="h-10 flex-1" onClick={closePicker}>
              Done
            </Button>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {selected ? (
        <LogCashPaymentModal
          isOpen={modalOpen}
          onClose={leavePayment}
          onSave={handleSave}
          suppressSuccessToast
          driverName={selected.driverName}
          cashOwed={selected.totalOwed}
          periods={cash.periodsFor(selected)}
          allowedTypes={['payment']}
        />
      ) : null}
    </>
  );
}
