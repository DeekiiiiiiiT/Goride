/**
 * Business Finance → Driver Settlements
 * Fleet-wide Collect (Log Cash) + Pay (Record Payout) queue — same txs as Cash Wallet.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Ban,
  Banknote,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import {
  isClearedDriverCashPayment,
  isClearedDriverPayout,
  isDriverCashPaymentTransaction,
  isDriverPayoutTransaction,
} from '../../utils/driverCashPayment';
import {
  buildCashCollectionTx,
  buildCashWriteOffTx,
  buildDriverPayoutTx,
} from '../../utils/driverSettlementTx';
import { payOutstandingAmount } from '../../utils/driverSettlementsPayAmount';
import { DRIVER_FINANCIAL_PERIODS_KEY } from '../../hooks/useDriverFinancialPeriods';
import { resolvePeriodTollCashWash } from '../../utils/periodTollCashSpend';
import {
  OVERPAID_BADGE_TOOLTIP,
  collectKindTooltip,
  overpaidBadgeLabel,
} from '../../utils/settlementDeskUx';
import { BusinessFinanceDeskChrome } from '../business-finance/BusinessFinanceDeskChrome';
import {
  RecordPayoutModal,
  type RecordPayoutSavePayload,
} from '../drivers/RecordPayoutModal';
import { LogCashPaymentModal } from '../drivers/LogCashPaymentModal';
import {
  CashWriteOffModal,
  type CashWriteOffSavePayload,
} from '../drivers/CashWriteOffModal';
import {
  ReconciledPeriodOverlay,
  type ReconciledPeriodDetail,
} from './ReconciledPeriodOverlay';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Label } from '../ui/label';
import { cn } from '../ui/utils';
import type { FinancialTransaction } from '../../types/data';

type MoneyDirection = 'collect' | 'pay';
type DeskMode = MoneyDirection | 'log-cash' | 'reconciled';
type DeskTab = 'outstanding' | 'awaiting' | 'done';

type PeriodRow = {
  driverId: string;
  driverName?: string;
  periodAnchor: string;
  periodEnd: string;
  settlementAmount: number;
  settlementPaid?: number;
  cashCollected: number;
  cashReturned?: number;
  cashStillHeld?: number;
  amountOwed?: number;
  tripCount: number;
  settlementStatus: string;
  fuelFinalized?: boolean;
  /** collect queue source */
  collectKind?: 'driver_owes' | 'cash_held';
  /** Fleet overpay flag — badge only. */
  overpaidAmount?: number;
  cashSourceMismatch?: number;
  metadata?: Record<string, unknown> | null;
};

type ReconciledListRow = PeriodRow & {
  earningsGross: number;
  driverShare: number;
  fleetShare: number;
  driverSharePercent: number;
  fuelDeduction: number;
  fuelFleetShare: number;
  tollChargedToDriver: number;
  tollCashSpend: number;
  cashWrittenOff: number;
  payoutNet: number;
  tipsPaidToDriver?: number;
  tipsWithheld?: number;
  cashSourceMismatch?: number;
  metadata?: Record<string, unknown> | null;
};

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

function rowOverpaidAmount(r: {
  overpaidAmount?: number;
  metadata?: Record<string, unknown> | null;
}): number {
  const direct = Number(r.overpaidAmount) || 0;
  if (direct > 0.005) return direct;
  const fc = (r.metadata?.financeCore || {}) as Record<string, unknown>;
  return Number(fc.overpaidAmount) || 0;
}

function OverpaidBadge({ amount }: { amount: number }) {
  if (amount <= 0.005) return null;
  return (
    <Badge
      variant="secondary"
      className="font-normal bg-violet-50 text-violet-800"
      title={OVERPAID_BADGE_TOOLTIP}
    >
      {overpaidBadgeLabel(amount)}
    </Badge>
  );
}

function weekLabel(anchor: string, end: string) {
  try {
    return `${format(parseISO(`${anchor}T12:00:00`), 'MMM d')} – ${format(parseISO(`${end}T12:00:00`), 'MMM d, yyyy')}`;
  } catch {
    return `${anchor} – ${end}`;
  }
}

function rowKey(r: Pick<PeriodRow, 'driverId' | 'periodAnchor'>) {
  return `${r.driverId}|${r.periodAnchor}`;
}

function collectAmount(r: PeriodRow) {
  const raw = r.amountOwed ?? Math.abs(r.settlementAmount || 0);
  return Math.max(0, Number(raw) || 0);
}

function ymdKey(value: unknown): string {
  return String(value || '').slice(0, 10);
}

/**
 * Desk-wide order: newest Settlement Week first, then driver name.
 * Matches Pay → Outstanding; applied to Collect / Awaiting / Done too.
 */
function compareBySettlementWeekDesc(
  a: { periodAnchor?: string; driverName?: string; driverId?: string },
  b: { periodAnchor?: string; driverName?: string; driverId?: string },
) {
  const week = ymdKey(b.periodAnchor).localeCompare(ymdKey(a.periodAnchor));
  if (week !== 0) return week;
  const name = String(a.driverName || '').localeCompare(String(b.driverName || ''), undefined, {
    sensitivity: 'base',
  });
  if (name !== 0) return name;
  return String(a.driverId || '').localeCompare(String(b.driverId || ''));
}

function normalizePeriodRow(r: PeriodRow & { period_anchor?: string; period_end?: string }): PeriodRow {
  return {
    ...r,
    periodAnchor: ymdKey(r.periodAnchor || r.period_anchor),
    periodEnd: ymdKey(r.periodEnd || r.period_end || r.periodAnchor || r.period_anchor),
  };
}

function txSettlementWeekStart(t: FinancialTransaction): string {
  return ymdKey(t.metadata?.workPeriodStart || t.date);
}

export function DriverSettlementsPage({
  onBackToBusinessFinance,
  onOpenDriver,
}: {
  onBackToBusinessFinance?: () => void;
  onOpenDriver?: (driverId: string) => void;
}) {
  const qc = useQueryClient();
  const thisMonday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const [weekFrom, setWeekFrom] = useState(
    format(subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 8), 'yyyy-MM-dd'),
  );
  const [weekTo, setWeekTo] = useState(
    format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  );
  const [search, setSearch] = useState('');
  const [minAmount, setMinAmount] = useState('1');
  const [deskMode, setDeskMode] = useState<DeskMode>('collect');
  const direction: MoneyDirection = deskMode === 'pay' ? 'pay' : 'collect';
  const [deskTab, setDeskTab] = useState<DeskTab>('outstanding');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchMethod, setBatchMethod] = useState('Cash');
  const [batchDate, setBatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchRef, setBatchRef] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);

  const [payoutModal, setPayoutModal] = useState<{
    isOpen: boolean;
    driverId: string;
    driverName: string;
    workPeriodStart: string;
    workPeriodEnd: string;
    maxAmount: number;
  }>({
    isOpen: false,
    driverId: '',
    driverName: '',
    workPeriodStart: '',
    workPeriodEnd: '',
    maxAmount: 0,
  });

  const [collectModal, setCollectModal] = useState<{
    isOpen: boolean;
    driverId: string;
    driverName: string;
    workPeriodStart: string;
    workPeriodEnd: string;
    maxAmount: number;
  }>({
    isOpen: false,
    driverId: '',
    driverName: '',
    workPeriodStart: '',
    workPeriodEnd: '',
    maxAmount: 0,
  });

  const [writeOffModal, setWriteOffModal] = useState<{
    isOpen: boolean;
    driverId: string;
    driverName: string;
    workPeriodStart: string;
    workPeriodEnd: string;
    maxAmount: number;
  }>({
    isOpen: false,
    driverId: '',
    driverName: '',
    workPeriodStart: '',
    workPeriodEnd: '',
    maxAmount: 0,
  });

  const [txToReverse, setTxToReverse] = useState<FinancialTransaction | null>(null);
  const [reverseBusy, setReverseBusy] = useState(false);
  const [logCashDriverId, setLogCashDriverId] = useState('');
  const [reconciledOverlay, setReconciledOverlay] = useState<{
    open: boolean;
    driverId: string;
    driverName: string;
    periodAnchor: string;
  }>({ open: false, driverId: '', driverName: '', periodAnchor: '' });
  const [reconciledDetail, setReconciledDetail] = useState<ReconciledPeriodDetail | null>(null);
  const [reconciledDetailPartial, setReconciledDetailPartial] = useState(false);
  const [reconciledDetailLoading, setReconciledDetailLoading] = useState(false);

  const rangeOpts = {
    periodStart: weekFrom,
    periodEnd: weekTo,
    minAmount: minAmount ? Number(minAmount) : undefined,
    limit: 1000,
  };

  const owesQuery = useQuery({
    queryKey: ['companyOwesPeriods', weekFrom, weekTo, minAmount],
    queryFn: async () => {
      const res = await api.getCompanyOwesPeriods(rangeOpts);
      return {
        rows: ((res?.data || []) as PeriodRow[]).map((r) =>
          normalizePeriodRow({
            ...r,
            overpaidAmount: Number((r as any).overpaidAmount) || 0,
          }),
        ),
        summary: res?.summary as { totalOwed?: number; rowCount?: number; driverCount?: number },
      };
    },
  });

  const driverOwesQuery = useQuery({
    queryKey: ['driverOwesPeriods', weekFrom, weekTo, minAmount],
    queryFn: async () => {
      const res = await api.getDriverOwesPeriods(rangeOpts);
      return {
        rows: ((res?.data || []) as PeriodRow[]).map((r) =>
          normalizePeriodRow({
            ...r,
            collectKind: 'driver_owes' as const,
            amountOwed: Number(r.amountOwed) || Math.abs(Number(r.settlementAmount) || 0),
            overpaidAmount: Number((r as any).overpaidAmount) || 0,
          }),
        ),
        summary: res?.summary as { totalOwed?: number; rowCount?: number; driverCount?: number },
      };
    },
  });

  const cashHeldQuery = useQuery({
    queryKey: ['cashHeldPeriods', weekFrom, weekTo, minAmount],
    queryFn: async () => {
      const res = await api.getCashHeldPeriods(rangeOpts);
      return {
        rows: ((res?.data || []) as PeriodRow[]).map((r) =>
          normalizePeriodRow({
            ...r,
            collectKind: 'cash_held' as const,
            amountOwed: Number(r.amountOwed) || Number(r.cashStillHeld) || 0,
          }),
        ),
        summary: res?.summary as { totalHeld?: number; rowCount?: number; driverCount?: number },
      };
    },
  });

  const reconciledQuery = useQuery({
    queryKey: ['reconciledPeriods', weekFrom, weekTo, minAmount],
    queryFn: async () => {
      const res = await api.getReconciledPeriods(rangeOpts);
      return {
        rows: ((res?.data || []) as ReconciledListRow[]).map((r) => {
          const base = normalizePeriodRow(r);
          return {
            ...base,
            earningsGross: Number.isFinite(Number(r.earningsGross)) ? Number(r.earningsGross) : 0,
            driverShare: Number.isFinite(Number(r.driverShare)) ? Number(r.driverShare) : 0,
            fleetShare: Number.isFinite(Number(r.fleetShare)) ? Number(r.fleetShare) : 0,
            driverSharePercent: Number.isFinite(Number(r.driverSharePercent))
              ? Number(r.driverSharePercent)
              : 0,
            fuelDeduction: Number.isFinite(Number(r.fuelDeduction)) ? Number(r.fuelDeduction) : 0,
            fuelFleetShare: Number.isFinite(Number(r.fuelFleetShare)) ? Number(r.fuelFleetShare) : 0,
            tollChargedToDriver: Number.isFinite(Number(r.tollChargedToDriver))
              ? Number(r.tollChargedToDriver)
              : 0,
            tollCashSpend: Number.isFinite(Number(r.tollCashSpend)) ? Number(r.tollCashSpend) : 0,
            cashWrittenOff: Number.isFinite(Number(r.cashWrittenOff)) ? Number(r.cashWrittenOff) : 0,
            payoutNet: Number.isFinite(Number((r as any).payoutNet))
              ? Number((r as any).payoutNet)
              : 0,
            cashReturned: Number.isFinite(Number(r.cashReturned)) ? Number(r.cashReturned) : 0,
            settlementPaid: Number.isFinite(Number(r.settlementPaid)) ? Number(r.settlementPaid) : 0,
            tipsPaidToDriver: Number.isFinite(Number((r as any).tipsPaidToDriver))
              ? Number((r as any).tipsPaidToDriver)
              : 0,
            tipsWithheld: Number.isFinite(Number((r as any).tipsWithheld))
              ? Number((r as any).tipsWithheld)
              : 0,
            cashSourceMismatch: Number.isFinite(Number((r as any).cashSourceMismatch))
              ? Number((r as any).cashSourceMismatch)
              : 0,
            overpaidAmount: rowOverpaidAmount(r as ReconciledListRow),
            metadata: (r as any).metadata ?? null,
          } as ReconciledListRow;
        }),
        summary: res?.summary as { totalGross?: number; rowCount?: number; driverCount?: number },
      };
    },
  });

  const txsQuery = useQuery({
    queryKey: ['driverSettlementsTransactions', weekFrom, weekTo],
    queryFn: async () => {
      const all: FinancialTransaction[] = [];
      const pageSize = 5000;
      let offset = 0;
      while (offset < 50000) {
        const page = await api.getTransactions(undefined, {
          limit: pageSize,
          offset,
          startDate: weekFrom,
          endDate: weekTo,
          desk: 'settlements',
        });
        const batch = (Array.isArray(page) ? page : page?.data || []) as FinancialTransaction[];
        all.push(...batch.filter(Boolean));
        if (batch.length < pageSize) break;
        offset += pageSize;
      }
      return all;
    },
  });

  const driversQuery = useQuery({
    queryKey: ['drivers', 'driver-settlements-log-cash'],
    queryFn: () => api.getDrivers(),
  });

  const driverOptions = useMemo(() => {
    const raw = driversQuery.data;
    const list = Array.isArray(raw) ? raw : raw?.data || [];
    return (list as any[])
      .map((d) => {
        const id = String(d?.id || d?.roamId || '').trim();
        const name = String(d?.name || d?.fullName || d?.displayName || id).trim();
        return id ? { id, name } : null;
      })
      .filter(Boolean) as { id: string; name: string }[];
  }, [driversQuery.data]);

  const collectOutstanding = useMemo(() => {
    const byKey = new Map<string, PeriodRow>();
    // Prefer driver_owes over cash_held when both exist for same week
    for (const r of cashHeldQuery.data?.rows || []) {
      byKey.set(rowKey(r), r);
    }
    for (const r of driverOwesQuery.data?.rows || []) {
      byKey.set(rowKey(r), r);
    }
    const q = search.trim().toLowerCase();
    return [...byKey.values()]
      .filter((r) => collectAmount(r) > 0.005)
      .filter((r) => {
        if (!q) return true;
        return (
          String(r.driverName || '').toLowerCase().includes(q) ||
          String(r.driverId).toLowerCase().includes(q) ||
          r.periodAnchor.includes(q)
        );
      })
      .sort(compareBySettlementWeekDesc);
  }, [driverOwesQuery.data?.rows, cashHeldQuery.data?.rows, search]);

  const payOutstanding = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (owesQuery.data?.rows || [])
      .filter((r) => payOutstandingAmount(r) > 0.005)
      .filter((r) => {
        if (!q) return true;
        return (
          String(r.driverName || '').toLowerCase().includes(q) ||
          String(r.driverId).toLowerCase().includes(q) ||
          r.periodAnchor.includes(q)
        );
      })
      .sort(compareBySettlementWeekDesc);
  }, [owesQuery.data?.rows, search]);

  const outstandingRows = direction === 'collect' ? collectOutstanding : payOutstanding;

  /** Week×driver → overpaid flag for Pay Done badges (same source as Collect). */
  const overpaidByPeriodKey = useMemo(() => {
    const m = new Map<string, number>();
    const add = (rows: PeriodRow[] | undefined) => {
      for (const r of rows || []) {
        const oa = Number(r.overpaidAmount) || 0;
        if (oa > 0.005) m.set(rowKey(r), oa);
      }
    };
    add(driverOwesQuery.data?.rows);
    add(owesQuery.data?.rows);
    add(reconciledQuery.data?.rows);
    return m;
  }, [driverOwesQuery.data?.rows, owesQuery.data?.rows, reconciledQuery.data?.rows]);

  const awaitingRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = txsQuery.data || [];
    const filtered =
      direction === 'collect'
        ? all.filter(
            (t) =>
              isDriverCashPaymentTransaction(t) &&
              String(t.status || '').toLowerCase() === 'pending',
          )
        : all.filter(
            (t) =>
              isDriverPayoutTransaction(t) &&
              String(t.status || '').toLowerCase() === 'pending',
          );
    return filtered
      .filter((t) => {
        if (!q) return true;
        return (
          String(t.driverName || '').toLowerCase().includes(q) ||
          String(t.driverId || '').toLowerCase().includes(q) ||
          String(t.metadata?.workPeriodStart || '').includes(q)
        );
      })
      .sort((a, b) => {
        const week = txSettlementWeekStart(b).localeCompare(txSettlementWeekStart(a));
        if (week !== 0) return week;
        const name = String(a.driverName || '').localeCompare(String(b.driverName || ''), undefined, {
          sensitivity: 'base',
        });
        if (name !== 0) return name;
        return String(b.date || '').localeCompare(String(a.date || ''));
      });
  }, [txsQuery.data, search, direction]);

  const donePayRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (txsQuery.data || [])
      .filter((t) => {
        if (!isClearedDriverPayout(t)) return false;
        const week = txSettlementWeekStart(t);
        if (week && (week < weekFrom || week > weekTo)) return false;
        if (!week) {
          const d = String(t.date || '').slice(0, 10);
          if (d < weekFrom || d > weekTo) return false;
        }
        if (!q) return true;
        return (
          String(t.driverName || '').toLowerCase().includes(q) ||
          String(t.driverId || '').toLowerCase().includes(q) ||
          week.includes(q)
        );
      })
      .sort((a, b) => {
        const week = txSettlementWeekStart(b).localeCompare(txSettlementWeekStart(a));
        if (week !== 0) return week;
        const name = String(a.driverName || '').localeCompare(String(b.driverName || ''), undefined, {
          sensitivity: 'base',
        });
        if (name !== 0) return name;
        return String(b.date || '').localeCompare(String(a.date || ''));
      });
  }, [txsQuery.data, weekFrom, weekTo, search]);

  const doneCollectRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (txsQuery.data || [])
      .filter((t) => {
        if (!isClearedDriverCashPayment(t)) return false;
        const week = txSettlementWeekStart(t);
        if (week && (week < weekFrom || week > weekTo)) return false;
        if (!week) {
          const d = String(t.date || '').slice(0, 10);
          if (d < weekFrom || d > weekTo) return false;
        }
        if (!q) return true;
        return (
          String(t.driverName || '').toLowerCase().includes(q) ||
          String(t.driverId || '').toLowerCase().includes(q) ||
          week.includes(q)
        );
      })
      .sort((a, b) => {
        const week = txSettlementWeekStart(b).localeCompare(txSettlementWeekStart(a));
        if (week !== 0) return week;
        const name = String(a.driverName || '').localeCompare(String(b.driverName || ''), undefined, {
          sensitivity: 'base',
        });
        if (name !== 0) return name;
        return String(b.date || '').localeCompare(String(a.date || ''));
      });
  }, [txsQuery.data, weekFrom, weekTo, search]);

  const reconciledRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (reconciledQuery.data?.rows || [])
      .filter((r) => {
        if (!q) return true;
        return (
          String(r.driverName || '').toLowerCase().includes(q) ||
          String(r.driverId).toLowerCase().includes(q) ||
          r.periodAnchor.includes(q)
        );
      })
      .sort(compareBySettlementWeekDesc);
  }, [reconciledQuery.data?.rows, search]);

  const settledOwesTotal = (driverOwesQuery.data?.rows || []).reduce(
    (s, r) => s + collectAmount(r),
    0,
  );
  const cashHeldKpiTotal = (cashHeldQuery.data?.rows || []).reduce(
    (s, r) => s + collectAmount(r),
    0,
  );
  const fleetOwesTotal = payOutstanding.reduce((s, r) => s + payOutstandingAmount(r), 0);
  const awaitingTotal = awaitingRows.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const clearedThisWeek =
    direction === 'pay'
      ? (txsQuery.data || [])
          .filter((t) => {
            if (!isDriverPayoutTransaction(t)) return false;
            const st = String(t.status || '').toLowerCase();
            if (st !== 'completed' && st !== 'verified') return false;
            return String(t.date || '').slice(0, 10) >= thisMonday;
          })
          .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0)
      : (txsQuery.data || [])
          .filter((t) => {
            if (!isClearedDriverCashPayment(t)) return false;
            return String(t.date || '').slice(0, 10) >= thisMonday;
          })
          .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);

  useEffect(() => {
    setSelected(new Set());
  }, [deskTab, deskMode, weekFrom, weekTo, search]);

  const findFreshCollectRow = (driverId: string, periodAnchor: string): PeriodRow | undefined => {
    const owes = qc.getQueryData<{ rows: PeriodRow[] }>([
      'driverOwesPeriods',
      weekFrom,
      weekTo,
      minAmount,
    ]);
    const held = qc.getQueryData<{ rows: PeriodRow[] }>([
      'cashHeldPeriods',
      weekFrom,
      weekTo,
      minAmount,
    ]);
    const match = (r: PeriodRow) => r.driverId === driverId && r.periodAnchor === periodAnchor;
    return (owes?.rows || []).find(match) || (held?.rows || []).find(match);
  };

  const openLogCashForDriver = (driverId: string, driverName: string, row?: PeriodRow) => {
    const openWeeks = collectOutstanding.filter((r) => r.driverId === driverId);
    const target = row || openWeeks[0];
    const maxAmount = target
      ? collectAmount(target)
      : openWeeks.reduce((s, r) => s + collectAmount(r), 0);
    const fallbackStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const fallbackEnd = format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    setCollectModal({
      isOpen: true,
      driverId,
      driverName: driverName || driverId,
      workPeriodStart: target?.periodAnchor || fallbackStart,
      workPeriodEnd: target?.periodEnd || fallbackEnd,
      maxAmount: Math.max(0, maxAmount),
    });
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === outstandingRows.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(outstandingRows.map((r) => rowKey(r))));
  };

  const selectedRows = outstandingRows.filter((r) => selected.has(rowKey(r)));
  const selectedTotal = selectedRows.reduce(
    (s, r) =>
      s +
      (direction === 'collect'
        ? collectAmount(r)
        : payOutstandingAmount(r)),
    0,
  );

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['companyOwesPeriods'] });
    void qc.invalidateQueries({ queryKey: ['driverOwesPeriods'] });
    void qc.invalidateQueries({ queryKey: ['cashHeldPeriods'] });
    void qc.invalidateQueries({ queryKey: ['reconciledPeriods'] });
    void qc.invalidateQueries({ queryKey: ['driverSettlementsTransactions'] });
    // Cash Wallet / Settlement tabs read the same period projection.
    void qc.invalidateQueries({ queryKey: [DRIVER_FINANCIAL_PERIODS_KEY] });
  };

  const openReconciledPeriod = async (row: ReconciledListRow) => {
    setReconciledOverlay({
      open: true,
      driverId: row.driverId,
      driverName: row.driverName || row.driverId,
      periodAnchor: row.periodAnchor,
    });
    setReconciledDetailLoading(true);
    setReconciledDetail(null);
    setReconciledDetailPartial(false);
    try {
      const res = await api.getDriverFinancialPeriodDetail(row.driverId, row.periodAnchor);
      const d = (res?.data || res) as Record<string, unknown>;
      setReconciledDetail({
        driverId: String(d.driverId || row.driverId),
        periodAnchor: String(d.periodAnchor || row.periodAnchor).slice(0, 10),
        periodEnd: String(d.periodEnd || row.periodEnd).slice(0, 10),
        earningsGross: Number.isFinite(Number(d.earningsGross))
          ? Number(d.earningsGross)
          : row.earningsGross,
        driverShare: Number.isFinite(Number(d.driverShare)) ? Number(d.driverShare) : row.driverShare,
        fleetShare: Number.isFinite(Number(d.fleetShare)) ? Number(d.fleetShare) : row.fleetShare,
        driverSharePercent: Number.isFinite(Number(d.driverSharePercent))
          ? Number(d.driverSharePercent)
          : row.driverSharePercent,
        fuelDeduction: Number.isFinite(Number(d.fuelDeduction))
          ? Number(d.fuelDeduction)
          : row.fuelDeduction,
        fuelFleetShare: Number.isFinite(Number(d.fuelFleetShare))
          ? Number(d.fuelFleetShare)
          : row.fuelFleetShare,
        tollChargedToDriver: Number.isFinite(Number(d.tollChargedToDriver))
          ? Number(d.tollChargedToDriver)
          : row.tollChargedToDriver,
        tollCashSpend: resolvePeriodTollCashWash({
          tollCashSpend: Number.isFinite(Number(d.tollCashSpend))
            ? Number(d.tollCashSpend)
            : row.tollCashSpend,
          metadata: (d.metadata as Record<string, unknown>) || null,
        }),
        cashCollected: Number.isFinite(Number(d.cashCollected))
          ? Number(d.cashCollected)
          : row.cashCollected,
        cashReturned: Number.isFinite(Number(d.cashReturned))
          ? Number(d.cashReturned)
          : row.cashReturned || 0,
        cashWrittenOff: Number.isFinite(Number(d.cashWrittenOff))
          ? Number(d.cashWrittenOff)
          : row.cashWrittenOff,
        settlementPaid: Number.isFinite(Number(d.settlementPaid))
          ? Number(d.settlementPaid)
          : row.settlementPaid || 0,
        cashStillHeld: Number.isFinite(Number(d.cashStillHeld))
          ? Number(d.cashStillHeld)
          : row.cashStillHeld || 0,
        payoutNet: Number.isFinite(Number(d.payoutNet)) ? Number(d.payoutNet) : row.payoutNet,
        settlementAmount: Number.isFinite(Number(d.settlementAmount))
          ? Number(d.settlementAmount)
          : row.settlementAmount,
        tripCount: Number.isFinite(Number(d.tripCount)) ? Number(d.tripCount) : row.tripCount,
        fuelFinalized: !!(d.fuelFinalized ?? row.fuelFinalized),
        settlementStatus: String(d.settlementStatus || row.settlementStatus || 'pending'),
        tierName: (d.tierName as string | null | undefined) ?? null,
        tipsPaidToDriver: Number.isFinite(Number(d.tipsPaidToDriver))
          ? Number(d.tipsPaidToDriver)
          : row.tipsPaidToDriver || 0,
        tipsWithheld: Number.isFinite(Number(d.tipsWithheld))
          ? Number(d.tipsWithheld)
          : row.tipsWithheld || 0,
        cashSourceMismatch: Number.isFinite(Number((d as any).cashSourceMismatch))
          ? Number((d as any).cashSourceMismatch)
          : row.cashSourceMismatch || 0,
        overpaidAmount: rowOverpaidAmount({
          overpaidAmount: Number((d as any).overpaidAmount),
          metadata: (d.metadata as Record<string, unknown>) || row.metadata,
        }),
      });
    } catch (e: any) {
      toast.error(e?.message || 'Could not load period detail');
      setReconciledDetailPartial(true);
      // Fall back to list-row fields so the overlay still opens.
      setReconciledDetail({
        driverId: row.driverId,
        periodAnchor: row.periodAnchor,
        periodEnd: row.periodEnd,
        earningsGross: row.earningsGross,
        driverShare: row.driverShare,
        fleetShare: row.fleetShare,
        driverSharePercent: row.driverSharePercent,
        fuelDeduction: row.fuelDeduction,
        fuelFleetShare: row.fuelFleetShare,
        tollChargedToDriver: row.tollChargedToDriver,
        tollCashSpend: resolvePeriodTollCashWash({
          tollCashSpend: row.tollCashSpend,
          metadata: row.metadata ?? null,
        }),
        cashCollected: row.cashCollected,
        cashReturned: row.cashReturned || 0,
        cashWrittenOff: row.cashWrittenOff,
        settlementPaid: row.settlementPaid || 0,
        cashStillHeld: row.cashStillHeld || 0,
        payoutNet: row.payoutNet,
        settlementAmount: row.settlementAmount,
        tripCount: row.tripCount,
        fuelFinalized: row.fuelFinalized,
        settlementStatus: row.settlementStatus,
        tierName: null,
        cashSourceMismatch: row.cashSourceMismatch || 0,
        overpaidAmount: rowOverpaidAmount(row),
      });
    } finally {
      setReconciledDetailLoading(false);
    }
  };

  const exportCsv = () => {
    const rows = selectedRows.length > 0 ? selectedRows : outstandingRows;
    if (rows.length === 0) {
      toast.error('Nothing to export');
      return;
    }
    const header =
      direction === 'collect'
        ? ['driver_id', 'driver_name', 'period_start', 'period_end', 'amount_owed', 'collect_kind', 'overpaid_amount', 'passenger_cash']
        : ['driver_id', 'driver_name', 'period_start', 'period_end', 'amount_owed', 'overpaid_amount', 'passenger_cash', 'already_paid'];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        direction === 'collect'
          ? [
              r.driverId,
              `"${String(r.driverName || '').replace(/"/g, '""')}"`,
              r.periodAnchor,
              r.periodEnd,
              collectAmount(r).toFixed(2),
              r.collectKind || '',
              rowOverpaidAmount(r).toFixed(2),
              Number(r.cashCollected || 0).toFixed(2),
            ].join(',')
          : [
              r.driverId,
              `"${String(r.driverName || '').replace(/"/g, '""')}"`,
              r.periodAnchor,
              r.periodEnd,
              payOutstandingAmount(r).toFixed(2),
              rowOverpaidAmount(r).toFixed(2),
              Number(r.cashCollected || 0).toFixed(2),
              Number(r.settlementPaid || 0).toFixed(2),
            ].join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `driver-settlements-${direction}-${weekFrom}-to-${weekTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} row${rows.length !== 1 ? 's' : ''}`);
  };

  const saveSinglePayout = async (payload: RecordPayoutSavePayload) => {
    const newTx = buildDriverPayoutTx(payload, {
      driverId: payoutModal.driverId,
      driverName: payoutModal.driverName,
    });
    await api.saveTransaction(newTx);
    refreshAll();
  };

  const saveCollectPayment = async (payment: {
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
    const weekStart = String(
      payment.workPeriodStart || collectModal.workPeriodStart || '',
    ).slice(0, 10);
    const beforeAmt = collectModal.maxAmount;
    const newTx = buildCashCollectionTx(
      {
        ...payment,
        workPeriodStart:
          payment.workPeriodStart ||
          `${collectModal.workPeriodStart}T12:00:00.000Z`,
        workPeriodEnd:
          payment.workPeriodEnd || `${collectModal.workPeriodEnd}T12:00:00.000Z`,
      },
      { driverId: collectModal.driverId, driverName: collectModal.driverName },
    );
    await api.saveTransaction(newTx);
    // Edge cash-sync updates returned/settlement only; refetch Outstanding for 1:1 display
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['driverOwesPeriods'] }),
      qc.invalidateQueries({ queryKey: ['cashHeldPeriods'] }),
      qc.invalidateQueries({ queryKey: ['driverSettlementsTransactions'] }),
    ]);
    await Promise.all([
      qc.refetchQueries({ queryKey: ['driverOwesPeriods'] }),
      qc.refetchQueries({ queryKey: ['cashHeldPeriods'] }),
      qc.refetchQueries({ queryKey: ['driverSettlementsTransactions'] }),
    ]);
    if (payment.transactionType === 'payment' && weekStart) {
      const fresh = findFreshCollectRow(collectModal.driverId, weekStart);
      const afterAmt = fresh ? collectAmount(fresh) : Math.max(0, beforeAmt - Math.abs(payment.amount));
      const reduced = Math.round((beforeAmt - afterAmt) * 100) / 100;
      toast.success(
        `Collected ${MONEY(payment.amount)} · owed ${MONEY(beforeAmt)} → ${MONEY(afterAmt)} (changed by ${MONEY(reduced)})`,
        { duration: 7000 },
      );
    }
    refreshAll();
  };

  const saveWriteOff = async (payload: CashWriteOffSavePayload) => {
    if (payload.amount > writeOffModal.maxAmount + 0.005) {
      throw new Error(
        `Cannot write off more than cash still owed (${writeOffModal.maxAmount.toFixed(2)})`,
      );
    }
    await api.saveTransaction(
      buildCashWriteOffTx(payload, {
        driverId: writeOffModal.driverId,
        driverName: writeOffModal.driverName,
      }),
    );
    refreshAll();
  };

  const confirmReverseTx = async () => {
    if (!txToReverse?.id) return;
    setReverseBusy(true);
    try {
      await api.deleteTransaction(txToReverse.id);
      toast.success(
        isDriverPayoutTransaction(txToReverse) ? 'Payout reversed' : 'Cash payment reversed',
      );
      setTxToReverse(null);
      refreshAll();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to reverse');
    } finally {
      setReverseBusy(false);
    }
  };

  const runBatch = async () => {
    if (selectedRows.length === 0) return;
    const needsRef =
      batchMethod === 'Bank Transfer' ||
      batchMethod === 'Mobile Money' ||
      batchMethod === 'Check';
    if (needsRef && !batchRef.trim()) {
      toast.error('Reference number is required for bank / mobile transfers');
      return;
    }
    setBatchBusy(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const row of selectedRows) {
        try {
          if (direction === 'pay') {
            await api.saveTransaction(
              buildDriverPayoutTx(
                {
                  amount: Math.round(payOutstandingAmount(row) * 100) / 100,
                  date: batchDate,
                  paymentMethod: batchMethod,
                  referenceNumber: batchRef.trim() || undefined,
                  notes: 'Batch payout',
                  workPeriodStart: row.periodAnchor,
                  workPeriodEnd: row.periodEnd,
                },
                { driverId: row.driverId, driverName: row.driverName || row.driverId },
              ),
            );
          } else {
            await api.saveTransaction(
              buildCashCollectionTx(
                {
                  amount: Math.round(collectAmount(row) * 100) / 100,
                  date: batchDate,
                  notes: 'Batch cash collection',
                  paymentMethod: batchMethod,
                  referenceNumber: batchRef.trim() || undefined,
                  transactionType: 'payment',
                  workPeriodStart: `${row.periodAnchor}T12:00:00.000Z`,
                  workPeriodEnd: `${row.periodEnd}T12:00:00.000Z`,
                },
                { driverId: row.driverId, driverName: row.driverName || row.driverId },
              ),
            );
          }
          ok++;
        } catch {
          fail++;
        }
      }
      if (ok > 0) {
        toast.success(
          direction === 'pay'
            ? `Recorded ${ok} payout${ok !== 1 ? 's' : ''}`
            : `Logged ${ok} collection${ok !== 1 ? 's' : ''}`,
        );
      }
      if (fail > 0) toast.error(`${fail} failed`);
      setBatchOpen(false);
      setSelected(new Set());
      refreshAll();
    } finally {
      setBatchBusy(false);
    }
  };

  const verifyPending = async (tx: FinancialTransaction) => {
    try {
      await api.saveTransaction({ ...tx, status: 'Verified' });
      toast.success('Verified');
      refreshAll();
    } catch (e: any) {
      toast.error(e?.message || 'Verify failed');
    }
  };

  const loading =
    owesQuery.isLoading ||
    driverOwesQuery.isLoading ||
    cashHeldQuery.isLoading ||
    reconciledQuery.isLoading ||
    txsQuery.isLoading;

  const collectPeriodForModal = useMemo(() => {
    if (!collectModal.isOpen) return [];
    const forDriver = collectOutstanding.filter((r) => r.driverId === collectModal.driverId);
    if (forDriver.length > 0) {
      return forDriver.map((r) => ({
        start: parseISO(`${r.periodAnchor}T12:00:00`),
        end: parseISO(`${r.periodEnd}T12:00:00`),
        amountOwed: collectAmount(r),
        amountPaid: 0,
        balance: collectAmount(r),
        status: 'Unpaid',
      }));
    }
    if (collectModal.workPeriodStart && collectModal.workPeriodEnd) {
      // amountOwed must be > 0 so LogCashPaymentModal shows the week in the dropdown
      const amt = Math.max(collectModal.maxAmount, 0.01);
      return [
        {
          start: parseISO(`${collectModal.workPeriodStart}T12:00:00`),
          end: parseISO(`${collectModal.workPeriodEnd}T12:00:00`),
          amountOwed: amt,
          amountPaid: 0,
          balance: amt,
          status: 'Unpaid',
        },
      ];
    }
    return [];
  }, [collectModal, collectOutstanding]);

  const selectedLogCashDriver = driverOptions.find((d) => d.id === logCashDriverId);
  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-[1400px] mx-auto">
      <BusinessFinanceDeskChrome deskLabel="Driver Settlements" onBack={onBackToBusinessFinance} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-700" />
            Driver Settlements
          </h1>
        </div>
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={refreshAll} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi
          label="Driver owes (settled)"
          value={MONEY(settledOwesTotal)}
          sub={`${driverOwesQuery.data?.rows?.length || 0} weeks`}
          tone="owed"
        />
        <Kpi
          label="Cash held (not finalized)"
          value={MONEY(cashHeldKpiTotal)}
          sub={`${cashHeldQuery.data?.rows?.length || 0} weeks`}
          tone="pending"
        />
        <Kpi label="Fleet owes" value={MONEY(fleetOwesTotal)} sub={`${payOutstanding.length} weeks`} tone="pay" />
        <Kpi
          label="Awaiting bank clear"
          value={MONEY(awaitingTotal)}
          sub={`${awaitingRows.length} pending (${direction})`}
          tone="pending"
        />
        <Kpi
          label="Cleared this week"
          value={MONEY(clearedThisWeek)}
          sub={direction === 'pay' ? 'Payouts since Mon' : 'Collections since Mon'}
          tone="paid"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={deskMode === 'collect' ? 'default' : 'outline'}
          className={cn('h-9', deskMode === 'collect' && 'bg-rose-700 hover:bg-rose-800')}
          onClick={() => setDeskMode('collect')}
        >
          <ArrowDownLeft className="h-4 w-4 mr-1.5" />
          Collect
        </Button>
        <Button
          type="button"
          size="sm"
          variant={deskMode === 'pay' ? 'default' : 'outline'}
          className={cn('h-9', deskMode === 'pay' && 'bg-emerald-700 hover:bg-emerald-800')}
          onClick={() => setDeskMode('pay')}
        >
          <ArrowUpRight className="h-4 w-4 mr-1.5" />
          Pay
        </Button>
        <Button
          type="button"
          size="sm"
          variant={deskMode === 'log-cash' ? 'default' : 'outline'}
          className={cn('h-9', deskMode === 'log-cash' && 'bg-emerald-600 hover:bg-emerald-700')}
          onClick={() => setDeskMode('log-cash')}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          Log cash
        </Button>
        <Button
          type="button"
          size="sm"
          variant={deskMode === 'reconciled' ? 'default' : 'outline'}
          className={cn('h-9', deskMode === 'reconciled' && 'bg-indigo-700 hover:bg-indigo-800')}
          onClick={() => setDeskMode('reconciled')}
        >
          <CheckCircle2 className="h-4 w-4 mr-1.5" />
          Reconciled
        </Button>
      </div>

      {deskMode === 'log-cash' ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Log cash received</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Same Log Cash flow as Cash Wallet — pick a driver, then tag the Settlement Week.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="space-y-1 flex-1 min-w-[220px]">
                <Label className="text-xs text-slate-500">Driver</Label>
                <Select value={logCashDriverId || undefined} onValueChange={setLogCashDriverId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder={driversQuery.isLoading ? 'Loading drivers…' : 'Select driver'} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {driverOptions
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
                      .map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                className="h-9 bg-emerald-600 hover:bg-emerald-700"
                disabled={!logCashDriverId}
                onClick={() => {
                  if (!selectedLogCashDriver) return;
                  openLogCashForDriver(selectedLogCashDriver.id, selectedLogCashDriver.name);
                }}
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Log Cash Payment
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">Open weeks to collect</p>
              <p className="text-xs text-slate-500">
                {collectOutstanding.length} week{collectOutstanding.length !== 1 ? 's' : ''}
              </p>
            </div>
            <OutstandingTable
              direction="collect"
              rows={collectOutstanding}
              loading={loading}
              selected={selected}
              onToggle={toggleSelect}
              onToggleAll={toggleSelectAll}
              onOpenDriver={onOpenDriver}
              onPay={() => {}}
              onCollect={(r) => openLogCashForDriver(r.driverId, r.driverName || r.driverId, r)}
              onWriteOff={(r) =>
                setWriteOffModal({
                  isOpen: true,
                  driverId: r.driverId,
                  driverName: r.driverName || r.driverId,
                  workPeriodStart: r.periodAnchor,
                  workPeriodEnd: r.periodEnd,
                  maxAmount: collectAmount(r),
                })
              }
            />
          </div>
        </div>
      ) : deskMode === 'reconciled' ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Week from</Label>
                <Input
                  type="date"
                  className="h-9 w-[150px]"
                  value={weekFrom}
                  onChange={(e) => setWeekFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Week to</Label>
                <Input
                  type="date"
                  className="h-9 w-[150px]"
                  value={weekTo}
                  onChange={(e) => setWeekTo(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Min amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="h-9 w-[110px]"
                  placeholder="Min $1 (clear for all)"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    className="h-9 w-[200px] pl-8"
                    placeholder="Driver or week…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">Reconciled weeks</h3>
            <p className="text-xs text-slate-500">
              Closed Settlement Weeks — click a row for Fleet vs Driver breakdown.
            </p>
          </div>
          <ReconciledTable
            rows={reconciledRows}
            loading={reconciledQuery.isLoading}
            onOpenDriver={onOpenDriver}
            onOpenPeriod={openReconciledPeriod}
          />
        </div>
      ) : (
        <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Week from</Label>
            <Input type="date" className="h-9 w-[150px]" value={weekFrom} onChange={(e) => setWeekFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Week to</Label>
            <Input type="date" className="h-9 w-[150px]" value={weekTo} onChange={(e) => setWeekTo(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Min amount</Label>
            <Input
              type="number"
              step="0.01"
              className="h-9 w-[110px]"
              placeholder="Min $1 (clear for all)"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-slate-500">Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <Input
                className="h-9 w-[200px] pl-8"
                placeholder="Driver or week…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
        {deskTab === 'outstanding' && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
            <Button
              type="button"
              size="sm"
              className={cn(
                'h-9',
                direction === 'collect' ? 'bg-rose-700 hover:bg-rose-800' : 'bg-emerald-700 hover:bg-emerald-800',
              )}
              disabled={selectedRows.length === 0}
              onClick={() => setBatchOpen(true)}
            >
              {direction === 'collect' ? 'Collect selected' : 'Pay selected'} ({selectedRows.length})
            </Button>
          </div>
        )}
      </div>

      <Tabs value={deskTab} onValueChange={(v) => setDeskTab(v as DeskTab)}>
        <TabsList>
          <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
          <TabsTrigger value="awaiting">Awaiting clear</TabsTrigger>
          <TabsTrigger value="done">Done</TabsTrigger>
        </TabsList>

        <TabsContent value="outstanding" className="mt-4">
          <OutstandingTable
            direction={direction}
            rows={outstandingRows}
            loading={loading}
            selected={selected}
            onToggle={toggleSelect}
            onToggleAll={toggleSelectAll}
            onOpenDriver={onOpenDriver}
            onPay={(r) =>
              setPayoutModal({
                isOpen: true,
                driverId: r.driverId,
                driverName: r.driverName || r.driverId,
                workPeriodStart: r.periodAnchor,
                workPeriodEnd: r.periodEnd,
                maxAmount: payOutstandingAmount(r),
              })
            }
            onCollect={(r) =>
              setCollectModal({
                isOpen: true,
                driverId: r.driverId,
                driverName: r.driverName || r.driverId,
                workPeriodStart: r.periodAnchor,
                workPeriodEnd: r.periodEnd,
                maxAmount: collectAmount(r),
              })
            }
            onWriteOff={(r) =>
              setWriteOffModal({
                isOpen: true,
                driverId: r.driverId,
                driverName: r.driverName || r.driverId,
                workPeriodStart: r.periodAnchor,
                workPeriodEnd: r.periodEnd,
                maxAmount: collectAmount(r),
              })
            }
          />
        </TabsContent>

        <TabsContent value="awaiting" className="mt-4">
          <PendingTable rows={awaitingRows} direction={direction} onOpenDriver={onOpenDriver} onVerify={verifyPending} />
        </TabsContent>

        <TabsContent value="done" className="mt-4">
          {direction === 'pay' ? (
            <DonePayTable
              rows={donePayRows}
              overpaidByPeriodKey={overpaidByPeriodKey}
              onOpenDriver={onOpenDriver}
              onReverse={(tx) => setTxToReverse(tx)}
            />
          ) : (
            <DoneCollectTable
              rows={doneCollectRows}
              overpaidByPeriodKey={overpaidByPeriodKey}
              onOpenDriver={onOpenDriver}
              onReverse={(tx) => setTxToReverse(tx)}
            />
          )}
        </TabsContent>
      </Tabs>
        </>
      )}

      <RecordPayoutModal
        isOpen={payoutModal.isOpen}
        onClose={() => setPayoutModal((s) => ({ ...s, isOpen: false }))}
        onSave={saveSinglePayout}
        driverName={payoutModal.driverName}
        maxAmount={payoutModal.maxAmount}
        workPeriodStart={payoutModal.workPeriodStart}
        workPeriodEnd={payoutModal.workPeriodEnd}
      />

      <LogCashPaymentModal
        isOpen={collectModal.isOpen}
        onClose={() => setCollectModal((s) => ({ ...s, isOpen: false }))}
        onSave={saveCollectPayment}
        driverName={collectModal.driverName}
        cashOwed={collectModal.maxAmount}
        initialWorkPeriodStart={
          collectModal.workPeriodStart
            ? `${collectModal.workPeriodStart}T12:00:00.000Z`
            : undefined
        }
        initialWorkPeriodEnd={
          collectModal.workPeriodEnd ? `${collectModal.workPeriodEnd}T12:00:00.000Z` : undefined
        }
        initialAmount={collectModal.maxAmount}
        periods={collectPeriodForModal}
      />

      <CashWriteOffModal
        isOpen={writeOffModal.isOpen}
        onClose={() => setWriteOffModal((s) => ({ ...s, isOpen: false }))}
        onSave={saveWriteOff}
        driverName={writeOffModal.driverName}
        maxAmount={writeOffModal.maxAmount}
        workPeriodStart={writeOffModal.workPeriodStart}
        workPeriodEnd={writeOffModal.workPeriodEnd}
      />

      <ReconciledPeriodOverlay
        open={reconciledOverlay.open}
        onOpenChange={(open) => {
          setReconciledOverlay((s) => ({ ...s, open }));
          if (!open) setReconciledDetail(null);
        }}
        driverName={reconciledOverlay.driverName}
        detail={reconciledDetail}
        loading={reconciledDetailLoading}
        partialData={reconciledDetailPartial}
        transactions={txsQuery.data || []}
      />

      <AlertDialog
        open={!!txToReverse}
        onOpenChange={(open) => {
          if (!open && !reverseBusy) setTxToReverse(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {txToReverse && isDriverPayoutTransaction(txToReverse)
                ? 'Undo payout?'
                : 'Undo cash payment?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {txToReverse && isDriverPayoutTransaction(txToReverse)
                ? 'This restores the fleet-owes balance for that Settlement Week — same as Cash Wallet undo.'
                : 'This restores cash still owed for that Settlement Week — same as Cash Wallet undo.'}
              {txToReverse ? (
                <span className="block mt-2 font-medium text-slate-700 tabular-nums">
                  {MONEY(txToReverse.amount)}
                  {txToReverse.driverName ? ` · ${txToReverse.driverName}` : ''}
                </span>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverseBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reverseBusy}
              onClick={(e) => {
                e.preventDefault();
                void confirmReverseTx();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {reverseBusy ? 'Reversing…' : 'Undo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={batchOpen} onOpenChange={(o) => !o && !batchBusy && setBatchOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {direction === 'collect' ? 'Collect from selected' : 'Pay selected drivers'}
            </DialogTitle>
            <DialogDescription>
              {selectedRows.length} week{selectedRows.length !== 1 ? 's' : ''}, {MONEY(selectedTotal)}{' '}
              total. Uses full outstanding per row.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select value={batchMethod} onValueChange={setBatchMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Mobile Money">Mobile Money</SelectItem>
                  <SelectItem value="Check">Check</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(batchMethod === 'Bank Transfer' ||
              batchMethod === 'Mobile Money' ||
              batchMethod === 'Check') && (
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input value={batchRef} onChange={(e) => setBatchRef(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Effective date</Label>
              <Input type="date" value={batchDate} onChange={(e) => setBatchDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchOpen(false)} disabled={batchBusy}>
              Cancel
            </Button>
            <Button
              className={
                direction === 'collect'
                  ? 'bg-rose-700 hover:bg-rose-800'
                  : 'bg-emerald-700 hover:bg-emerald-800'
              }
              onClick={runBatch}
              disabled={batchBusy}
            >
              {batchBusy ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving…
                </>
              ) : direction === 'collect' ? (
                `Log ${selectedRows.length} collection${selectedRows.length !== 1 ? 's' : ''}`
              ) : (
                `Record ${selectedRows.length} payout${selectedRows.length !== 1 ? 's' : ''}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** @deprecated Use DriverSettlementsPage — kept for import aliases. */
export const DriverPayoutsPage = DriverSettlementsPage;

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'owed' | 'pay' | 'pending' | 'paid';
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
      <p
        className={cn(
          'text-xl font-semibold tabular-nums mt-1',
          tone === 'owed' && 'text-rose-700',
          tone === 'pay' && 'text-emerald-800',
          tone === 'pending' && 'text-amber-700',
          tone === 'paid' && 'text-slate-900',
        )}
      >
        {value}
      </p>
      {sub ? <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p> : null}
    </div>
  );
}

function OutstandingTable({
  direction,
  rows,
  loading,
  selected,
  onToggle,
  onToggleAll,
  onOpenDriver,
  onPay,
  onCollect,
  onWriteOff,
}: {
  direction: MoneyDirection;
  rows: PeriodRow[];
  loading: boolean;
  selected: Set<string>;
  onToggle: (k: string) => void;
  onToggleAll: () => void;
  onOpenDriver?: (id: string) => void;
  onPay: (r: PeriodRow) => void;
  onCollect: (r: PeriodRow) => void;
  onWriteOff: (r: PeriodRow) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="w-10">
              <Checkbox
                checked={rows.length > 0 && selected.size === rows.length}
                onCheckedChange={onToggleAll}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Settlement Week</TableHead>
            <TableHead className="text-right">Passenger cash</TableHead>
            {direction === 'collect' ? (
              <TableHead>Status</TableHead>
            ) : (
              <TableHead className="text-right">Already paid</TableHead>
            )}
            <TableHead className="text-right">
              {direction === 'collect' ? 'Driver owes' : 'Fleet owes'}
            </TableHead>
            <TableHead className={direction === 'collect' ? 'w-[220px]' : 'w-[120px]'}></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Loading…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                No outstanding {direction === 'collect' ? 'collections' : 'payouts'} in this range.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => {
              const key = rowKey(r);
              return (
                <TableRow key={key}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(key)}
                      onCheckedChange={() => onToggle(key)}
                      aria-label={`Select ${r.driverName}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <button
                        type="button"
                        className="text-left font-medium text-slate-900 hover:text-indigo-600"
                        onClick={() => onOpenDriver?.(r.driverId)}
                      >
                        {r.driverName || r.driverId}
                      </button>
                      {Math.abs(Number(r.cashSourceMismatch) || 0) > 0.5 ? (
                        <p className="text-[10px] text-amber-700 mt-0.5">
                          Cash mismatch {MONEY(r.cashSourceMismatch)}
                        </p>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-slate-600">
                    {weekLabel(r.periodAnchor, r.periodEnd)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-slate-600">
                    {MONEY(r.cashCollected)}
                  </TableCell>
                  {direction === 'collect' ? (
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'font-normal',
                            r.collectKind === 'driver_owes'
                              ? 'bg-rose-50 text-rose-800'
                              : 'bg-amber-50 text-amber-800',
                          )}
                          title={collectKindTooltip(r.collectKind)}
                        >
                          {r.collectKind === 'driver_owes' ? 'Driver owes' : 'Cash held'}
                        </Badge>
                        <OverpaidBadge amount={rowOverpaidAmount(r)} />
                      </div>
                    </TableCell>
                  ) : (
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="tabular-nums text-slate-500">{MONEY(r.settlementPaid)}</span>
                        <OverpaidBadge amount={rowOverpaidAmount(r)} />
                      </div>
                    </TableCell>
                  )}
                  <TableCell
                    className={cn(
                      'text-right tabular-nums font-semibold',
                      direction === 'collect' ? 'text-rose-700' : 'text-emerald-800',
                    )}
                  >
                    {MONEY(direction === 'collect' ? collectAmount(r) : payOutstandingAmount(r))}
                  </TableCell>
                  <TableCell>
                    {direction === 'collect' ? (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => onWriteOff(r)}
                        >
                          <Ban className="h-3.5 w-3.5 mr-1" />
                          Write Off
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 bg-rose-700 hover:bg-rose-800"
                          onClick={() => onCollect(r)}
                        >
                          Log Cash
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="h-8 bg-emerald-700 hover:bg-emerald-800"
                        onClick={() => onPay(r)}
                      >
                        Pay
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function PendingTable({
  rows,
  direction,
  onOpenDriver,
  onVerify,
}: {
  rows: FinancialTransaction[];
  direction: MoneyDirection;
  onOpenDriver?: (id: string) => void;
  onVerify: (tx: FinancialTransaction) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Driver</TableHead>
            <TableHead>Settlement Week</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center text-slate-500">
                No pending {direction === 'collect' ? 'collections' : 'payouts'}.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell>
                  <button
                    type="button"
                    className="text-left font-medium text-slate-900 hover:text-indigo-600"
                    onClick={() => tx.driverId && onOpenDriver?.(tx.driverId)}
                  >
                    {tx.driverName || tx.driverId}
                  </button>
                </TableCell>
                <TableCell className="text-sm text-slate-600">
                  {tx.metadata?.workPeriodStart
                    ? weekLabel(
                        String(tx.metadata.workPeriodStart).slice(0, 10),
                        String(tx.metadata.workPeriodEnd || tx.metadata.workPeriodStart).slice(0, 10),
                      )
                    : '—'}
                </TableCell>
                <TableCell>{tx.paymentMethod || '—'}</TableCell>
                <TableCell className="font-mono text-xs text-slate-500">
                  {tx.referenceNumber || '—'}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {MONEY(tx.amount)}
                </TableCell>
                <TableCell>
                  <Button size="sm" variant="outline" className="h-8" onClick={() => onVerify(tx)}>
                    Verify
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function groupDoneTxsByPeriod(rows: FinancialTransaction[]): Array<{
  key: string;
  label: string;
  total: number;
  rows: FinancialTransaction[];
}> {
  const map = new Map<
    string,
    { key: string; label: string; total: number; rows: FinancialTransaction[] }
  >();
  for (const tx of rows) {
    const start = ymdKey(tx.metadata?.workPeriodStart);
    const end = ymdKey(tx.metadata?.workPeriodEnd || start);
    const key = start || '_none';
    const label = start ? weekLabel(start, end || start) : 'Untagged week';
    let g = map.get(key);
    if (!g) {
      g = { key, label, total: 0, rows: [] };
      map.set(key, g);
    }
    g.rows.push(tx);
    g.total += Math.abs(Number(tx.amount) || 0);
  }
  return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
}

function DonePayTable({
  rows,
  overpaidByPeriodKey,
  onOpenDriver,
  onReverse,
}: {
  rows: FinancialTransaction[];
  overpaidByPeriodKey: Map<string, number>;
  onOpenDriver?: (id: string) => void;
  onReverse: (tx: FinancialTransaction) => void;
}) {
  const groups = useMemo(() => groupDoneTxsByPeriod(rows), [rows]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isOverpaidTx = (tx: FinancialTransaction) => {
    const start = ymdKey(tx.metadata?.workPeriodStart);
    if (!start || !tx.driverId) return false;
    return (overpaidByPeriodKey.get(`${tx.driverId}|${start}`) || 0) > 0.005;
  };

  const groupIsOverpaid = (g: { rows: FinancialTransaction[] }) =>
    g.rows.some((tx) => isOverpaidTx(tx));

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="w-10" />
            <TableHead>Settlement Week</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Method</TableHead>
            <TableHead className="text-right">Paid to driver</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="h-24 text-center text-slate-500">
                No paid settlement payouts in this range.
              </TableCell>
            </TableRow>
          ) : (
            groups.map((g) => {
              const open = expanded.has(g.key);
              return (
                <React.Fragment key={g.key}>
                  <TableRow
                    className="bg-slate-50/80 hover:bg-slate-100 cursor-pointer"
                    onClick={() => toggle(g.key)}
                  >
                    <TableCell className="w-10 pr-0">
                      {open ? (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{g.label}</span>
                        {groupIsOverpaid(g) ? (
                          <OverpaidBadge
                            amount={
                              overpaidByPeriodKey.get(
                                `${g.rows[0]?.driverId}|${ymdKey(g.rows[0]?.metadata?.workPeriodStart)}`,
                              ) || 0
                            }
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500" colSpan={3}>
                      {g.rows.length} payout{g.rows.length !== 1 ? 's' : ''}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-emerald-800">
                      {MONEY(g.total)}
                    </TableCell>
                    <TableCell />
                    <TableCell />
                  </TableRow>
                  {open
                    ? g.rows.map((tx) => (
                        <TableRow key={tx.id} className="bg-white">
                          <TableCell />
                          <TableCell />
                          <TableCell>
                            <button
                              type="button"
                              className="text-left font-medium text-slate-900 hover:text-indigo-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (tx.driverId) onOpenDriver?.(tx.driverId);
                              }}
                            >
                              {tx.driverName || tx.driverId}
                            </button>
                          </TableCell>
                          <TableCell className="text-sm text-slate-500">
                            {String(tx.date || '').slice(0, 10) || '—'}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {tx.paymentMethod || 'Cash'}
                            {tx.description ? (
                              <span className="block text-[11px] text-slate-400 truncate max-w-[180px]">
                                {tx.description}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-emerald-800">
                            {MONEY(tx.amount)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">
                                Paid
                              </Badge>
                              {isOverpaidTx(tx) ? (
                                <OverpaidBadge
                                  amount={
                                    overpaidByPeriodKey.get(
                                      `${tx.driverId}|${ymdKey(tx.metadata?.workPeriodStart)}`,
                                    ) || 0
                                  }
                                />
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                              title="Undo payout"
                              onClick={(e) => {
                                e.stopPropagation();
                                onReverse(tx);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Undo
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                </React.Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function DoneCollectTable({
  rows,
  overpaidByPeriodKey,
  onOpenDriver,
  onReverse,
}: {
  rows: FinancialTransaction[];
  overpaidByPeriodKey: Map<string, number>;
  onOpenDriver?: (id: string) => void;
  onReverse: (tx: FinancialTransaction) => void;
}) {
  const groups = useMemo(() => groupDoneTxsByPeriod(rows), [rows]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead className="w-10" />
            <TableHead>Settlement Week</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Method</TableHead>
            <TableHead className="text-right">Cash returned</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-slate-500">
                No cleared collections in this range.
              </TableCell>
            </TableRow>
          ) : (
            groups.map((g) => {
              const open = expanded.has(g.key);
              return (
                <React.Fragment key={g.key}>
                  <TableRow
                    className="bg-slate-50/80 hover:bg-slate-100 cursor-pointer"
                    onClick={() => toggle(g.key)}
                  >
                    <TableCell className="w-10 pr-0">
                      {open ? (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{g.label}</span>
                        {(overpaidByPeriodKey.get(`${g.rows[0]?.driverId}|${g.key}`) || 0) > 0.005 ? (
                          <OverpaidBadge
                            amount={overpaidByPeriodKey.get(`${g.rows[0]?.driverId}|${g.key}`) || 0}
                          />
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-slate-500" colSpan={3}>
                      {g.rows.length} payment{g.rows.length !== 1 ? 's' : ''}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold text-emerald-700">
                      {MONEY(g.total)}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                  {open
                    ? g.rows.map((tx) => (
                        <TableRow key={tx.id} className="bg-white">
                          <TableCell />
                          <TableCell />
                          <TableCell>
                            <button
                              type="button"
                              className="text-left font-medium text-slate-900 hover:text-indigo-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (tx.driverId) onOpenDriver?.(tx.driverId);
                              }}
                            >
                              {tx.driverName || tx.driverId}
                            </button>
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {String(tx.date || '').slice(0, 10)}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600">
                            {tx.paymentMethod || 'Cash'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-emerald-700">
                            {MONEY(tx.amount)}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                              title="Undo cash payment"
                              onClick={(e) => {
                                e.stopPropagation();
                                onReverse(tx);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Undo
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                </React.Fragment>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ReconciledTable({
  rows,
  loading,
  onOpenDriver,
  onOpenPeriod,
}: {
  rows: ReconciledListRow[];
  loading: boolean;
  onOpenDriver?: (id: string) => void;
  onOpenPeriod: (r: ReconciledListRow) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Driver</TableHead>
            <TableHead>Settlement Week</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">Fleet share</TableHead>
            <TableHead className="text-right">Driver share</TableHead>
            <TableHead className="text-right">Tips paid</TableHead>
            <TableHead className="text-right">Tips withheld</TableHead>
            <TableHead className="text-right">Net payout</TableHead>
            <TableHead className="text-right">Passenger cash</TableHead>
            <TableHead className="text-right">Cash returned</TableHead>
            <TableHead className="text-right">Trips</TableHead>
            <TableHead className="text-right">Overpaid</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={13} className="h-24 text-center text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                Loading…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={13} className="h-24 text-center text-slate-500">
                No reconciled weeks in this range.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow
                key={rowKey(r)}
                className="cursor-pointer hover:bg-slate-50/80"
                onClick={() => onOpenPeriod(r)}
              >
                <TableCell>
                  <button
                    type="button"
                    className="text-left font-medium text-slate-900 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDriver?.(r.driverId);
                    }}
                  >
                    {r.driverName || r.driverId}
                  </button>
                </TableCell>
                <TableCell className="text-slate-600 whitespace-nowrap">
                  {weekLabel(r.periodAnchor, r.periodEnd)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{MONEY(r.earningsGross)}</TableCell>
                <TableCell className="text-right tabular-nums text-indigo-700">
                  {MONEY(r.fleetShare)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-emerald-700">
                  {MONEY(r.driverShare)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-slate-700">
                  {MONEY(r.tipsPaidToDriver || 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-amber-800">
                  {MONEY(r.tipsWithheld || 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {MONEY(r.payoutNet)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{MONEY(r.cashCollected)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {MONEY(r.cashReturned || 0)}
                </TableCell>
                <TableCell className="text-right tabular-nums text-slate-500">
                  {r.tripCount}
                </TableCell>
                <TableCell className="text-right tabular-nums text-violet-800">
                  {rowOverpaidAmount(r) > 0.005 ? MONEY(rowOverpaidAmount(r)) : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge
                      variant="secondary"
                      className="font-normal bg-emerald-50 text-emerald-800 border border-emerald-100"
                    >
                      Reconciled
                    </Badge>
                    <OverpaidBadge amount={rowOverpaidAmount(r)} />
                    {Math.abs(Number(r.cashSourceMismatch) || 0) > 0.5 ? (
                      <span className="text-[10px] text-amber-700">
                        Cash source mismatch {MONEY(r.cashSourceMismatch)}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
