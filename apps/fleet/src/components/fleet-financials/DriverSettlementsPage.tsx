/**
 * Business Finance → Driver Settlements
 * Fleet-wide Collect (Log Cash) + Pay (Record Payout) queue — same txs as Cash Wallet.
 * Hub tabs: Cash desk · Close Week · Restatements.
 */
import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Banknote,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { MONEY_EPS, periodEndForAnchor } from '@roam/finance-core';
import {
  isSettlementPeriodEnded,
  settlementPeriodOpenMessage,
} from '../../utils/settlementPeriodGate';
import { api } from '../../services/api';
import { mergeDoneCashHistory } from '../../utils/settlementDoneHistory';
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
import { payOutstandingAmount, resolvePayQueueOwed } from '../../utils/driverSettlementsPayAmount';
import { CSV_UTF8_BOM, csvRow } from '../../utils/csvSafeExport';
import { DRIVER_FINANCIAL_PERIODS_KEY } from '../../hooks/useDriverFinancialPeriods';
import {
  useSettlementQueue,
  settlementKeys,
  type SettlementQueueResponse,
  type SettlementQueueRow,
} from '../../hooks/useSettlementQueue';
import { resolvePeriodTollCashWash } from '../../utils/periodTollCashSpend';
import {
  requiresApproval,
  SETTLEMENT_APPROVAL_THRESHOLD,
} from '../../utils/settlementEnterprise';
import { BusinessFinanceDeskChrome } from '../business-finance/BusinessFinanceDeskChrome';
import {
  ApprovalQueue,
  MovementHistoryTable,
  ReconciledTable,
  SettlementFilters,
  SettlementKpiBar,
  SettlementQueueTable,
  type SettlementMovementRow,
} from './settlements';
import { settlementCommandsApi, isSettlementCommandUnavailable, isPeriodFrozenError, isMoneyLockedError } from '../../services/settlementCommandsApi';
import { useSettlementCommands, newIdempotencyKey } from '../../hooks/useSettlementCommands';
import { useServiceLineScopeParam } from '../../hooks/useServiceLineScopeParam';
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
import { Textarea } from '../ui/textarea';
import { cn } from '../ui/utils';
import type { FinancialTransaction } from '../../types/data';
import {
  listWeekStatementRestatements,
  RESTATEMENT_QUEUE_QUERY_KEY,
} from '../../pages/RestatementQueuePage';
import {
  PeriodFrozenDialog,
  type PeriodFrozenDialogState,
} from './settlements/PeriodFrozenDialog';
import {
  MoneyLockedDialog,
  type MoneyLockedDialogState,
} from './settlements/MoneyLockedDialog';
import { computeSettlementLaneMetrics } from '../../utils/settlementLaneMetrics';

const CloseWeekPageLazy = lazy(() =>
  import('../../pages/CloseWeekPage').then((m) => ({ default: m.CloseWeekPage })),
);
const RestatementQueuePageLazy = lazy(() =>
  import('../../pages/RestatementQueuePage').then((m) => ({ default: m.RestatementQueuePage })),
);

type MoneyDirection = 'collect' | 'pay';
type DeskMode = MoneyDirection | 'log-cash' | 'reconciled';
type DeskTab = 'outstanding' | 'awaiting' | 'done';
export type SettlementsHubTab = 'cash' | 'close-week' | 'restatements';

type SettlementsNavigateOpts =
  | { startYmd: string; endYmd?: string }
  | { weekKey: string };

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
  if (direct > MONEY_EPS) return direct;
  const fc = (r.metadata?.financeCore || {}) as Record<string, unknown>;
  return Number(fc.overpaidAmount) || 0;
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

/** Map queue API row → PeriodRow (amountOwed from major or minor). */
function queueToPeriodRow(r: SettlementQueueRow): PeriodRow {
  const amountOwed =
    r.amountOwed != null && Number.isFinite(r.amountOwed)
      ? Math.max(0, Number(r.amountOwed))
      : Math.max(0, (Number(r.amountOwedMinor) || 0) / 100);
  return {
    driverId: r.driverId,
    driverName: r.driverName,
    periodAnchor: ymdKey(r.periodAnchor),
    periodEnd: ymdKey(r.periodEnd || r.periodAnchor),
    settlementAmount: Number(r.settlementAmount) || 0,
    settlementPaid: Number(r.settlementPaid) || 0,
    cashCollected: Number(r.cashCollected) || 0,
    cashReturned: Number(r.cashReturned) || 0,
    cashStillHeld: Number(r.cashStillHeld) || 0,
    amountOwed,
    tripCount: Number(r.tripCount) || 0,
    settlementStatus: String(r.settlementStatus || ''),
    fuelFinalized: r.fuelFinalized,
    collectKind: r.collectKind,
    overpaidAmount: Number(r.overpaidAmount) || 0,
    cashSourceMismatch: Number(r.cashSourceMismatch) || 0,
    metadata: r.metadata ?? null,
  };
}

function queueToReconciledRow(r: SettlementQueueRow): ReconciledListRow {
  const base = queueToPeriodRow(r);
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
    payoutNet: Number.isFinite(Number(r.payoutNet)) ? Number(r.payoutNet) : 0,
    tipsPaidToDriver: Number.isFinite(Number(r.tipsPaidToDriver)) ? Number(r.tipsPaidToDriver) : 0,
    tipsWithheld: Number.isFinite(Number(r.tipsWithheld)) ? Number(r.tipsWithheld) : 0,
    overpaidAmount: rowOverpaidAmount(r),
  };
}

function queueOwedMajor(r: SettlementQueueRow, mode: MoneyDirection): number {
  // Pay: settlementAmount is already residual — ignore amountOwed so a bad queue cannot understate.
  if (mode === 'pay') return resolvePayQueueOwed(r);
  if (r.amountOwed != null && Number.isFinite(r.amountOwed)) return Math.max(0, Number(r.amountOwed));
  if (r.amountOwedMinor != null) return Math.max(0, (Number(r.amountOwedMinor) || 0) / 100);
  return Math.max(0, Math.abs(Number(r.settlementAmount) || 0));
}

function txToMovementRow(t: FinancialTransaction, kind: 'collect' | 'pay'): SettlementMovementRow {
  const periodAnchor = ymdKey(t.metadata?.workPeriodStart || t.date);
  const storedEnd = ymdKey(t.metadata?.workPeriodEnd);
  return {
    id: String(t.id),
    kind,
    driverId: t.driverId,
    driverName: t.driverName,
    amount: Math.abs(Number(t.amount) || 0),
    method: t.paymentMethod,
    status: t.status,
    date: t.date,
    periodAnchor,
    // Mon–Sun week label — never collapse end to the Monday anchor.
    periodEnd: storedEnd && storedEnd !== periodAnchor ? storedEnd : periodEndForAnchor(periodAnchor),
    reference: t.referenceNumber,
    description: t.description,
  };
}

function txSettlementWeekStart(t: FinancialTransaction): string {
  return ymdKey(t.metadata?.workPeriodStart || t.date);
}

/** True when id is a UUID (settlement_movements PK). */
function looksLikeUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(id || '').trim(),
  );
}

function mapApiMovementToRow(r: {
  id: string;
  kind: string;
  driverId: string;
  driverName?: string;
  periodAnchor: string;
  amount: number;
  method?: string | null;
  reference?: string | null;
  reason?: string | null;
  status?: string;
  approvalState?: string;
  sourceTransactionId?: string | null;
  createdAt?: string;
}): SettlementMovementRow {
  return {
    id: String(r.id),
    kind: r.kind,
    driverId: r.driverId,
    driverName: r.driverName,
    amount: Math.abs(Number(r.amount) || 0),
    method: r.method || undefined,
    status: r.status,
    date: r.createdAt ? String(r.createdAt).slice(0, 10) : undefined,
    periodAnchor: ymdKey(r.periodAnchor),
    // Movements store Monday only — derive Sunday so Done shows Aug 24–30, not 24–24.
    periodEnd: periodEndForAnchor(ymdKey(r.periodAnchor)),
    reference: r.reference || undefined,
    description: r.reason || undefined,
    approvalState: r.approvalState,
    // Always set when from movements API (empty = no dual-write tx) so reverse/verify can detect movement rows.
    sourceTransactionId: r.sourceTransactionId ? String(r.sourceTransactionId) : '',
  };
}

type ReverseTarget = Pick<
  SettlementMovementRow,
  'id' | 'kind' | 'amount' | 'driverName' | 'sourceTransactionId'
>;

export function DriverSettlementsPage({
  onBackToBusinessFinance,
  onOpenDriver,
  onNavigate,
  initialHubTab,
  initialWeekKey,
  onSettlementsHintsConsumed,
}: {
  onBackToBusinessFinance?: () => void;
  onOpenDriver?: (driverId: string) => void;
  onNavigate?: (page: string, opts?: SettlementsNavigateOpts) => void;
  initialHubTab?: SettlementsHubTab | null;
  initialWeekKey?: string | null;
  onSettlementsHintsConsumed?: () => void;
}) {
  const qc = useQueryClient();
  const settlementCmds = useSettlementCommands();
  const { scope, serviceLineParam } = useServiceLineScopeParam();
  const thisMonday = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  const [hubTab, setHubTab] = useState<SettlementsHubTab>(initialHubTab || 'cash');
  const [closeWeekKey, setCloseWeekKey] = useState<string | undefined>(
    initialWeekKey || undefined,
  );
  const [weekFrom, setWeekFrom] = useState(
    format(subWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 8), 'yyyy-MM-dd'),
  );
  const [weekTo, setWeekTo] = useState(
    format(endOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  );
  /** When true, omit week bounds so cards + queues show all open unpaid weeks. */
  const [allOpen, setAllOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [minAmount, setMinAmount] = useState('0');
  const [deskMode, setDeskMode] = useState<DeskMode>('collect');
  const direction: MoneyDirection = deskMode === 'pay' ? 'pay' : 'collect';
  const [deskTab, setDeskTab] = useState<DeskTab>('outstanding');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Deep-link / sidebar → hub tab + Close Week key
  useEffect(() => {
    if (!initialHubTab && !initialWeekKey) return;
    if (initialHubTab) setHubTab(initialHubTab);
    if (initialWeekKey) setCloseWeekKey(initialWeekKey);
    onSettlementsHintsConsumed?.();
  }, [initialHubTab, initialWeekKey, onSettlementsHintsConsumed]);

  const restatementBadgeQuery = useQuery({
    queryKey: RESTATEMENT_QUEUE_QUERY_KEY,
    queryFn: listWeekStatementRestatements,
    staleTime: 60_000,
  });
  const restatementDraftCount = (restatementBadgeQuery.data || []).filter(
    (r) => String(r.status || 'draft').toLowerCase() === 'draft',
  ).length;

  const handleHubNavigate = (
    page: string,
    opts?: SettlementsNavigateOpts,
  ) => {
    if (page === 'close-week') {
      if (opts && 'weekKey' in opts && typeof opts.weekKey === 'string') {
        setCloseWeekKey(opts.weekKey);
      }
      setHubTab('close-week');
      return;
    }
    if (page === 'restatement-queue') {
      setHubTab('restatements');
      return;
    }
    if (page === 'driver-settlements' || page === 'driver-payouts') {
      setHubTab('cash');
      return;
    }
    onNavigate?.(page, opts);
  };
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchSelectedKeys, setBatchSelectedKeys] = useState<string[]>([]);
  const [batchMethod, setBatchMethod] = useState('Cash');
  const [batchDate, setBatchDate] = useState(new Date().toISOString().split('T')[0]);
  const [batchRef, setBatchRef] = useState('');
  const [batchBusy, setBatchBusy] = useState(false);
  const [periodFrozenDialog, setPeriodFrozenDialog] = useState<PeriodFrozenDialogState>(null);
  const [moneyLockedDialog, setMoneyLockedDialog] = useState<MoneyLockedDialogState>(null);

  const showPeriodFrozen = (weekKey: string, driverName?: string) => {
    setPeriodFrozenDialog({
      weekKey: String(weekKey || '').slice(0, 10),
      driverName: driverName || undefined,
    });
  };

  const showMoneyLocked = (weekKey: string, driverName?: string) => {
    setMoneyLockedDialog({
      weekKey: String(weekKey || '').slice(0, 10),
      driverName: driverName || undefined,
    });
  };

  const rangeWeekFrom = allOpen ? undefined : weekFrom;
  const rangeWeekTo = allOpen ? undefined : weekTo;
  const rangeScopeLabel = allOpen ? 'all open' : 'in selected range';
  const exposureScopeLabel = allOpen ? 'all open weeks' : 'in selected weeks';
  const exportRangeTag = allOpen ? 'all-open' : `${weekFrom}-to-${weekTo}`;

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

  const [txToReverse, setTxToReverse] = useState<ReverseTarget | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseBusy, setReverseBusy] = useState(false);
  const [logCashDriverId, setLogCashDriverId] = useState('');
  const [reconciledOverlay, setReconciledOverlay] = useState<{
    open: boolean;
    driverId: string;
    driverName: string;
    periodAnchor: string;
    periodEnd: string;
  }>({ open: false, driverId: '', driverName: '', periodAnchor: '', periodEnd: '' });
  const [reconciledDetail, setReconciledDetail] = useState<ReconciledPeriodDetail | null>(null);
  const [reconciledDetailPartial, setReconciledDetailPartial] = useState(false);
  const [reconciledDetailLoading, setReconciledDetailLoading] = useState(false);

  const queueParamsBase = {
    weekFrom: rangeWeekFrom,
    weekTo: rangeWeekTo,
    minAmount: minAmount ? Number(minAmount) : 0,
    scope,
    search,
    pageSize: 200,
    groupBy: 'week' as const,
  };

  // R-9: single read model — collect + pay always (KPI + lists); reconciled on demand
  const collectQueueQuery = useSettlementQueue(
    { view: 'collect', ...queueParamsBase },
    { enabled: true },
  );
  const payQueueQuery = useSettlementQueue(
    { view: 'pay', ...queueParamsBase },
    { enabled: true },
  );
  const reconciledQueueQuery = useSettlementQueue(
    { view: 'reconciled', ...queueParamsBase },
    { enabled: deskMode === 'reconciled' },
  );

  // N-6: surface hidden NULL-org periods so KPIs are not silently incomplete.
  const healthQuery = useQuery({
    queryKey: settlementKeys.health(),
    queryFn: () => settlementCommandsApi.getHealth(),
    staleTime: 60_000,
  });
  const nullOrgPeriodCount = healthQuery.data?.nullOrgPeriodCount ?? 0;

  const movementsQuery = useQuery({
    queryKey: settlementKeys.movements({
      weekFrom: rangeWeekFrom,
      weekTo: rangeWeekTo,
      kind: direction === 'pay' ? 'pay' : 'collect',
    }),
    queryFn: () =>
      settlementCommandsApi.getMovements({
        weekFrom: rangeWeekFrom,
        weekTo: rangeWeekTo,
        kind: direction === 'pay' ? 'pay' : 'collect',
        pageSize: 500,
      }),
    enabled: deskMode === 'collect' || deskMode === 'pay',
  });

  const pendingApprovalsQuery = useQuery({
    queryKey: settlementKeys.movements({
      weekFrom: rangeWeekFrom,
      weekTo: rangeWeekTo,
      approvalState: 'pending',
    }),
    queryFn: () =>
      settlementCommandsApi.getMovements({
        weekFrom: rangeWeekFrom,
        weekTo: rangeWeekTo,
        approvalState: 'pending',
        pageSize: 200,
      }),
    enabled: deskMode === 'collect' || deskMode === 'pay',
  });

  const txsQuery = useQuery({
    queryKey: ['driverSettlementsTransactions', rangeWeekFrom ?? '', rangeWeekTo ?? '', scope, allOpen],
    queryFn: async () => {
      // Desk Done/Awaiting only — not the reconciled overlay (P-4).
      const page = await api.getTransactions(undefined, {
        limit: 1000,
        offset: 0,
        ...(rangeWeekFrom ? { startDate: rangeWeekFrom } : {}),
        ...(rangeWeekTo ? { endDate: rangeWeekTo } : {}),
        desk: 'settlements',
        ...(serviceLineParam ? { serviceLine: serviceLineParam } : {}),
      });
      return (Array.isArray(page) ? page : page?.data || []) as FinancialTransaction[];
    },
    enabled: deskMode === 'collect' || deskMode === 'pay' || deskMode === 'log-cash',
  });

  // P-4: overlay txs scoped to driver + week — never the 5k desk dump.
  const overlayTxsQuery = useQuery({
    queryKey: [
      'reconciledOverlayTxs',
      reconciledOverlay.driverId,
      reconciledOverlay.periodAnchor,
      reconciledOverlay.periodEnd,
    ],
    queryFn: async () => {
      const page = await api.getTransactions(reconciledOverlay.driverId, {
        limit: 500,
        offset: 0,
        startDate: reconciledOverlay.periodAnchor,
        endDate: reconciledOverlay.periodEnd || reconciledOverlay.periodAnchor,
        desk: 'settlements',
      });
      return (Array.isArray(page) ? page : page?.data || []) as FinancialTransaction[];
    },
    enabled: reconciledOverlay.open && !!reconciledOverlay.driverId && !!reconciledOverlay.periodAnchor,
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

  // R-4: queue rows for modals / selection — KPI totals come from API totals + laneMetrics.
  const collectOutstanding = useMemo(() => {
    return (collectQueueQuery.data?.rows || [])
      .map(queueToPeriodRow)
      .filter((r) => collectAmount(r) > MONEY_EPS)
      .sort(compareBySettlementWeekDesc);
  }, [collectQueueQuery.data?.rows]);

  // Prefer API SettlementQueueRow[] directly for Collect/Pay outstanding table
  const outstandingQueueRows = useMemo(() => {
    const rows =
      direction === 'pay'
        ? payQueueQuery.data?.rows || []
        : collectQueueQuery.data?.rows || [];
    return rows.filter((r) => queueOwedMajor(r, direction) > MONEY_EPS);
  }, [direction, collectQueueQuery.data?.rows, payQueueQuery.data?.rows]);

  const activeQueueQuery = direction === 'pay' ? payQueueQuery : collectQueueQuery;

  const outstandingShowingAmount = outstandingQueueRows.reduce(
    (s, r) => s + queueOwedMajor(r, direction),
    0,
  );
  const outstandingTotalAmount =
    activeQueueQuery.data?.totals?.amountOwedMinor != null
      ? (activeQueueQuery.data.totals.amountOwedMinor || 0) / 100
      : outstandingShowingAmount;

  const apiMovementRows = useMemo(() => {
    const raw = movementsQuery.data?.rows || [];
    return raw.map((r) => mapApiMovementToRow(r as Parameters<typeof mapApiMovementToRow>[0]));
  }, [movementsQuery.data?.rows]);

  const pendingApprovalRows = useMemo(() => {
    const raw = pendingApprovalsQuery.data?.rows || [];
    return raw.map((r) => mapApiMovementToRow(r as Parameters<typeof mapApiMovementToRow>[0]));
  }, [pendingApprovalsQuery.data?.rows]);

  const awaitingRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (apiMovementRows.length > 0) {
      return apiMovementRows
        .filter((m) => {
          const st = String(m.status || '').toLowerCase();
          const ap = String(m.approvalState || '').toLowerCase();
          if (st !== 'pending') return false;
          if (ap === 'pending') return false; // approval queue owns maker-checker rows
          if (direction === 'pay' && m.kind !== 'pay') return false;
          if (direction === 'collect' && m.kind !== 'collect') return false;
          if (!q) return true;
          return (
            String(m.driverName || '').toLowerCase().includes(q) ||
            String(m.driverId || '').toLowerCase().includes(q) ||
            String(m.periodAnchor || '').includes(q)
          );
        })
        .sort((a, b) => {
          const week = ymdKey(b.periodAnchor).localeCompare(ymdKey(a.periodAnchor));
          if (week !== 0) return week;
          return String(a.driverName || '').localeCompare(String(b.driverName || ''), undefined, {
            sensitivity: 'base',
          });
        });
    }
    // Legacy tx fallback during cutover
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
      .map((t) => txToMovementRow(t, direction))
      .sort((a, b) => {
        const week = ymdKey(b.periodAnchor).localeCompare(ymdKey(a.periodAnchor));
        if (week !== 0) return week;
        return String(a.driverName || '').localeCompare(String(b.driverName || ''), undefined, {
          sensitivity: 'base',
        });
      });
  }, [apiMovementRows, txsQuery.data, search, direction]);

  // Root cause fix: always union Log Cash txs with settlement_movements.
  // Previously any movement row short-circuited Done and hid months of Cash Collections.
  const doneMovementRows = useMemo(() => {
    return mergeDoneCashHistory({
      direction,
      movements: apiMovementRows,
      legacyTxs: txsQuery.data || [],
      weekFrom: rangeWeekFrom ?? '',
      weekTo: rangeWeekTo ?? '',
      search,
      isClearedTx: (t) =>
        direction === 'pay'
          ? isClearedDriverPayout(t as FinancialTransaction)
          : isClearedDriverCashPayment(t as FinancialTransaction),
    }) as SettlementMovementRow[];
  }, [apiMovementRows, txsQuery.data, search, direction, rangeWeekFrom, rangeWeekTo]);

  const reconciledRows = useMemo(() => {
    return (reconciledQueueQuery.data?.rows || [])
      .map(queueToReconciledRow)
      .sort(compareBySettlementWeekDesc);
  }, [reconciledQueueQuery.data?.rows]);

  // N-5 / U-4 / P-7: same lane metrics path as Close Week
  const collectQueueRows = collectQueueQuery.data?.rows || [];
  const payQueueRows = payQueueQuery.data?.rows || [];
  const laneMetrics = useMemo(
    () => computeSettlementLaneMetrics(collectQueueRows, payQueueRows),
    [collectQueueRows, payQueueRows],
  );
  const settledOwesTotal = laneMetrics.driversOwe;
  const cashHeldKpiTotal = laneMetrics.cashHeld;
  const fleetOwesTotal =
    payQueueQuery.data?.totals?.amountOwedMinor != null
      ? (payQueueQuery.data.totals.amountOwedMinor || 0) / 100
      : laneMetrics.fleetOwes;
  const settledOwesWeekCount = collectQueueRows.filter((r) => r.collectKind !== 'cash_held').length;
  const cashHeldWeekCount = collectQueueRows.filter((r) => r.collectKind === 'cash_held').length;
  const fleetOwesWeekCount =
    payQueueQuery.data?.page?.total ?? payQueueQuery.data?.rows?.length ?? 0;
  const blockedExposure = laneMetrics.blockedExposure;
  const awaitingPayTotal = apiMovementRows.length
    ? apiMovementRows
        .filter(
          (m) =>
            m.kind === 'pay' &&
            String(m.status || '').toLowerCase() === 'pending' &&
            String(m.approvalState || '').toLowerCase() !== 'pending',
        )
        .reduce((s, m) => s + Math.abs(Number(m.amount) || 0), 0)
    : (txsQuery.data || [])
        .filter((t) => isDriverPayoutTransaction(t) && String(t.status || '').toLowerCase() === 'pending')
        .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const awaitingCollectTotal = apiMovementRows.length
    ? apiMovementRows
        .filter(
          (m) =>
            m.kind === 'collect' &&
            String(m.status || '').toLowerCase() === 'pending' &&
            String(m.approvalState || '').toLowerCase() !== 'pending',
        )
        .reduce((s, m) => s + Math.abs(Number(m.amount) || 0), 0)
    : (txsQuery.data || [])
        .filter(
          (t) =>
            isDriverCashPaymentTransaction(t) &&
            !isClearedDriverCashPayment(t) &&
            String(t.status || '').toLowerCase() === 'pending',
        )
        .reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0);
  const awaitingTotal = direction === 'pay' ? awaitingPayTotal : awaitingCollectTotal;
  const clearedPayThisWeek = doneMovementRows
    .filter((m) => {
      if (String(m.kind).toLowerCase() !== 'pay') return false;
      return String(m.date || '').slice(0, 10) >= thisMonday;
    })
    .reduce((s, m) => s + Math.abs(Number(m.amount) || 0), 0);
  const clearedCollectThisWeek = doneMovementRows
    .filter((m) => {
      if (String(m.kind).toLowerCase() !== 'collect') return false;
      return String(m.date || '').slice(0, 10) >= thisMonday;
    })
    .reduce((s, m) => s + Math.abs(Number(m.amount) || 0), 0);
  const clearedThisWeek = direction === 'pay' ? clearedPayThisWeek : clearedCollectThisWeek;

  // C-4: incompleteness follows page.hasMore on any view (not only All open).
  const kpiTotalsPossiblyIncomplete = Boolean(
    collectQueueQuery.data?.page?.hasMore ||
      collectQueueQuery.data?.page?.truncated ||
      payQueueQuery.data?.page?.hasMore ||
      payQueueQuery.data?.page?.truncated,
  );

  // Per-basis errors — don't blank Collect KPIs when only the tx history query fails.
  const collectKpiError = collectQueueQuery.isError;
  const payKpiError = payQueueQuery.isError;
  const txKpiError = movementsQuery.isError && txsQuery.isError;

  useEffect(() => {
    setSelected(new Set());
  }, [deskTab, deskMode, weekFrom, weekTo, search, allOpen]);

  // S2-9: keep selection intersected with live outstanding keys
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(outstandingQueueRows.map((r) => rowKey(r)));
      const next = new Set([...prev].filter((k) => live.has(k)));
      return next.size === prev.size ? prev : next;
    });
  }, [outstandingQueueRows]);

  const findFreshCollectRow = (driverId: string, periodAnchor: string): PeriodRow | undefined => {
    const cached = qc.getQueryData<SettlementQueueResponse>(
      settlementKeys.queue({
        view: 'collect',
        ...queueParamsBase,
      }),
    );
    const match = (cached?.rows || []).find(
      (r) => r.driverId === driverId && ymdKey(r.periodAnchor) === periodAnchor,
    );
    return match ? queueToPeriodRow(match) : undefined;
  };

  const openLogCashForDriver = (driverId: string, driverName: string, row?: PeriodRow) => {
    const openWeeks = collectOutstanding.filter((r) => r.driverId === driverId);
    const endedWeeks = openWeeks.filter((r) =>
      isSettlementPeriodEnded({
        periodAnchor: r.periodAnchor,
        periodEnd: r.periodEnd,
      }),
    );
    const target = row || endedWeeks[0] || openWeeks[0];
    if (
      target &&
      !isSettlementPeriodEnded({
        periodAnchor: target.periodAnchor,
        periodEnd: target.periodEnd,
      })
    ) {
      toast.error(
        settlementPeriodOpenMessage({
          periodAnchor: target.periodAnchor,
          periodEnd: target.periodEnd,
        }),
      );
      return;
    }
    const maxAmount = target
      ? collectAmount(target)
      : endedWeeks.reduce((s, r) => s + collectAmount(r), 0);
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
    const row = outstandingQueueRows.find((r) => rowKey(r) === key);
    if (
      row &&
      !selected.has(key) &&
      !isSettlementPeriodEnded({
        periodAnchor: row.periodAnchor,
        periodEnd: row.periodEnd,
      })
    ) {
      toast.error(
        settlementPeriodOpenMessage({
          periodAnchor: row.periodAnchor,
          periodEnd: row.periodEnd,
        }),
      );
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const actionable = outstandingQueueRows.filter((r) =>
      isSettlementPeriodEnded({
        periodAnchor: r.periodAnchor,
        periodEnd: r.periodEnd,
      }),
    );
    if (selected.size === actionable.length && actionable.length > 0) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(actionable.map((r) => rowKey(r))));
  };

  const selectedRows = outstandingQueueRows.filter((r) => selected.has(rowKey(r)));
  const selectedTotal = selectedRows.reduce((s, r) => s + queueOwedMajor(r, direction), 0);

  const refreshAll = async () => {
    // P-6: Refresh is invalidate-only — repair is a separate explicit action.
    settlementCmds.invalidate();
    void qc.invalidateQueries({ queryKey: settlementKeys.all });
    void qc.invalidateQueries({ queryKey: ['driverSettlementsTransactions'] });
    void qc.invalidateQueries({ queryKey: [DRIVER_FINANCIAL_PERIODS_KEY] });
  };

  const repairOrphanMirrors = async () => {
    try {
      const repair = await api.repairOrphanSettlementMirrors({
        ...(rangeWeekFrom ? { periodStart: rangeWeekFrom } : {}),
        ...(rangeWeekTo ? { periodEnd: rangeWeekTo } : {}),
      });
      if (repair?.purged || repair?.weeksSynced) {
        toast.success(
          `Mirrors repaired${repair.purged ? ` · cleaned ${repair.purged} stale pays` : ''}${
            repair.weeksSynced ? ` · recalculated ${repair.weeksSynced} weeks` : ''
          }`,
        );
      } else {
        toast.success('No orphan mirrors found');
      }
    } catch (e: any) {
      console.warn('[DriverSettlements] orphan mirror repair failed:', e?.message || e);
      toast.error(e?.message || 'Could not repair settlement mirrors');
    }
    await refreshAll();
  };

  const openReconciledPeriod = async (row: ReconciledListRow) => {
    setReconciledOverlay({
      open: true,
      driverId: row.driverId,
      driverName: row.driverName || row.driverId,
      periodAnchor: row.periodAnchor,
      periodEnd: row.periodEnd,
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
        projectionSources:
          ((d.metadata as Record<string, unknown>)?.financeCore as Record<string, unknown>)
            ?.projectionSources as Record<string, string> | undefined,
        serviceLineBreakdown: (d.metadata as Record<string, unknown>)?.serviceLineBreakdown as
          | Record<string, unknown>
          | undefined,
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
        projectionSources:
          (row.metadata?.financeCore as Record<string, unknown> | undefined)?.projectionSources as
            | Record<string, string>
            | undefined,
        serviceLineBreakdown: row.metadata?.serviceLineBreakdown as
          | Record<string, unknown>
          | undefined,
      });
    } finally {
      setReconciledDetailLoading(false);
    }
  };

  const exportCsv = () => {
    const rows = selectedRows.length > 0 ? selectedRows : outstandingQueueRows;
    if (rows.length === 0) {
      toast.error('Nothing to export');
      return;
    }
    const header =
      direction === 'collect'
        ? ['driver_id', 'driver_name', 'period_start', 'period_end', 'amount_owed', 'collect_kind', 'overpaid_amount', 'passenger_cash']
        : ['driver_id', 'driver_name', 'period_start', 'period_end', 'amount_owed', 'overpaid_amount', 'passenger_cash', 'already_paid'];
    const lines = [
      csvRow(header),
      ...rows.map((r) =>
        direction === 'collect'
          ? csvRow([
              r.driverId,
              r.driverName || '',
              r.periodAnchor,
              r.periodEnd,
              queueOwedMajor(r, 'collect').toFixed(2),
              r.collectKind || '',
              rowOverpaidAmount(r).toFixed(2),
              Number(r.cashCollected || 0).toFixed(2),
            ])
          : csvRow([
              r.driverId,
              r.driverName || '',
              r.periodAnchor,
              r.periodEnd,
              queueOwedMajor(r, 'pay').toFixed(2),
              rowOverpaidAmount(r).toFixed(2),
              Number(r.cashCollected || 0).toFixed(2),
              Number(r.settlementPaid || 0).toFixed(2),
            ]),
      ),
    ];
    const blob = new Blob([CSV_UTF8_BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `driver-settlements-${direction}-${exportRangeTag}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} row${rows.length !== 1 ? 's' : ''}`);
  };

  const exportDoneCsv = () => {
    const rows = doneMovementRows;
    if (rows.length === 0) {
      toast.error('Nothing to export');
      return;
    }
    const header = [
      'id',
      'driver_id',
      'driver_name',
      'date',
      'period_start',
      'amount',
      'method',
      'status',
      'reference',
    ];
    const lines = [
      csvRow(header),
      ...rows.map((t) =>
        csvRow([
          t.id,
          t.driverId || '',
          t.driverName || '',
          String(t.date || '').slice(0, 10),
          ymdKey(t.periodAnchor),
          Math.abs(Number(t.amount) || 0).toFixed(2),
          t.method || '',
          t.status || '',
          t.reference || '',
        ]),
      ),
    ];
    const blob = new Blob([CSV_UTF8_BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `driver-settlements-done-${direction}-${exportRangeTag}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} row${rows.length !== 1 ? 's' : ''}`);
  };

  const exportReconciledCsv = () => {
    if (reconciledRows.length === 0) {
      toast.error('Nothing to export');
      return;
    }
    const header = [
      'driver_id',
      'driver_name',
      'period_start',
      'period_end',
      'gross',
      'fleet_share',
      'driver_share',
      'payout_net',
      'cash_collected',
      'cash_returned',
      'trips',
      'overpaid',
    ];
    const lines = [
      csvRow(header),
      ...reconciledRows.map((r) =>
        csvRow([
          r.driverId,
          r.driverName || '',
          r.periodAnchor,
          r.periodEnd,
          Number(r.earningsGross || 0).toFixed(2),
          Number(r.fleetShare || 0).toFixed(2),
          Number(r.driverShare || 0).toFixed(2),
          Number(r.payoutNet || 0).toFixed(2),
          Number(r.cashCollected || 0).toFixed(2),
          Number(r.cashReturned || 0).toFixed(2),
          r.tripCount,
          rowOverpaidAmount(r).toFixed(2),
        ]),
      ),
    ];
    const blob = new Blob([CSV_UTF8_BOM + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `driver-settlements-reconciled-${exportRangeTag}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${reconciledRows.length} row${reconciledRows.length !== 1 ? 's' : ''}`);
  };

  const saveSinglePayout = async (payload: RecordPayoutSavePayload) => {
    const weekAnchor = String(payload.workPeriodStart || payoutModal.workPeriodStart || '').slice(0, 10);
    const amount = Math.abs(Number(payload.amount) || 0);
    try {
      const res = await settlementCommandsApi.pay({
        driverId: payoutModal.driverId,
        weekAnchor,
        amount,
        method: payload.paymentMethod,
        reference: payload.referenceNumber,
        note: payload.notes,
        idempotencyKey: newIdempotencyKey(),
        expectedOutstanding: payoutModal.maxAmount,
      });
      const needsApproval =
        (res as { requiresApproval?: boolean })?.requiresApproval === true ||
        (requiresApproval(amount, SETTLEMENT_APPROVAL_THRESHOLD) &&
          String(payload.paymentMethod || '') !== 'Cash');
      if (needsApproval) {
        toast.info('Sent for approval');
      }
    } catch (err) {
      // Cutover: only when command endpoint is absent — never on business 4xx.
      if (isPeriodFrozenError(err)) {
        setPayoutModal((m) => ({ ...m, isOpen: false }));
        showPeriodFrozen(weekAnchor, payoutModal.driverName);
        // Handled — do not rethrow (RecordPayoutModal would toast the raw PERIOD_FROZEN text).
        return;
      }
      if (isMoneyLockedError(err)) {
        setPayoutModal((m) => ({ ...m, isOpen: false }));
        showMoneyLocked(weekAnchor, payoutModal.driverName);
        return;
      }
      if (!isSettlementCommandUnavailable(err)) {
        toast.error(err instanceof Error ? err.message : 'Pay failed');
        throw err;
      }
      // R-3: no legacy saveTransaction fallback — commands endpoint is required.
      toast.error('Settlement commands unavailable — redeploy fleet-server');
      throw err;
    }
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
    let serverAfter: number | null = null;
    const amount = Math.abs(Number(payment.amount) || 0);
    const overCollect = amount > beforeAmt + MONEY_EPS;
    const overReason =
      payment.notes?.match(/\[Over-collection\]\s*(.+)/i)?.[1]?.trim() ||
      (overCollect ? String(payment.notes || '').trim() : undefined);

    // R-3: intentional float/adjustment only (no settlement command yet). Never a pay/collect fallback.
    if (payment.transactionType !== 'payment' || !weekStart) {
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
    } else {
      try {
        const res = await settlementCommandsApi.collect({
          driverId: collectModal.driverId,
          weekAnchor: weekStart,
          amount,
          method: payment.paymentMethod,
          reference: payment.referenceNumber,
          note: payment.notes,
          idempotencyKey: newIdempotencyKey(),
          expectedOutstanding: beforeAmt,
          ...(overCollect
            ? { allowOverCollect: true, reason: overReason || 'Over-collection' }
            : {}),
        });
        const period = (res as { period?: Record<string, unknown> })?.period;
        if (period) {
          const owed = Math.max(
            0,
            Number(period.amountOwed) ||
              Math.abs(Number(period.settlementAmount) || 0) ||
              Number(period.cashStillHeld) ||
              0,
          );
          serverAfter = owed;
        }
      } catch (err) {
        if (isPeriodFrozenError(err)) {
          setCollectModal((m) => ({ ...m, isOpen: false }));
          showPeriodFrozen(weekStart, collectModal.driverName);
          return;
        }
        if (isMoneyLockedError(err)) {
          setCollectModal((m) => ({ ...m, isOpen: false }));
          showMoneyLocked(weekStart, collectModal.driverName);
          return;
        }
        if (!isSettlementCommandUnavailable(err)) {
          toast.error(err instanceof Error ? err.message : 'Collect failed');
          throw err;
        }
        toast.error('Settlement commands unavailable — redeploy fleet-server');
        throw err;
      }
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: settlementKeys.all }),
      qc.invalidateQueries({ queryKey: ['driverSettlementsTransactions'] }),
    ]);
    await Promise.all([
      qc.refetchQueries({ queryKey: settlementKeys.queues() }),
      qc.refetchQueries({ queryKey: ['driverSettlementsTransactions'] }),
    ]);
    if (payment.transactionType === 'payment' && weekStart) {
      const fresh = findFreshCollectRow(collectModal.driverId, weekStart);
      const afterAmt =
        serverAfter != null
          ? serverAfter
          : fresh
            ? collectAmount(fresh)
            : Math.max(0, beforeAmt - amount);
      const reduced = Math.round((beforeAmt - afterAmt) * 100) / 100;
      toast.success(
        `Collected ${MONEY(payment.amount)} · owed ${MONEY(beforeAmt)} → ${MONEY(afterAmt)} (changed by ${MONEY(reduced)})`,
        { duration: 7000 },
      );
    }
    refreshAll();
  };

  const saveWriteOff = async (payload: CashWriteOffSavePayload) => {
    if (payload.amount > writeOffModal.maxAmount + MONEY_EPS) {
      throw new Error(
        `Cannot write off more than cash still owed (${writeOffModal.maxAmount.toFixed(2)})`,
      );
    }
    const weekAnchor = String(payload.workPeriodStart || writeOffModal.workPeriodStart || '').slice(0, 10);
    try {
      await settlementCommandsApi.writeOff({
        driverId: writeOffModal.driverId,
        weekAnchor,
        amount: Math.abs(Number(payload.amount) || 0),
        reason: payload.reason,
        idempotencyKey: newIdempotencyKey(),
        expectedOutstanding: writeOffModal.maxAmount,
      });
    } catch (err) {
      if (isPeriodFrozenError(err)) {
        setWriteOffModal((m) => ({ ...m, isOpen: false }));
        showPeriodFrozen(weekAnchor, writeOffModal.driverName);
        return;
      }
      if (isMoneyLockedError(err)) {
        setWriteOffModal((m) => ({ ...m, isOpen: false }));
        showMoneyLocked(weekAnchor, writeOffModal.driverName);
        return;
      }
      if (!isSettlementCommandUnavailable(err)) {
        toast.error(err instanceof Error ? err.message : 'Write-off failed');
        throw err;
      }
      toast.error('Settlement commands unavailable — redeploy fleet-server');
      throw err;
    }
    refreshAll();
  };

  const confirmReverseTx = async () => {
    if (!txToReverse?.id) return;
    const reason = reverseReason.trim();
    if (!reason) {
      toast.error('A reverse reason is required');
      return;
    }
    setReverseBusy(true);
    try {
      const id = String(txToReverse.id);
      const sourceTransactionId = txToReverse.sourceTransactionId || id;
      const fromMovementsTable =
        looksLikeUuid(id) &&
        (txToReverse.sourceTransactionId != null ||
          apiMovementRows.some((m) => m.id === id));
      await settlementCommandsApi.reverse({
        ...(fromMovementsTable ? { movementId: id } : {}),
        sourceTransactionId,
        reason,
        idempotencyKey: newIdempotencyKey(),
      });
      const isPay =
        String(txToReverse.kind || '').toLowerCase() === 'pay' || direction === 'pay';
      toast.success(isPay ? 'Payout reversed' : 'Cash payment reversed');
      setTxToReverse(null);
      setReverseReason('');
      await refreshAll();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to reverse');
    } finally {
      setReverseBusy(false);
    }
  };

  const runBatch = async () => {
    if (selected.size === 0 && batchSelectedKeys.length === 0) return;
    // S2-9: abort if any keys from dialog-open selection vanished vs live outstanding
    const keysAtOpen = batchSelectedKeys.length > 0 ? batchSelectedKeys : [...selected];
    const liveKeys = new Set(outstandingQueueRows.map((r) => rowKey(r)));
    const vanished = keysAtOpen.filter((k) => !liveKeys.has(k));
    if (vanished.length > 0) {
      toast.error(`${vanished.length} rows no longer outstanding — reselect`);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const k of vanished) next.delete(k);
        return next;
      });
      setBatchSelectedKeys([]);
      setBatchOpen(false);
      return;
    }
    if (selectedRows.length === 0) return;
    const stillOpen = selectedRows.filter(
      (r) =>
        !isSettlementPeriodEnded({
          periodAnchor: r.periodAnchor,
          periodEnd: r.periodEnd,
        }),
    );
    if (stillOpen.length > 0) {
      toast.error(
        settlementPeriodOpenMessage({
          periodAnchor: stillOpen[0].periodAnchor,
          periodEnd: stillOpen[0].periodEnd,
        }),
      );
      return;
    }
    const needsRef =
      batchMethod === 'Bank Transfer' ||
      batchMethod === 'Mobile Money' ||
      batchMethod === 'Check';
    if (needsRef && !batchRef.trim()) {
      toast.error('Reference number is required for bank / mobile transfers');
      return;
    }
    setBatchBusy(true);
    try {
      const rows = selectedRows.map((r) => {
        const amount = Math.round(queueOwedMajor(r, direction) * 100) / 100;
        return {
          driverId: r.driverId,
          weekAnchor: r.periodAnchor,
          amount,
          expectedOutstanding: amount,
        };
      });
      const expectedOutstanding = rows.reduce((s, r) => s + r.amount, 0);
      const res = await settlementCommandsApi.createRun({
        rows,
        method: batchMethod,
        effectiveDate: batchDate,
        kind: direction === 'pay' ? 'pay' : 'collect',
        reference: batchRef.trim() || undefined,
        idempotencyKey: newIdempotencyKey(),
        expectedOutstanding,
      });
      const posted = res.summary?.posted ?? rows.length;
      const failed = res.summary?.failed ?? 0;
      if (posted > 0) {
        toast.success(
          direction === 'pay'
            ? `Recorded ${posted} payout${posted !== 1 ? 's' : ''}`
            : `Logged ${posted} collection${posted !== 1 ? 's' : ''}`,
        );
      }
      if (failed > 0) {
        const failedRow = (res.rows || []).find((r) => r.error_message);
        const firstErr = failedRow?.error_message || 'Unknown error';
        if (isPeriodFrozenError(firstErr) || /PERIOD_FROZEN/i.test(firstErr)) {
          const week =
            String((failedRow as { week_anchor?: string; weekAnchor?: string } | undefined)?.week_anchor
              || (failedRow as { weekAnchor?: string } | undefined)?.weekAnchor
              || selectedRows[0]?.periodAnchor
              || '').slice(0, 10);
          showPeriodFrozen(week, selectedRows[0]?.driverName);
        } else if (isMoneyLockedError(firstErr) || /MONEY_LOCKED/i.test(firstErr)) {
          const week =
            String((failedRow as { week_anchor?: string; weekAnchor?: string } | undefined)?.week_anchor
              || (failedRow as { weekAnchor?: string } | undefined)?.weekAnchor
              || selectedRows[0]?.periodAnchor
              || '').slice(0, 10);
          showMoneyLocked(week, selectedRows[0]?.driverName);
        } else {
          toast.error(`${failed} failed · ${firstErr}`);
        }
      }
      setBatchOpen(false);
      setSelected(new Set());
      setBatchSelectedKeys([]);
      refreshAll();
    } catch (e: any) {
      if (isPeriodFrozenError(e)) {
        showPeriodFrozen(selectedRows[0]?.periodAnchor || '', selectedRows[0]?.driverName);
      } else if (isMoneyLockedError(e)) {
        showMoneyLocked(selectedRows[0]?.periodAnchor || '', selectedRows[0]?.driverName);
      } else {
        toast.error(e?.message || 'Batch run failed');
      }
    } finally {
      setBatchBusy(false);
    }
  };

  const verifyPending = async (row: SettlementMovementRow | FinancialTransaction) => {
    try {
      const id = String(row.id || '');
      const sourceTransactionId =
        'sourceTransactionId' in row && row.sourceTransactionId
          ? String(row.sourceTransactionId)
          : id;
      const fromMovementsTable =
        looksLikeUuid(id) &&
        (('sourceTransactionId' in row && row.sourceTransactionId != null) ||
          apiMovementRows.some((m) => m.id === id));
      await settlementCommandsApi.verify({
        ...(fromMovementsTable ? { movementId: id } : {}),
        sourceTransactionId,
        idempotencyKey: newIdempotencyKey(),
      });
      toast.success('Verified');
      refreshAll();
    } catch (e: any) {
      toast.error(e?.message || 'Verify failed');
    }
  };

  const loading =
    collectQueueQuery.isLoading ||
    payQueueQuery.isLoading ||
    (deskMode === 'reconciled' && reconciledQueueQuery.isLoading) ||
    (movementsQuery.isLoading && txsQuery.isLoading);

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

      <Tabs
        value={hubTab}
        onValueChange={(v) => setHubTab(v as SettlementsHubTab)}
        className="space-y-4"
      >
        <TabsList className="h-auto flex-wrap gap-1">
          <TabsTrigger value="cash">Cash desk</TabsTrigger>
          <TabsTrigger value="close-week">Close Week</TabsTrigger>
          <TabsTrigger value="restatements" className="gap-1.5">
            Restatements
            {restatementDraftCount > 0 ? (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-900">
                {restatementDraftCount > 99 ? '99+' : restatementDraftCount}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="close-week" className="mt-0 focus-visible:outline-none">
          <Suspense
            fallback={
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading close week…
              </div>
            }
          >
            <CloseWeekPageLazy
              embedded
              initialWeekKey={closeWeekKey}
              onNavigate={handleHubNavigate}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="restatements" className="mt-0 focus-visible:outline-none">
          <Suspense
            fallback={
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading restatements…
              </div>
            }
          >
            <RestatementQueuePageLazy
              embedded
              onNavigate={(page, opts) =>
                handleHubNavigate(page, opts?.weekKey ? { weekKey: opts.weekKey } : undefined)
              }
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="cash" className="mt-0 space-y-6 focus-visible:outline-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Banknote className="h-5 w-5 text-emerald-700" />
            Driver Settlements
          </h1>
        </div>
      <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void refreshAll()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-9"
        onClick={() => void repairOrphanMirrors()}
        disabled={loading}
        title="Repair orphan settlement mirrors"
      >
        Repair mirrors
      </Button>
      </div>

      {nullOrgPeriodCount > 0 ? (
        <div
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          Some settlement weeks are missing org tags and are hidden from totals — refresh after
          repair.
          <span className="ml-1 text-amber-800/80">
            ({nullOrgPeriodCount} untagged week{nullOrgPeriodCount === 1 ? '' : 's'})
          </span>
        </div>
      ) : null}

      <SettlementFilters
        weekFrom={weekFrom}
        weekTo={weekTo}
        minAmount={minAmount}
        search={search}
        allOpen={allOpen}
        onWeekFromChange={setWeekFrom}
        onWeekToChange={setWeekTo}
        onMinAmountChange={setMinAmount}
        onSearchChange={setSearch}
        onAllOpenChange={setAllOpen}
        trailing={
          deskMode === 'reconciled' ? (
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={exportReconciledCsv}>
              <Download className="h-4 w-4 mr-1.5" />
              Export CSV
            </Button>
          ) : deskMode === 'collect' || deskMode === 'pay' ? (
            deskTab === 'outstanding' ? (
              <>
                <Button type="button" variant="outline" size="sm" className="h-9" onClick={exportCsv}>
                  <Download className="h-4 w-4 mr-1.5" />
                  Export CSV
                </Button>
                {selectedRows.length > 0 ? (
                  <Button
                    type="button"
                    size="sm"
                    className={cn(
                      'h-9',
                      direction === 'collect'
                        ? 'bg-rose-700 hover:bg-rose-800'
                        : 'bg-emerald-700 hover:bg-emerald-800',
                    )}
                    onClick={() => {
                      setBatchSelectedKeys([...selected]);
                      setBatchOpen(true);
                    }}
                  >
                    {direction === 'collect' ? 'Collect selected' : 'Pay selected'} ({selectedRows.length})
                  </Button>
                ) : null}
              </>
            ) : deskTab === 'done' ? (
              <Button type="button" variant="outline" size="sm" className="h-9" onClick={exportDoneCsv}>
                <Download className="h-4 w-4 mr-1.5" />
                Export CSV
              </Button>
            ) : undefined
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500 w-full sm:w-auto">
          Exposure
        </span>
        <span className="text-sm tabular-nums text-emerald-800">
          Fleet owes{' '}
          <span className="font-semibold">
            {payKpiError ? '—' : MONEY(fleetOwesTotal)}
          </span>
        </span>
        <span className="text-sm tabular-nums text-rose-700">
          Drivers owe{' '}
          <span className="font-semibold">
            {collectKpiError ? '—' : MONEY(settledOwesTotal)}
          </span>
        </span>
        <span className="text-sm tabular-nums text-amber-800">
          Cash held{' '}
          <span className="font-semibold">
            {collectKpiError ? '—' : MONEY(cashHeldKpiTotal)}
          </span>
        </span>
        <span className="text-sm tabular-nums text-slate-900">
          Net{' '}
          <span className="font-semibold">
            {collectKpiError || payKpiError
              ? '—'
              : MONEY(fleetOwesTotal - settledOwesTotal)}
          </span>
          <span className="ml-1 text-[11px] font-normal text-slate-400">
            (liability − receivable) · custody separate · {exposureScopeLabel}
          </span>
        </span>
        {blockedExposure > MONEY_EPS ? (
          <span className="ml-auto rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            {MONEY(blockedExposure)} blocked / not finalized
          </span>
        ) : null}
      </div>

      <SettlementKpiBar
        settledOwes={settledOwesTotal}
        cashHeld={cashHeldKpiTotal}
        fleetOwes={fleetOwesTotal}
        awaiting={awaitingTotal}
        cleared={clearedThisWeek}
        loading={loading}
        settledOwesError={collectQueueQuery.isError}
        cashHeldError={collectQueueQuery.isError}
        fleetOwesError={payQueueQuery.isError}
        awaitingError={txKpiError}
        clearedError={txKpiError}
        settledOwesSub={`${settledOwesWeekCount} weeks · ${rangeScopeLabel}`}
        cashHeldSub={`${cashHeldWeekCount} weeks · ${rangeScopeLabel}`}
        fleetOwesSub={`${fleetOwesWeekCount} weeks · ${rangeScopeLabel}`}
        awaitingSub={`${awaitingRows.length} pending (${direction})`}
        clearedSub={
          direction === 'pay'
            ? 'Payouts since Mon · ignores week filter'
            : 'Collections since Mon · ignores week filter'
        }
        directionLabels={{
          awaiting: 'Awaiting bank clear',
          cleared: 'Cleared since Monday',
        }}
      />

      {kpiTotalsPossiblyIncomplete ? (
        <div
          role="status"
          className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
        >
          Totals may be incomplete — narrow the week range for exact numbers.
        </div>
      ) : null}

      {collectKpiError || payKpiError || txKpiError || reconciledQueueQuery.isError ? (
        <div
          role="alert"
          className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900"
        >
          {txKpiError && !collectKpiError && !payKpiError
            ? 'Payment history (Awaiting / Done / Cleared) failed to load. Collect and Pay queues below may still be valid.'
            : 'Could not load some settlement queues. Totals marked “Failed to load” are not zero — refresh or try again.'}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-3 h-8"
            onClick={() => void refreshAll()}
          >
            Retry
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 items-center">
        <Button
          type="button"
          size="sm"
          variant={deskMode === 'collect' || deskMode === 'log-cash' ? 'default' : 'outline'}
          className={cn(
            'h-9',
            (deskMode === 'collect' || deskMode === 'log-cash') && 'bg-rose-700 hover:bg-rose-800',
          )}
          onClick={() => setDeskMode('collect')}
          title="Money drivers owe you"
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
          title="Money you owe drivers"
        >
          <ArrowUpRight className="h-4 w-4 mr-1.5" />
          Pay
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
        {deskMode === 'collect' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() => setDeskMode('log-cash')}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Log cash
          </Button>
        ) : null}
        {deskMode === 'log-cash' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() => setDeskMode('collect')}
          >
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
        ) : null}
      </div>
      {(deskMode === 'collect' || deskMode === 'pay') && (
        <p className="text-xs text-slate-500 -mt-4">
          {deskMode === 'collect'
            ? 'Collect = money drivers owe you'
            : 'Pay = money you owe drivers'}
        </p>
      )}

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
            <SettlementQueueTable
              rows={collectQueueQuery.data?.rows?.filter((r) => queueOwedMajor(r, 'collect') > MONEY_EPS) || []}
              mode="collect"
              loading={collectQueueQuery.isLoading}
              selected={selected}
              onToggle={toggleSelect}
              onToggleAll={toggleSelectAll}
              onOpenDriver={onOpenDriver}
              onPay={() => {}}
              onCollect={(r) =>
                openLogCashForDriver(r.driverId, r.driverName || r.driverId, queueToPeriodRow(r))
              }
              onWriteOff={(r) => {
                if (
                  !isSettlementPeriodEnded({
                    periodAnchor: r.periodAnchor,
                    periodEnd: r.periodEnd,
                  })
                ) {
                  toast.error(
                    settlementPeriodOpenMessage({
                      periodAnchor: r.periodAnchor,
                      periodEnd: r.periodEnd,
                    }),
                  );
                  return;
                }
                setWriteOffModal({
                  isOpen: true,
                  driverId: r.driverId,
                  driverName: r.driverName || r.driverId,
                  workPeriodStart: r.periodAnchor,
                  workPeriodEnd: r.periodEnd,
                  maxAmount: queueOwedMajor(r, 'collect'),
                });
              }}
            />
          </div>
        </div>
      ) : deskMode === 'reconciled' ? (
        <div className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900">Reconciled weeks</h3>
            <p className="text-xs text-slate-500">
              Closed Settlement Weeks — click a row for Fleet vs Driver breakdown.
            </p>
          </div>
          <ReconciledTable
            rows={reconciledRows}
            loading={reconciledQueueQuery.isLoading}
            onOpenDriver={onOpenDriver}
            onOpenPeriod={(r) => void openReconciledPeriod(r as ReconciledListRow)}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {pendingApprovalRows.length > 0 ? (
            <ApprovalQueue
              movements={pendingApprovalRows}
              loading={pendingApprovalsQuery.isLoading}
              onOpenDriver={onOpenDriver}
              onApprove={async (movementId, note) => {
                try {
                  await settlementCommandsApi.approve(movementId, {
                    decision: 'approved',
                    note,
                    idempotencyKey: newIdempotencyKey(),
                  });
                  toast.success('Approved');
                  refreshAll();
                } catch (e: any) {
                  toast.error(e?.message || 'Approve failed');
                  throw e;
                }
              }}
              onReject={async (movementId, note) => {
                try {
                  await settlementCommandsApi.approve(movementId, {
                    decision: 'rejected',
                    note,
                    idempotencyKey: newIdempotencyKey(),
                  });
                  toast.success('Rejected');
                  refreshAll();
                } catch (e: any) {
                  toast.error(e?.message || 'Reject failed');
                  throw e;
                }
              }}
            />
          ) : null}

          <Tabs value={deskTab} onValueChange={(v) => setDeskTab(v as DeskTab)}>
          <TabsList>
            <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
            <TabsTrigger value="awaiting">Awaiting clear</TabsTrigger>
            <TabsTrigger value="done">Done</TabsTrigger>
          </TabsList>

          <TabsContent value="outstanding" className="mt-4">
            <SettlementQueueTable
              rows={outstandingQueueRows}
              mode={direction}
              loading={loading}
              selected={selected}
              onToggle={toggleSelect}
              onToggleAll={toggleSelectAll}
              groupByDriver
              showingCount={outstandingQueueRows.length}
              totalCount={
                activeQueueQuery.data?.page?.total ??
                activeQueueQuery.data?.totals?.rowCount ??
                outstandingQueueRows.length
              }
              showingAmount={outstandingShowingAmount}
              totalAmount={outstandingTotalAmount}
              onOpenDriver={onOpenDriver}
              onWeekClosed={(r) => showPeriodFrozen(r.periodAnchor, r.driverName)}
              onPay={(r) => {
                if (r.periodFrozen) {
                  showPeriodFrozen(r.periodAnchor, r.driverName);
                  return;
                }
                if (
                  !isSettlementPeriodEnded({
                    periodAnchor: r.periodAnchor,
                    periodEnd: r.periodEnd,
                  })
                ) {
                  toast.error(
                    settlementPeriodOpenMessage({
                      periodAnchor: r.periodAnchor,
                      periodEnd: r.periodEnd,
                    }),
                  );
                  return;
                }
                setPayoutModal({
                  isOpen: true,
                  driverId: r.driverId,
                  driverName: r.driverName || r.driverId,
                  workPeriodStart: r.periodAnchor,
                  workPeriodEnd: r.periodEnd,
                  maxAmount: queueOwedMajor(r, 'pay'),
                });
              }}
              onCollect={(r) => {
                if (r.periodFrozen) {
                  showPeriodFrozen(r.periodAnchor, r.driverName);
                  return;
                }
                if (
                  !isSettlementPeriodEnded({
                    periodAnchor: r.periodAnchor,
                    periodEnd: r.periodEnd,
                  })
                ) {
                  toast.error(
                    settlementPeriodOpenMessage({
                      periodAnchor: r.periodAnchor,
                      periodEnd: r.periodEnd,
                    }),
                  );
                  return;
                }
                setCollectModal({
                  isOpen: true,
                  driverId: r.driverId,
                  driverName: r.driverName || r.driverId,
                  workPeriodStart: r.periodAnchor,
                  workPeriodEnd: r.periodEnd,
                  maxAmount: queueOwedMajor(r, 'collect'),
                });
              }}
              onWriteOff={(r) => {
                if (r.periodFrozen) {
                  showPeriodFrozen(r.periodAnchor, r.driverName);
                  return;
                }
                if (
                  !isSettlementPeriodEnded({
                    periodAnchor: r.periodAnchor,
                    periodEnd: r.periodEnd,
                  })
                ) {
                  toast.error(
                    settlementPeriodOpenMessage({
                      periodAnchor: r.periodAnchor,
                      periodEnd: r.periodEnd,
                    }),
                  );
                  return;
                }
                setWriteOffModal({
                  isOpen: true,
                  driverId: r.driverId,
                  driverName: r.driverName || r.driverId,
                  workPeriodStart: r.periodAnchor,
                  workPeriodEnd: r.periodEnd,
                  maxAmount: queueOwedMajor(r, 'collect'),
                });
              }}
            />
          </TabsContent>

          <TabsContent value="awaiting" className="mt-4">
            <MovementHistoryTable
              rows={awaitingRows}
              mode={direction}
              onOpenDriver={onOpenDriver}
              onVerify={verifyPending}
              onRequestUndo={(row) => {
                setTxToReverse({
                  id: row.id,
                  kind: row.kind,
                  amount: row.amount,
                  driverName: row.driverName,
                  sourceTransactionId: row.sourceTransactionId,
                });
                setReverseReason('');
              }}
              onUndo={() => {}}
            />
          </TabsContent>

          <TabsContent value="done" className="mt-4">
            <MovementHistoryTable
              rows={doneMovementRows}
              mode={direction}
              onOpenDriver={onOpenDriver}
              onRequestUndo={(row) => {
                setTxToReverse({
                  id: row.id,
                  kind: row.kind,
                  amount: row.amount,
                  driverName: row.driverName,
                  sourceTransactionId: row.sourceTransactionId,
                });
                setReverseReason('');
              }}
              onUndo={() => {}}
            />
          </TabsContent>
        </Tabs>
        </div>
      )}
        </TabsContent>
      </Tabs>

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

      <PeriodFrozenDialog
        state={periodFrozenDialog}
        onOpenChange={(open) => {
          if (!open) setPeriodFrozenDialog(null);
        }}
        onOpenCloseWeek={(weekKey) => {
          setPeriodFrozenDialog(null);
          handleHubNavigate('close-week', { weekKey });
        }}
      />

      <MoneyLockedDialog
        state={moneyLockedDialog}
        onOpenChange={(open) => {
          if (!open) setMoneyLockedDialog(null);
        }}
        onOpenCloseWeek={(weekKey) => {
          setMoneyLockedDialog(null);
          handleHubNavigate('close-week', { weekKey });
        }}
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
        transactions={overlayTxsQuery.data || []}
      />

      <AlertDialog
        open={!!txToReverse}
        onOpenChange={(open) => {
          if (!open && !reverseBusy) {
            setTxToReverse(null);
            setReverseReason('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {txToReverse &&
              (String(txToReverse.kind || '').toLowerCase() === 'pay' || direction === 'pay')
                ? 'Undo payout?'
                : 'Undo cash payment?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {txToReverse &&
              (String(txToReverse.kind || '').toLowerCase() === 'pay' || direction === 'pay')
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
          <div className="space-y-1.5 px-1">
            <Label htmlFor="reverse-reason">Reason (required)</Label>
            <Textarea
              id="reverse-reason"
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="Why is this being reversed?"
              rows={3}
              disabled={reverseBusy}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reverseBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={reverseBusy || !reverseReason.trim()}
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

      <Dialog
        open={batchOpen}
        onOpenChange={(o) => {
          if (!o && !batchBusy) {
            setBatchOpen(false);
            setBatchSelectedKeys([]);
          }
        }}
      >
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

/** @deprecated Prefer importing DriverSettlementsPage; alias kept for deep links. */
export const DriverPayoutsPage = DriverSettlementsPage;

