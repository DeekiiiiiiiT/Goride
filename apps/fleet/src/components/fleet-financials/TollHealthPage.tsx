import React, { useMemo } from 'react';
import {
  AlertTriangle,
  Banknote,
  Camera,
  ChevronRight,
  GitCompareArrows,
  History,
  Landmark,
  Loader2,
  Lock,
  Undo2,
} from 'lucide-react';
import { formatWeekTitle } from './recon/weekListFormat';
import { fmtTollMinor } from './recon/tolls-v2/tollV2Format';
import {
  metricAgeDays,
  metricAgeLabel,
  useTollV2Metrics,
  type TollV2MetricBucket,
} from './recon/tolls-v2/useTollV2Metrics';
import { useTollV2Weeks } from './recon/tolls-v2/useTollV2Weeks';
import { useTollV2Enabled } from './recon/tolls-v2/useTollV2Desk';

type TollHealthNavigate = (
  page: string,
  opts?: { weekKey?: string; step?: string; line?: 'rideshare' | 'rush_delivery' },
) => void;

type TileSpec = {
  key: string;
  label: string;
  icon: React.ReactNode;
  bucket?: TollV2MetricBucket;
  countOverride?: number;
  amountOverride?: number;
  showAmount?: boolean;
  openWeek?: string;
  footerHint?: string;
};

export function TollHealthPage({
  onNavigate,
}: {
  onNavigate?: TollHealthNavigate;
}) {
  const v2 = useTollV2Enabled();
  const metricsQ = useTollV2Metrics(v2.data === true);
  const weeksQ = useTollV2Weeks(v2.data === true);

  const takeBackCount = weeksQ.data?.takeBacks?.length ?? 0;
  const openWeek = weeksQ.data?.openWeek ?? '';

  const tiles: TileSpec[] = useMemo(
    () => [
      {
        key: 'pending',
        label: 'Tolls waiting for a decision',
        icon: <GitCompareArrows className="h-5 w-5" aria-hidden />,
        bucket: metricsQ.data?.pendingCharges,
        showAmount: true,
        openWeek,
      },
      {
        key: 'receipts',
        label: 'Cash receipts to check',
        icon: <Camera className="h-5 w-5" aria-hidden />,
        bucket: metricsQ.data?.unverifiedReceipts,
        showAmount: true,
        openWeek,
      },
      {
        key: 'paybacks',
        label: 'Uber paybacks not matched yet',
        icon: <Banknote className="h-5 w-5" aria-hidden />,
        bucket: metricsQ.data?.unallocatedPaybacks,
        showAmount: true,
        openWeek,
        footerHint: 'Confirm their matches in the week',
      },
      {
        key: 'after-seal',
        label: 'Arrived after sealing',
        icon: <Lock className="h-5 w-5" aria-hidden />,
        bucket: metricsQ.data?.afterSeal,
        showAmount: false,
        openWeek,
      },
      {
        key: 'dupes',
        label: 'Possible duplicates',
        icon: <GitCompareArrows className="h-5 w-5" aria-hidden />,
        countOverride: metricsQ.data?.reviewPairsOpen ?? 0,
        showAmount: false,
        openWeek,
      },
      {
        key: 'takebacks',
        label: 'Uber take-backs not recovered',
        icon: <Undo2 className="h-5 w-5" aria-hidden />,
        countOverride: takeBackCount,
        showAmount: false,
        openWeek,
      },
    ],
    [metricsQ.data, openWeek, takeBackCount],
  );

  const nightly = weeksQ.data?.nightly;
  const failedCheck = nightly?.checks?.find((c) => c.ok === false);

  if (v2.isLoading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-[#47464c]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading…
      </div>
    );
  }

  if (v2.data !== true) {
    return (
      <p className="p-6 text-sm text-[#47464c]" data-testid="toll-health-v2-off">
        Toll health is available when your company uses the new toll system.
      </p>
    );
  }

  const loading = metricsQ.isLoading || weeksQ.isLoading;
  const errored = metricsQ.isError || weeksQ.isError;

  return (
    <div className="space-y-6 pb-8" data-testid="toll-health-page">
      <nav className="flex items-center gap-1 text-sm text-[#47464c]" aria-label="Breadcrumb">
        <span className="font-medium">Money</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <span className="font-semibold text-[#0b1c30]">Tolls</span>
      </nav>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[#0b1c30]">Toll health</h1>
        <p className="mt-1 text-sm text-[#47464c]">What needs attention across your toll weeks</p>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#47464c]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Refreshing numbers…
        </div>
      ) : null}

      {errored ? (
        <div className="rounded-xl border border-[#ba1a1a]/30 bg-[#ffdad6]/30 p-4 text-sm text-[#ba1a1a]">
          Check your connection and try again.
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3" aria-label="Toll health tiles">
        {tiles.map((t) => (
          <HealthTile key={t.key} spec={t} openWeek={openWeek} onNavigate={onNavigate} />
        ))}
      </section>

      <section
        className={`rounded-2xl border p-4 ${
          nightly && (nightly.ok === false || failedCheck)
            ? 'border-[#ba1a1a]/40 bg-[#ffdad6]/20'
            : 'border-[#e5eeff] bg-[#eff4ff]/50'
        }`}
        data-testid="toll-health-nightly"
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-[#0b1c30]">
          <Landmark className={`h-4 w-4 ${nightly ? '' : 'text-[#78767d]'}`} aria-hidden />
          Nightly money check
        </p>
        {!nightly ? (
          <p className="mt-1 text-sm text-[#47464c]">No nightly check has run yet</p>
        ) : nightly.ok !== false && !failedCheck ? (
          <p className="mt-1 text-sm text-[#47464c]">
            All checks passed
            {nightly.at ? ` last night at ${formatNightlyAt(nightly.at)}` : ''}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-[#ba1a1a]">
              {failedCheck?.name ? `1 check failed — ${plainCheckName(failedCheck.name)}` : '1 check failed'}
            </p>
            {openWeek && onNavigate ? (
              <button
                type="button"
                className="rounded-lg border border-[#ba1a1a]/40 px-3 py-1 text-sm font-medium text-[#ba1a1a]"
                onClick={() => onNavigate('week-reconciliation', { weekKey: openWeek, step: 'tolls' })}
              >
                Open the week
              </button>
            ) : null}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[#e5eeff] bg-white shadow-sm">
        <h2 className="border-b border-[#e5eeff] px-4 py-3 text-sm font-semibold text-[#0b1c30]">Weeks</h2>
        <ul className="divide-y divide-[#e5eeff]">
          {(weeksQ.data?.weeks ?? []).map((w) => (
            <li key={w.weekKey} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-[#0b1c30]">{formatWeekTitle(w.weekKey)}</p>
                <p className="text-xs text-[#47464c]">
                  {w.tolls ?? 0} tolls · {fmtTollMinor(w.spendMinor)}
                  {(w.toDecideMinor ?? 0) > 0 ? (
                    <span> · Still to decide {fmtTollMinor(w.toDecideMinor)}</span>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    w.sealed ? 'bg-[#eff4ff] text-[#47464c]' : 'bg-[#fffbeb] text-[#b45309]'
                  }`}
                >
                  {w.sealed ? 'Sealed' : `${w.toDecide ?? 0} left to decide`}
                </span>
                {onNavigate ? (
                  <button
                    type="button"
                    className="w-full rounded-lg border border-[#cbd5e1] px-3 py-1.5 text-sm font-medium sm:w-auto"
                    onClick={() => onNavigate('week-reconciliation', { weekKey: w.weekKey, step: 'tolls' })}
                  >
                    Open
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function HealthTile({
  spec,
  openWeek,
  onNavigate,
}: {
  spec: TileSpec;
  openWeek: string;
  onNavigate?: TollHealthNavigate;
}) {
  const count = spec.countOverride ?? spec.bucket?.count ?? 0;
  const amount = spec.amountOverride ?? spec.bucket?.amountMinor ?? 0;
  const days = metricAgeDays(spec.bucket?.oldestAt);
  const over14 = days != null && days > 14;
  const clear = count === 0;

  return (
    <article className="flex h-full min-h-[168px] flex-col justify-between rounded-2xl border border-[#e5eeff] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e5eeff] text-[#47464c]">
            {spec.icon}
          </div>
          <p className="text-xs font-medium text-[#47464c]">{spec.label}</p>
        </div>
        {over14 && count > 0 ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900">
            Over 14 days
          </span>
        ) : clear ? (
          <span className="rounded-full bg-[#ecfdf5] px-2 py-0.5 text-[10px] font-semibold text-[#069669]">All clear</span>
        ) : count > 0 ? (
          <AlertTriangle className="h-4 w-4 text-[#ba1a1a]" aria-hidden />
        ) : null}
      </div>
      <div className="my-2 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold tabular-nums text-[#0b1c30]">{count}</span>
        {spec.showAmount !== false ? (
          <span className="text-sm font-semibold tabular-nums text-[#0b1c30]">{fmtTollMinor(amount)}</span>
        ) : null}
      </div>
      <div className="flex items-center justify-between border-t border-[#e5eeff] pt-2 text-xs text-[#47464c]">
        {spec.footerHint ? (
          <span>{spec.footerHint}</span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <History className="h-3.5 w-3.5" aria-hidden />
            Oldest {metricAgeLabel(days)}
          </span>
        )}
        {count > 0 && openWeek && onNavigate ? (
          <button
            type="button"
            className="rounded-lg border border-[#cbd5e1] px-2 py-1 text-xs font-medium"
            onClick={() => onNavigate('week-reconciliation', { weekKey: openWeek, step: 'tolls' })}
          >
            Open week
          </button>
        ) : null}
      </div>
    </article>
  );
}

function formatNightlyAt(iso: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Jamaica',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).formatToParts(new Date(iso));
    const upper = parts
      .map((p) => (p.type === 'dayPeriod' ? p.value.toUpperCase() : p.value))
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    return upper;
  } catch {
    return '—';
  }
}

function plainCheckName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
