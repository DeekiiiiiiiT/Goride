import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { api } from '../../services/api';
import { useDriverOperationalPeriods } from '../../hooks/useDriverOperationalPeriods';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Sheet, SheetContent, SheetTitle } from '../ui/sheet';
import { cn } from '../ui/utils';
import type { EarningsPlatformTab } from './EarningsSummaryCard';
import {
  buildEarningsOverlayModel,
  type OverlayDetailLine,
} from '../../utils/buildEarningsOverlayModel';
import type { StatementSummary } from '../../types/statementSummary';

function formatMoney(n: number): string {
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

function formatDistanceKm(km: number): string {
  return `${km.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} km`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driver: {
    id: string;
    name: string;
    avatarUrl?: string;
  } | null;
  startDate: string;
  endDate: string;
  platformTab: EarningsPlatformTab;
};

export function EarningsDriverOverlay({
  open,
  onOpenChange,
  driver,
  startDate,
  endDate,
  platformTab,
}: Props) {
  const [earningsOpen, setEarningsOpen] = useState(true);
  const [refundsOpen, setRefundsOpen] = useState(false);
  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);
  const [payoutOpen, setPayoutOpen] = useState(false);

  const statementQuery = useQuery({
    queryKey: ['statement-summary', 'driver-overlay', driver?.id, startDate, endDate],
    queryFn: () =>
      api.getStatementSummary({
        platform: 'all',
        startDate,
        endDate,
        driverId: driver!.id,
      }),
    enabled: open && Boolean(driver?.id && startDate && endDate),
    staleTime: 30_000,
  });

  const ops = useDriverOperationalPeriods(
    open && driver?.id ? driver.id : '',
    startDate,
    endDate,
  );

  const model = useMemo(() => {
    const summaries = (statementQuery.data?.summaries ?? []) as StatementSummary[];
    return buildEarningsOverlayModel(summaries, platformTab);
  }, [statementQuery.data, platformTab]);

  const summary = model.summary;
  const loading = statementQuery.isLoading || statementQuery.isFetching;
  const name = driver?.name?.trim() || 'Unknown driver';

  const tripCount =
    ops.totals.tripCount > 0 ? ops.totals.tripCount : model.tripCount;
  const distanceKm = ops.totals.distanceKm;
  const hasDistance = distanceKm > 0.005;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-md [&>button]:hidden"
      >
        <div className="flex items-center justify-end px-4 pt-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 px-6 pb-4">
          <Avatar className="h-14 w-14">
            {driver?.avatarUrl ? <AvatarImage src={driver.avatarUrl} alt="" /> : null}
            <AvatarFallback className="bg-slate-200 text-sm font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          <SheetTitle className="text-left text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {name}
          </SheetTitle>
        </div>

        {model.isAll && model.platformStrip.length > 0 ? (
          <div className="mb-4 flex flex-wrap gap-2 px-6">
            {model.platformStrip.map((p) => (
              <div
                key={p.platform}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-800/60"
              >
                <span className="font-medium text-slate-700 dark:text-slate-200">
                  {p.platform}
                </span>
                <span className="ml-2 tabular-nums text-slate-500">
                  {loading ? '—' : formatMoney(p.totalEarnings)}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="divide-y divide-slate-100 border-t border-slate-100 px-6 dark:divide-slate-800 dark:border-slate-800">
          <ExpandRow
            label="Total earnings"
            value={loading || !summary ? null : summary.totalEarnings}
            open={earningsOpen}
            onToggle={() => setEarningsOpen((v) => !v)}
          >
            <DetailLines lines={model.earningsLines} />
          </ExpandRow>

          <ExpandRow
            label="Refunds & expenses"
            value={loading || !summary ? null : summary.totalRefundsExpenses}
            open={refundsOpen}
            onToggle={() => setRefundsOpen((v) => !v)}
          >
            <DetailLines lines={model.refundsLines} />
          </ExpandRow>

          {model.adjustmentsExpandable ? (
            <ExpandRow
              label="Adjustments from previous periods"
              value={loading || !summary ? null : summary.periodAdjustments}
              open={adjustmentsOpen}
              onToggle={() => setAdjustmentsOpen((v) => !v)}
            >
              <DetailLines lines={model.adjustmentsLines} />
            </ExpandRow>
          ) : (
            <div className="flex items-center justify-between py-4">
              <span className="text-sm text-slate-700 dark:text-slate-200">
                Adjustments from previous periods
              </span>
              <span className="text-sm tabular-nums text-slate-900 dark:text-slate-100">
                {loading || !summary ? '—' : formatMoney(summary.periodAdjustments)}
              </span>
            </div>
          )}

          <ExpandRow
            label="Payout"
            value={loading || !summary ? null : -Math.abs(summary.totalPayout)}
            open={payoutOpen}
            onToggle={() => setPayoutOpen((v) => !v)}
          >
            <DetailLines lines={model.payoutLines} />
          </ExpandRow>
        </div>

        <div className="mx-6 mt-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-slate-900 dark:text-slate-50">
              Net earnings
            </span>
            <span className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {loading ? '—' : formatMoney(model.netEarnings)}
            </span>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-6 px-6 pb-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Trips
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {loading && ops.loading ? '—' : tripCount.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Distance
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-50">
              {ops.loading && !hasDistance
                ? '—'
                : hasDistance
                  ? formatDistanceKm(distanceKm)
                  : '—'}
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailLines({ lines }: { lines: OverlayDetailLine[] }) {
  if (!lines.length) {
    return <p className="text-xs text-slate-400">No detail for this period.</p>;
  }
  return (
    <>
      {lines.map((line) => (
        <DetailLine key={`${line.label}-${line.value}`} line={line} />
      ))}
    </>
  );
}

function ExpandRow({
  label,
  value,
  open,
  onToggle,
  children,
}: {
  label: string;
  value: number | null;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="py-4">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-200">
          {open ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
          {label}
        </span>
        <span className="text-sm tabular-nums text-slate-900 dark:text-slate-100">
          {value == null ? '—' : formatMoney(value)}
        </span>
      </button>
      {open ? (
        <div className="mt-2 space-y-1.5 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function DetailLine({ line }: { line: OverlayDetailLine }) {
  return (
    <div
      className={cn(
        'flex justify-between text-xs',
        line.muted ? 'text-slate-400 italic' : 'text-slate-500',
      )}
    >
      <span>{line.label}</span>
      <span className="tabular-nums">{formatMoney(line.value)}</span>
    </div>
  );
}
