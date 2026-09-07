/**
 * Close the Week (audit §6.5 / Phase 7).
 *
 * One screen, one week, three lanes (Fuel · Tolls · Settlement). The close
 * button is enabled only when every cross-system identity ties — the system
 * will not let you close a week that does not balance. Fuel / Toll lanes and
 * the blocker list come from the read-only /week-close/preview endpoint;
 * the Settlement lane reuses the trusted settlement-queue hooks.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { addDays, format, parseISO, startOfWeek, subWeeks } from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Fuel,
  Loader2,
  Lock,
  Receipt,
  RefreshCw,
  Unlock,
} from 'lucide-react';
import { toast } from 'sonner';
import { computeTollCardIdentityResidual } from '@roam/toll-core';
import { MONEY_EPS } from '@roam/finance-core';
import { Button } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import { Textarea } from '../components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { cn } from '../components/ui/utils';
import { useSettlementQueue } from '../hooks/useSettlementQueue';
import {
  weekCloseApi,
  isWeekCloseUnavailable,
  WeekCloseApiError,
  type WeekCloseResult,
} from '../services/weekCloseApi';
import {
  LANE_LABEL,
  LANE_REVIEW_PAGE,
  blockingCount,
  humanBlockerLabel,
  laneStatusFromBlockers,
  summarizeBlockersByLane,
  type CloseLane,
  type CloseLaneStatus,
  type SettlementLaneMetrics,
} from '../utils/weekCloseBlockers';

const MONEY = (n: number | null | undefined) => {
  if (n == null || !Number.isFinite(n)) return '—';
  const body = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n < 0 ? '-' : ''}$${body}`;
};

/** Recent Mondays (yyyy-MM-dd), newest first, for the week picker. */
function recentWeekKeys(count = 12): string[] {
  const thisMonday = startOfWeek(new Date(), { weekStartsOn: 1 });
  return Array.from({ length: count }, (_, i) =>
    format(subWeeks(thisMonday, i), 'yyyy-MM-dd'),
  );
}

function weekLabel(weekKey: string): string {
  try {
    const start = parseISO(`${weekKey}T12:00:00`);
    const end = addDays(start, 6);
    return `${format(start, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  } catch {
    return weekKey;
  }
}

const STATUS_CHROME: Record<CloseLaneStatus, { dot: string; text: string; label: string }> = {
  clear: { dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Clear' },
  blocked: { dot: 'bg-rose-500', text: 'text-rose-700', label: 'Blocked' },
  unverified: { dot: 'bg-amber-500', text: 'text-amber-800', label: 'Unverified' },
  pending: { dot: 'bg-amber-500', text: 'text-amber-700', label: 'Pending' },
  loading: { dot: 'bg-slate-300', text: 'text-slate-500', label: 'Loading' },
};

function LaneCard({
  lane,
  icon,
  status,
  metrics,
  blockerLabels,
  warnLabels,
  provenance,
  onReview,
}: {
  lane: CloseLane;
  icon: React.ReactNode;
  status: CloseLaneStatus;
  metrics: { label: string; value: string; tone?: 'default' | 'warn' }[];
  blockerLabels: string[];
  warnLabels?: string[];
  provenance?: string;
  onReview: () => void;
}) {
  const chrome = STATUS_CHROME[status];
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <span className="text-slate-500">{icon}</span>
          {LANE_LABEL[lane]}
        </div>
        <span className={cn('flex items-center gap-1.5 text-xs font-medium', chrome.text)}>
          <span className={cn('h-2 w-2 rounded-full', chrome.dot)} />
          {status === 'loading' ? 'Loading…' : chrome.label}
        </span>
      </div>

      {provenance ? (
        <p className="mt-1 text-[11px] text-slate-500">{provenance}</p>
      ) : null}

      <dl className="mt-3 space-y-1.5">
        {metrics.map((m) => (
          <div key={m.label} className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-slate-500">{m.label}</dt>
            <dd
              className={cn(
                'text-sm font-medium tabular-nums',
                m.tone === 'warn' ? 'text-rose-700' : 'text-slate-900',
              )}
            >
              {m.value}
            </dd>
          </div>
        ))}
      </dl>

      {blockerLabels.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-slate-100 pt-2">
          {blockerLabels.map((b, i) => (
            <li key={`b-${i}`} className="flex items-start gap-1.5 text-xs text-rose-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {(warnLabels || []).length > 0 ? (
        <ul className={cn('mt-2 space-y-1', blockerLabels.length === 0 && 'border-t border-slate-100 pt-2')}>
          {(warnLabels || []).map((w, i) => (
            <li key={`w-${i}`} className="flex items-start gap-1.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-3 h-8 w-full"
        onClick={onReview}
      >
        Review {LANE_LABEL[lane]}
        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function IdentityRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-slate-600">{label}</span>
      <span
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium tabular-nums',
          ok ? 'text-emerald-700' : 'text-rose-700',
        )}
      >
        {value}
        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      </span>
    </div>
  );
}

export function CloseWeekPage({
  onNavigate,
  initialWeekKey,
}: {
  onNavigate?: (page: string, opts?: { startYmd: string; endYmd: string } | { weekKey: string }) => void;
  initialWeekKey?: string;
}) {
  const weekKeys = useMemo(() => recentWeekKeys(), []);
  const [weekKey, setWeekKey] = useState(
    initialWeekKey && weekKeys.includes(initialWeekKey)
      ? initialWeekKey
      : weekKeys[1] ?? weekKeys[0],
  ); // default: last completed week

  useEffect(() => {
    if (initialWeekKey && weekKeys.includes(initialWeekKey)) {
      setWeekKey(initialWeekKey);
    }
  }, [initialWeekKey, weekKeys]);
  const periodEnd = useMemo(() => format(addDays(parseISO(`${weekKey}T12:00:00`), 6), 'yyyy-MM-dd'), [weekKey]);
  const [closing, setClosing] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [result, setResult] = useState<WeekCloseResult | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [acknowledgeSettlementRisk, setAcknowledgeSettlementRisk] = useState(false);
  const [settlementRiskPrompt, setSettlementRiskPrompt] = useState(false);
  const [orphanRepairOpen, setOrphanRepairOpen] = useState(false);
  const [orphanRepairing, setOrphanRepairing] = useState(false);

  // ── Fuel / Toll lanes + cross-system blockers (read-only preview) ──────────
  const previewQuery = useQuery({
    queryKey: ['week-close-preview', weekKey],
    queryFn: () => weekCloseApi.preview(weekKey),
    retry: false,
  });
  const preview = previewQuery.data;
  const previewUnavailable = previewQuery.isError && isWeekCloseUnavailable(previewQuery.error);

  // ── Settlement lane (trusted settlement queue, single week) ────────────────
  const queueParams = { weekFrom: weekKey, weekTo: periodEnd, minAmount: 0, pageSize: 200, groupBy: 'week' as const };
  const collectQuery = useSettlementQueue({ view: 'collect', ...queueParams });
  const payQuery = useSettlementQueue({ view: 'pay', ...queueParams });

  const settlement: SettlementLaneMetrics = useMemo(() => {
    const collectRows = collectQuery.data?.rows || [];
    const payRows = payQuery.data?.rows || [];
    const owed = (r: { amountOwed?: number; amountOwedMinor?: number }) =>
      r.amountOwed != null && Number.isFinite(r.amountOwed)
        ? Math.max(0, r.amountOwed)
        : Math.max(0, (r.amountOwedMinor || 0) / 100);
    const driversOwe = collectRows
      .filter((r) => r.collectKind !== 'cash_held')
      .reduce((s, r) => s + owed(r), 0);
    const cashHeld = collectRows
      .filter((r) => r.collectKind === 'cash_held')
      .reduce((s, r) => s + owed(r), 0);
    const fleetOwes = payRows.reduce((s, r) => s + owed(r), 0);
    const totalExposure = fleetOwes + driversOwe + cashHeld;
    // H-2: exposure sitting in unfinalized / gated weeks is still exposure.
    const blockedExposure = [...collectRows, ...payRows]
      .filter((r) => r.fuelFinalized === false || (r as { moneyUnlocked?: boolean }).moneyUnlocked === false)
      .reduce((s, r) => s + owed(r), 0);
    return { fleetOwes, driversOwe, cashHeld, totalExposure, blockedExposure };
  }, [collectQuery.data?.rows, payQuery.data?.rows]);

  const byLane = useMemo(() => summarizeBlockersByLane(preview?.blockers), [preview?.blockers]);
  const previewLoading = previewQuery.isLoading;
  const settlementLoading = collectQuery.isLoading || payQuery.isLoading;

  const fuelStatus = laneStatusFromBlockers(byLane.fuel, { loading: previewLoading });
  const tollStatus = laneStatusFromBlockers(byLane.toll, { loading: previewLoading });
  const settlementStatus: CloseLaneStatus = settlementLoading
    ? 'loading'
    : blockingCount(byLane.settlement) > 0
      ? 'blocked'
      : settlement.blockedExposure > MONEY_EPS
        ? 'pending'
        : 'clear';

  // Toll identity strip — prefer preview residual, fall back to the pure helper.
  const tollIdentity = useMemo(() => {
    if (!preview) return { residual: null as number | null, closes: false };
    const res = computeTollCardIdentityResidual({
      tollSpend: preview.toll.spend,
      reimbursed: preview.toll.reimbursed,
      chargedToDrivers: preview.toll.chargedToDrivers,
      netTollLoss: preview.toll.netLoss,
    });
    return res;
  }, [preview]);

  const pnlBlocker = (preview?.blockers || []).find((b) => b.code === 'SETTLEMENT_PNL_MISMATCH');
  const pnlUnavailable = (preview?.blockers || []).find((b) => b.code === 'BUSINESS_WEEK_PNL_UNAVAILABLE');
  const orphanBlockers = (preview?.blockers || []).filter((b) => b.code === 'TOLL_EVENT_ORPHANED');
  const orphanImpact = orphanBlockers.reduce((s, b) => s + Math.abs(Number(b.delta) || 0), 0);
  const hasOrphanBlocker = orphanBlockers.length > 0;
  const totalBlockers = blockingCount(preview?.blockers);
  const laneBlockLabels = (lane: CloseLane) =>
    byLane[lane].filter((b) => b.severity !== 'warn').map(humanBlockerLabel);
  const laneWarnLabels = (lane: CloseLane) =>
    byLane[lane].filter((b) => b.severity === 'warn').map(humanBlockerLabel);
  const weekAlreadyClosed = Boolean(preview?.weekClosed);
  const pendingRestatementCount = preview?.pendingRestatementCount ?? 0;
  const hasPendingRestatements = pendingRestatementCount > 0;
  const canClose =
    !previewLoading &&
    !previewQuery.isError &&
    !weekAlreadyClosed &&
    totalBlockers === 0 &&
    (preview?.driversTotal ?? 0) > 0;
  const canSignRestatements =
    !previewLoading &&
    !previewQuery.isError &&
    weekAlreadyClosed &&
    hasPendingRestatements &&
    totalBlockers === 0;

  const closedAtLabel = (() => {
    const raw = preview?.closedAt;
    if (!raw) return null;
    try {
      return format(parseISO(raw), 'MMM d, yyyy · h:mm a');
    } catch {
      return raw.slice(0, 16);
    }
  })();

  const doRepairOrphans = async () => {
    setOrphanRepairing(true);
    try {
      if (weekAlreadyClosed) {
        toast.message('Re-open the week first, then repair orphans and force-seal tolls — do not use Restatement for this.');
        setOrphanRepairOpen(false);
        return;
      }
      const repair = await weekCloseApi.repairOrphanTollEvents(weekKey);
      if (repair.errors.length) {
        toast.error(`Repair finished with errors: ${repair.errors.slice(0, 2).join('; ')}`);
      } else {
        toast.success(
          `Reversed ${repair.eventsReversed} orphan toll event(s)` +
            (repair.orphanAmountMajor > 0 ? ` (${MONEY(repair.orphanAmountMajor)})` : ''),
        );
      }
      try {
        const sealed = await weekCloseApi.sealToll(weekKey, { force: true });
        toast.message(`Toll lane re-sealed (${sealed.published} statement(s))`);
      } catch (sealErr) {
        toast.error(sealErr instanceof Error ? sealErr.message : 'Toll re-seal failed — run seal manually');
      }
      setOrphanRepairOpen(false);
      void previewQuery.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Repair orphan toll events failed');
    } finally {
      setOrphanRepairing(false);
    }
  };

  const doClose = async (reason: string) => {
    setClosing(true);
    setResult(null);
    try {
      const res = await weekCloseApi.close(weekKey, reason);
      setResult(res);
      if (res.closed) {
        toast.success(
          hasPendingRestatements
            ? `Restatements signed — ${res.driversClosed} drivers re-sealed`
            : `Week of ${weekLabel(weekKey)} closed — ${res.driversClosed} drivers signed`,
        );
      } else {
        toast.error(`Could not close — ${res.driversBlocked} drivers still blocked`);
      }
      void previewQuery.refetch();
    } catch (e) {
      if (isWeekCloseUnavailable(e)) {
        toast.error('Close endpoint not deployed yet — deploy fleet-server to enable closing.');
      } else {
        toast.error(e instanceof Error ? e.message : 'Close week failed');
      }
    } finally {
      setClosing(false);
    }
  };

  const doReopen = async (ackRisk: boolean) => {
    const reason = reopenReason.trim();
    if (!reason) {
      toast.error('Enter a reason before re-opening this week.');
      return;
    }
    setReopening(true);
    try {
      const res = await weekCloseApi.reopen(weekKey, reason, ackRisk);
      toast.success(
        `Week re-opened — ${res.driversReopened} driver${res.driversReopened === 1 ? '' : 's'} unfrozen. Re-close when lanes are ready.`,
      );
      setReopenOpen(false);
      setReopenReason('');
      setAcknowledgeSettlementRisk(false);
      setSettlementRiskPrompt(false);
      setResult(null);
      void previewQuery.refetch();
    } catch (e) {
      if (e instanceof WeekCloseApiError && e.code === 'SETTLEMENT_RISK') {
        setSettlementRiskPrompt(true);
        setAcknowledgeSettlementRisk(false);
        toast.message('Check the yellow box below, then click Re-open week again.');
      } else if (isWeekCloseUnavailable(e)) {
        toast.error('Re-open endpoint not deployed yet — deploy fleet-server first.');
      } else {
        toast.error(e instanceof Error ? e.message : 'Re-open week failed');
      }
    } finally {
      setReopening(false);
    }
  };

  const reviewLane = (lane: CloseLane) => {
    onNavigate?.(LANE_REVIEW_PAGE[lane], { startYmd: weekKey, endYmd: periodEnd });
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-slate-900">
            <Lock className="h-5 w-5 text-indigo-700" />
            Close the Week
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {weekAlreadyClosed
              ? hasPendingRestatements
                ? `This week is signed. ${pendingRestatementCount} restatement draft${pendingRestatementCount === 1 ? '' : 's'} await sign-off below.`
                : 'This week is signed and frozen. Use Restatement Queue for money corrections, or Re-open to unlock lane edits.'
              : 'One week, three lanes. Closing is blocked until every identity ties.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={weekKey} onValueChange={(v) => { setWeekKey(v); setResult(null); }}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weekKeys.map((k) => (
                <SelectItem key={k} value={k}>
                  Week of {weekLabel(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => { void previewQuery.refetch(); void collectQuery.refetch(); void payQuery.refetch(); }}
            disabled={previewLoading || settlementLoading}
          >
            {previewLoading || settlementLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </div>

      {previewUnavailable ? (
        <div role="status" className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Fuel / Toll preview is unavailable (route not deployed). The Settlement lane below is live; deploy
          fleet-server <code className="rounded bg-amber-100 px-1">/settlements/week-close</code> to see fuel/toll
          blockers and to close.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <LaneCard
          lane="fuel"
          icon={<Fuel className="h-4 w-4" />}
          status={fuelStatus}
          provenance="Fuel from finalize snapshot / week rebuild"
          metrics={[
            { label: 'Driver share', value: MONEY(preview?.fuel.driverShare) },
            { label: 'Fleet share', value: MONEY(preview?.fuel.fleetShare) },
            { label: 'Finalized', value: preview ? (preview.fuel.finalized ? 'Yes' : 'No') : '—', tone: preview && !preview.fuel.finalized ? 'warn' : 'default' },
          ]}
          blockerLabels={laneBlockLabels('fuel')}
          warnLabels={laneWarnLabels('fuel')}
          onReview={() => reviewLane('fuel')}
        />
        <LaneCard
          lane="toll"
          icon={<Receipt className="h-4 w-4" />}
          status={tollStatus}
          provenance="Tolls from canonical events (H-9)"
          metrics={[
            { label: 'Spend', value: MONEY(preview?.toll.spend) },
            { label: 'Reimbursed', value: MONEY(preview?.toll.reimbursed) },
            { label: 'Charged to drivers', value: MONEY(preview?.toll.chargedToDrivers) },
            { label: 'Net toll loss', value: MONEY(preview?.toll.netLoss) },
          ]}
          blockerLabels={laneBlockLabels('toll')}
          warnLabels={laneWarnLabels('toll')}
          onReview={() => reviewLane('toll')}
        />
        <LaneCard
          lane="settlement"
          icon={<Banknote className="h-4 w-4" />}
          status={settlementStatus}
          provenance="Earnings from commission + cash engines"
          metrics={[
            { label: 'Fleet owes', value: MONEY(settlement.fleetOwes) },
            { label: 'Drivers owe', value: MONEY(settlement.driversOwe) },
            { label: 'Cash held', value: MONEY(settlement.cashHeld) },
            { label: 'Total exposure', value: MONEY(settlement.totalExposure) },
            ...(settlement.blockedExposure > MONEY_EPS
              ? [{ label: 'Blocked / pending', value: MONEY(settlement.blockedExposure), tone: 'warn' as const }]
              : []),
          ]}
          blockerLabels={laneBlockLabels('settlement')}
          warnLabels={laneWarnLabels('settlement')}
          onReview={() => reviewLane('settlement')}
        />
      </div>

      {hasOrphanBlocker ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="font-medium">Toll money events don’t match live tolls</p>
            <p className="mt-1 text-rose-900/90">
              About {MONEY(orphanImpact)} of toll spend has no live toll row.
              Re-open the week if it is closed, repair orphans, then force-seal tolls — do not use Restatement for this.
              Driver settlement should not change for tag-only orphans.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-10 shrink-0 border-rose-300 bg-white"
            disabled={previewUnavailable || orphanRepairing}
            onClick={() => setOrphanRepairOpen(true)}
          >
            Repair orphan toll events
          </Button>
        </div>
      ) : null}

      {/* Identity check strip */}
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Identity check</p>
        <div className="mt-2 divide-y divide-slate-100">
          <IdentityRow
            label="Spend − Reimbursed − Charged to drivers − Net loss"
            value={tollIdentity.residual == null ? '—' : MONEY(tollIdentity.residual)}
            ok={!!preview && tollIdentity.closes}
          />
          <IdentityRow
            label="Σ driver settlements ↔ Business Finance P&L"
            value={
              pnlBlocker
                ? MONEY(pnlBlocker.delta)
                : pnlUnavailable
                  ? 'P&L not available'
                  : preview
                    ? MONEY(0)
                    : '—'
            }
            ok={!!preview && !pnlBlocker && !pnlUnavailable}
          />
          {(preview?.openEngineDriftCount ?? 0) > 0 ? (
            <IdentityRow
              label="Open statement ↔ engine drifts (nightly / close)"
              value={String(preview?.openEngineDriftCount)}
              ok={false}
            />
          ) : null}
        </div>
      </div>

      {/* Close / re-open / sign restatements */}
      <div
        className={cn(
          'flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between',
          weekAlreadyClosed
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-slate-200 bg-slate-50',
        )}
      >
        <div className="text-sm text-slate-600">
          {previewLoading ? (
            'Checking cross-system invariants…'
          ) : previewQuery.isError && !previewUnavailable ? (
            <span className="text-rose-700">Could not load preview — try Refresh.</span>
          ) : weekAlreadyClosed ? (
            <span className="text-emerald-800">
              Already closed
              {preview?.driversFrozen != null
                ? ` — ${preview.driversFrozen} driver${preview.driversFrozen === 1 ? '' : 's'} frozen`
                : ''}
              {closedAtLabel ? ` · signed ${closedAtLabel}` : ''}.
              {hasPendingRestatements
                ? ` ${pendingRestatementCount} restatement draft${pendingRestatementCount === 1 ? '' : 's'} ready to sign.`
                : ' Money for this week is locked; use Restatement Queue for approved revisions, or Re-open to unlock edits.'}
            </span>
          ) : totalBlockers > 0 ? (
            <span className="text-rose-700">
              {totalBlockers} blocker{totalBlockers === 1 ? '' : 's'} across {preview?.driversBlocked ?? 0} driver
              {(preview?.driversBlocked ?? 0) === 1 ? '' : 's'} — resolve before closing.
            </span>
          ) : (preview?.driversTotal ?? 0) === 0 ? (
            'No driver periods found for this week.'
          ) : (
            <span className="text-emerald-700">
              Every driver ties. {preview?.driversReady ?? 0} ready to sign.
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {weekAlreadyClosed ? (
            <Button
              type="button"
              variant="outline"
              className="h-10 border-slate-300 bg-white"
              disabled={reopening || previewUnavailable}
              onClick={() => {
                const riskUpFront = (preview?.settlementRiskDriverCount ?? 0) > 0;
                setSettlementRiskPrompt(riskUpFront);
                setAcknowledgeSettlementRisk(false);
                setReopenOpen(true);
              }}
            >
              <Unlock className="mr-2 h-4 w-4" />
              Re-open week
            </Button>
          ) : null}
          {canSignRestatements ? (
            <Button
              type="button"
              className="h-10 bg-indigo-700 hover:bg-indigo-800"
              disabled={closing || previewUnavailable}
              onClick={() => void doClose('Signed restatements from Close Week')}
            >
              {closing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Lock className="mr-2 h-4 w-4" />
              )}
              {closing ? 'Signing…' : `Sign ${pendingRestatementCount} restatement${pendingRestatementCount === 1 ? '' : 's'}`}
            </Button>
          ) : (
            <Button
              type="button"
              className={cn(
                'h-10 disabled:opacity-50',
                weekAlreadyClosed
                  ? 'bg-emerald-700 hover:bg-emerald-700 cursor-default'
                  : 'bg-indigo-700 hover:bg-indigo-800',
              )}
              disabled={!canClose || closing || previewUnavailable || weekAlreadyClosed}
              onClick={() => void doClose('Closed from Close Week screen')}
            >
              {closing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Lock className="mr-2 h-4 w-4" />
              )}
              {closing
                ? 'Closing…'
                : weekAlreadyClosed
                  ? `Week of ${weekLabel(weekKey)} already closed`
                  : `Close week of ${weekLabel(weekKey)}`}
            </Button>
          )}
        </div>
      </div>

      <Dialog
        open={reopenOpen}
        onOpenChange={(open) => {
          if (reopening) return;
          setReopenOpen(open);
          if (!open) {
            setSettlementRiskPrompt(false);
            setAcknowledgeSettlementRisk(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Re-open week of {weekLabel(weekKey)}?</DialogTitle>
            <DialogDescription>
              Unlocks this week so Fuel, Tolls, and Settlement can be edited again. Does not reopen
              fuel Consumption recon — use that screen separately if needed. You must re-close when
              done. Prefer Restatement Queue for money-only corrections.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700" htmlFor="reopen-reason">
              Reason (required)
            </label>
            <Textarea
              id="reopen-reason"
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Why is this week being re-opened?"
              rows={3}
              className="resize-none"
            />
            {settlementRiskPrompt ? (
              <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={acknowledgeSettlementRisk}
                  onChange={(e) => setAcknowledgeSettlementRisk(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Required to continue:</span> Settlement money was
                  already moved for one or more drivers. I understand re-opening can allow duplicate
                  collect/pay and I will re-close carefully.
                </span>
              </label>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={reopening}
              onClick={() => setReopenOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-700 hover:bg-indigo-800"
              disabled={
                reopening ||
                !reopenReason.trim() ||
                (settlementRiskPrompt && !acknowledgeSettlementRisk)
              }
              onClick={() => void doReopen(settlementRiskPrompt && acknowledgeSettlementRisk)}
            >
              {reopening ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Unlock className="mr-2 h-4 w-4" />
              )}
              {reopening ? 'Re-opening…' : 'Re-open week'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={orphanRepairOpen} onOpenChange={(open) => !orphanRepairing && setOrphanRepairOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Repair orphan toll events?</DialogTitle>
            <DialogDescription>
              Week of {weekLabel(weekKey)}. About {MONEY(orphanImpact)} of toll spend has no live
              toll row. This reverses those money events and force-reseals the toll lane. Driver
              settlement should not change for tag-only orphans — stop if it does.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              disabled={orphanRepairing}
              onClick={() => setOrphanRepairOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-indigo-700 hover:bg-indigo-800"
              disabled={orphanRepairing || weekAlreadyClosed}
              onClick={() => void doRepairOrphans()}
            >
              {orphanRepairing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {weekAlreadyClosed
                ? 'Re-open week first'
                : orphanRepairing
                  ? 'Repairing…'
                  : 'Repair and re-seal'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {result && (!weekAlreadyClosed || hasPendingRestatements) ? (
        <div
          role="status"
          className={cn(
            'rounded-md border px-4 py-3 text-sm',
            result.closed
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-rose-200 bg-rose-50 text-rose-900',
          )}
        >
          {result.closed
            ? `Week closed — ${result.driversClosed} driver-periods signed and frozen.`
            : `Close blocked — ${result.driversClosed} signed, ${result.driversBlocked} still blocked.`}
        </div>
      ) : null}
    </div>
  );
}

export default CloseWeekPage;
