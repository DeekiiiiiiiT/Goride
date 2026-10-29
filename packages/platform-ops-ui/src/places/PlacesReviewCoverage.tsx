// Stitch: dominion-redesign/7da088e95e1e4fe088a2add010bf9bd3
// Stitch: dominion-redesign/53ad2876cac241b1aaceeb7bbc307045
// Stitch D4: docs/stitch/dominion-redesign/html/D4-coverage.html (main canvas; aside/header stripped)
// Stitch D5: docs/stitch/dominion-redesign/html/D5-parish-coverage.html (parish table; aside/header stripped)
// No fake choropleth polygons, daily chart series, or contributor leaderboards.
import { useMemo, useState } from 'react';

export type PlacesReviewCoverageKind = {
  pcode: string;
  kind: string;
  verified_count: number;
  pending_count: number;
};

export type PlacesReviewParishTotal = {
  pcode: string;
  rows: PlacesReviewCoverageKind[];
  verified: number;
  waiting: number;
};

export type PlacesReviewCoverageSection = 'overview' | 'parishes';

export type PlacesReviewCoverageProps = {
  pending: number;
  oldest: number;
  parishTotals: PlacesReviewParishTotal[];
  verifiedTotal: number;
  maxVerified: number;
  /** Which Stitch screen to show: D4 overview or D5 parish table. */
  section?: PlacesReviewCoverageSection;
  onSectionChange?: (section: PlacesReviewCoverageSection) => void;
  onOpenQueue?: () => void;
  onRefresh?: () => void;
};

function Icon({ name, className = '' }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className}`.trim()}>{name}</span>;
}

function densityPct(verified: number, maxVerified: number): number {
  if (!maxVerified) return 0;
  return Math.max(0, Math.min(100, Math.round((verified / maxVerified) * 100)));
}

function densityBarClass(pct: number): string {
  if (pct > 75) return 'bg-[#16a34a]';
  if (pct >= 40) return 'bg-amber-500';
  return 'bg-slate-400';
}

function densityTextClass(pct: number): string {
  if (pct > 75) return 'text-[#16a34a]';
  if (pct >= 40) return 'text-amber-600';
  return 'text-slate-600';
}

function auditStatus(waiting: number, verified: number): {
  label: string;
  className: string;
  dot: string;
} {
  if (waiting === 0 && verified > 0) {
    return {
      label: 'Verified',
      className: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      dot: 'bg-emerald-500',
    };
  }
  if (waiting > 0 && verified > 0) {
    return {
      label: 'In Progress',
      className: 'text-amber-800 bg-amber-50 border-amber-200',
      dot: 'bg-amber-500',
    };
  }
  if (waiting > 0 && verified === 0) {
    return {
      label: 'Sparse Node',
      className: 'text-stone-700 bg-stone-100 border-stone-200',
      dot: 'bg-stone-400',
    };
  }
  return {
    label: 'No data',
    className: 'text-slate-600 bg-slate-50 border-slate-200',
    dot: 'bg-slate-300',
  };
}

function kindBreakdown(rows: PlacesReviewCoverageKind[]): string {
  if (!rows.length) return '—';
  return rows
    .map((row) => `${row.kind} ${Number(row.verified_count || 0)}`)
    .join(' · ');
}

function OverviewPanel({
  pending,
  oldest,
  parishTotals,
  verifiedTotal,
  maxVerified,
  onOpenQueue,
  onRefresh,
  onShowParishes,
}: Omit<PlacesReviewCoverageProps, 'section' | 'onSectionChange'> & { onShowParishes: () => void }) {
  const parishCount = parishTotals.length;
  const highBacklog = useMemo(
    () => Math.max(0, ...parishTotals.map((row) => row.waiting)),
    [parishTotals],
  );

  return (
    <div className="space-y-6">
      {/* Subheader control ribbon — D4 (live refresh only; no fake window filters) */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded border border-outline-variant/40 bg-surface-container-lowest p-3 px-4 shadow-[0px_1px_2px_0px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">Territory:</span>
            <span className="rounded border border-outline-variant/60 bg-surface px-2 py-1 font-label-md text-label-md text-on-surface">
              All parishes with counts ({parishCount})
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 font-label-sm text-label-sm text-on-surface-variant">
            <Icon name="cloud_done" className="text-[16px] text-secondary" />
            Live coverage from Dominion
          </span>
          {onRefresh ? (
            <button
              type="button"
              className="flex items-center gap-1 font-label-sm text-label-sm font-semibold text-secondary hover:text-secondary-container"
              onClick={onRefresh}
            >
              <Icon name="refresh" className="text-[15px]" />
              Force Ping
            </button>
          ) : null}
        </div>
      </section>

      {/* KPI cards — D4 structure, live bindings */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-[0px_1px_2px_0px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">WAITING IN QUEUE</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-headline-xl text-headline-xl font-code-tabular font-bold text-on-surface">{pending}</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">places</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-outline-variant/20 pt-2 font-label-sm text-label-sm">
            <span className="text-on-surface-variant">Queue</span>
            {onOpenQueue ? (
              <button type="button" className="font-semibold text-secondary hover:underline" onClick={onOpenQueue}>
                Open queue
              </button>
            ) : (
              <span className="font-code-tabular font-medium text-on-surface">{pending} pending</span>
            )}
          </div>
        </div>

        <div className="rounded border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-[0px_1px_2px_0px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">OLDEST WAITING</span>
            {oldest >= 2 ? (
              <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                SLA Warning
              </span>
            ) : null}
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-headline-xl text-headline-xl font-code-tabular font-bold text-amber-700">
              {oldest}
              <span className="font-headline-md text-headline-md"> day{oldest === 1 ? '' : 's'}</span>
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-outline-variant/20 pt-2 font-label-sm text-label-sm">
            <span className="text-on-surface-variant">Oldest item age in queue</span>
            {onOpenQueue ? (
              <button type="button" className="font-semibold text-secondary hover:underline" onClick={onOpenQueue}>
                Inspect
              </button>
            ) : null}
          </div>
        </div>

        <div className="rounded border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-[0px_1px_2px_0px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">VERIFIED PLACES</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-headline-xl text-headline-xl font-code-tabular font-bold text-emerald-700">
              {verifiedTotal.toLocaleString()}
            </span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">verified listings</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-outline-variant/20 pt-2 font-label-sm text-label-sm">
            <span className="text-on-surface-variant">Across parishes with counts</span>
            <span className="font-code-tabular font-medium text-emerald-700">{parishCount} parish{parishCount === 1 ? '' : 'es'}</span>
          </div>
        </div>

        <div className="rounded border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-[0px_1px_2px_0px_rgba(15,23,42,0.04)] transition-colors hover:border-slate-300">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline">PARISHES WITH COUNTS</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-headline-xl text-headline-xl font-code-tabular font-bold text-on-surface">{parishCount}</span>
            <span className="font-body-sm text-body-sm text-on-surface-variant">parishes</span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-outline-variant/20 pt-2 font-label-sm text-label-sm">
            <span className="text-on-surface-variant">Highest parish backlog</span>
            <span className="font-code-tabular font-medium text-on-surface">{highBacklog} pending</span>
          </div>
        </div>
      </section>

      {/* Middle grid — density list (no fake SVG choropleth) + empty history chart */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="col-span-1 flex flex-col justify-between rounded border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-[0px_1px_2px_0px_rgba(15,23,42,0.04)] lg:col-span-8">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/20 pb-3">
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Jamaica Parish Coverage Density</h2>
                <p className="mt-0.5 font-body-sm text-body-sm text-outline">
                  Live verified counts by parish. Map polygons are omitted until geospatial layers ship.
                </p>
              </div>
              <div className="flex items-center gap-3 rounded border border-outline-variant/30 bg-surface-bright px-3 py-1">
                <span className="font-label-sm text-label-sm uppercase text-outline">Density (relative):</span>
                <div className="flex items-center gap-1 font-code-tabular text-[11px]">
                  <span className="inline-block h-3 w-3 rounded border border-blue-200 bg-blue-100" />
                  <span className="text-outline">Low</span>
                </div>
                <div className="flex items-center gap-1 font-code-tabular text-[11px]">
                  <span className="inline-block h-3 w-3 rounded bg-blue-500" />
                  <span className="text-outline">Mid</span>
                </div>
                <div className="flex items-center gap-1 font-code-tabular text-[11px]">
                  <span className="inline-block h-3 w-3 rounded bg-blue-800" />
                  <span className="font-semibold text-outline">High</span>
                </div>
              </div>
            </div>

            <div className="relative mt-3 min-h-[270px] w-full overflow-hidden rounded border border-outline-variant/20 bg-surface-bright/50">
              <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] opacity-40 [background-size:16px_16px]" />
              {parishTotals.length === 0 ? (
                <div className="relative flex h-[270px] items-center justify-center font-body-sm text-body-sm text-outline">
                  The data is not in yet.
                </div>
              ) : (
                <ul className="relative space-y-2 p-4">
                  {parishTotals.map((row) => {
                    const pct = densityPct(row.verified, maxVerified);
                    return (
                      <li key={row.pcode}>
                        <div className="mb-1 flex items-center justify-between font-label-md text-label-md">
                          <span className="font-mono font-semibold text-on-surface">{row.pcode}</span>
                          <span className="font-code-tabular text-on-surface-variant">
                            <strong className="text-on-surface">{row.verified}</strong> verified · {row.waiting} pending
                          </span>
                        </div>
                        <div className="h-2.5 overflow-hidden rounded bg-blue-100">
                          <div
                            className={`h-full rounded ${pct > 66 ? 'bg-blue-800' : pct > 33 ? 'bg-blue-500' : 'bg-blue-300'}`}
                            style={{ width: `${Math.max(pct, row.verified > 0 ? 8 : 0)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/20 pt-3">
            <div className="flex flex-wrap items-center gap-6 font-label-md text-label-md">
              <div>
                <span className="text-outline">Total Verified: </span>
                <span className="font-code-tabular font-bold text-on-surface">{verifiedTotal.toLocaleString()} places</span>
              </div>
              <div className="hidden h-3 w-px bg-outline-variant/40 sm:block" />
              <div>
                <span className="text-outline">Parishes listed: </span>
                <span className="font-code-tabular font-bold text-on-surface">{parishCount}</span>
              </div>
            </div>
            <button
              type="button"
              className="flex items-center gap-1 font-label-md text-label-md font-semibold text-secondary hover:text-secondary-container"
              onClick={onShowParishes}
            >
              <span>View full parish table</span>
              <Icon name="arrow_forward" className="text-[16px]" />
            </button>
          </div>
        </div>

        <div className="col-span-1 flex flex-col justify-between rounded border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-[0px_1px_2px_0px_rgba(15,23,42,0.04)] lg:col-span-4">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="font-headline-sm text-headline-sm text-on-surface">Places Approved per Day</h2>
                <p className="mt-0.5 font-body-sm text-body-sm text-outline">Verification velocity over time.</p>
              </div>
            </div>
            <div className="mt-4 flex h-[220px] flex-col items-center justify-center rounded border border-dashed border-outline-variant/50 bg-surface-bright/60 px-4 text-center">
              <Icon name="show_chart" className="mb-2 text-[28px] text-outline" />
              <p className="font-headline-sm text-headline-sm text-on-surface">History not available yet</p>
              <p className="mt-1 font-body-sm text-body-sm text-outline">
                Daily approval series is not on the live coverage feed.
              </p>
            </div>
          </div>
          <div className="border-t border-outline-variant/20 pt-2 font-code-tabular text-[10px] text-outline">
            Chart omitted — no demo polylines
          </div>
        </div>
      </section>

      {/* Bottom: Parish Verification Registry — full width (contributors omitted) */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="col-span-1 rounded border border-outline-variant/40 bg-surface-container-lowest p-4 shadow-[0px_1px_2px_0px_rgba(15,23,42,0.04)] lg:col-span-12">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface">Parish Verification Registry</h2>
              <p className="font-body-sm text-body-sm text-outline">
                Kind distribution from live coverage rows and moderation backlogs.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-label-sm text-label-sm text-outline">
                Showing: <strong>{parishCount} parish{parishCount === 1 ? '' : 'es'}</strong>
              </span>
              <button
                type="button"
                className="h-7 rounded border border-outline-variant/60 px-2 font-label-sm text-label-sm text-on-surface transition-colors hover:bg-surface-bright"
                onClick={onShowParishes}
              >
                Expand All Parishes
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded border border-outline-variant/40">
            {parishTotals.length === 0 ? (
              <p className="p-6 font-body-sm text-body-sm text-outline">The data is not in yet.</p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="h-[34px] border-b border-outline-variant/30 bg-[#f8fafc] font-label-sm text-label-sm uppercase tracking-wider text-outline">
                    <th className="px-3 font-semibold">Parish</th>
                    <th className="px-2 font-semibold">Kind</th>
                    <th className="px-2 text-right font-semibold">Verified</th>
                    <th className="px-3 text-right font-semibold">Pending</th>
                    <th className="px-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/20 font-body-md font-code-tabular text-body-md">
                  {parishTotals.flatMap((row) =>
                    row.rows.map((kindRow) => {
                      const waiting = Number(kindRow.pending_count || 0);
                      const flagged = waiting >= highBacklog && highBacklog > 0 && waiting > 0;
                      return (
                        <tr
                          key={`${row.pcode}-${kindRow.kind}`}
                          className={`h-[38px] transition-colors hover:bg-[#f8fafc] ${flagged ? 'bg-amber-50/30' : ''}`}
                        >
                          <td className="px-3 font-label-md font-medium text-on-surface">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="font-mono">{row.pcode}</span>
                              {flagged ? (
                                <Icon name="flag" className="text-[14px] text-amber-600" />
                              ) : null}
                            </span>
                          </td>
                          <td className="px-2 text-on-surface">{kindRow.kind}</td>
                          <td className="px-2 text-right text-on-surface">{kindRow.verified_count}</td>
                          <td className="px-3 text-right">
                            {flagged ? (
                              <span className="inline-block rounded border border-amber-300 bg-amber-100 px-2 py-0.5 font-bold text-amber-900">
                                {waiting}
                              </span>
                            ) : (
                              <span className="inline-block rounded bg-surface-container px-1.5 py-0.5 font-semibold text-on-surface">
                                {waiting}
                              </span>
                            )}
                          </td>
                          <td className="px-3 text-center">
                            {onOpenQueue ? (
                              <button
                                type="button"
                                className="font-label-md text-body-sm font-semibold text-secondary hover:text-secondary-container hover:underline"
                                onClick={onOpenQueue}
                              >
                                Review
                              </button>
                            ) : (
                              <span className="text-outline">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
                <tfoot>
                  <tr className="h-[42px] border-t-2 border-outline-variant/50 bg-[#f8fafc] font-code-tabular text-body-sm font-bold text-on-surface">
                    <td className="px-3 font-label-md uppercase tracking-wider text-outline" colSpan={2}>
                      Totals ({parishCount} Parishes)
                    </td>
                    <td className="px-2 text-right">
                      <span className="mr-2 font-label-md font-semibold text-emerald-700">
                        {verifiedTotal.toLocaleString()} Verified Places
                      </span>
                    </td>
                    <td className="px-3 text-right">
                      <span className="inline-block rounded bg-error/10 px-2 py-0.5 font-bold text-error">
                        {pending} Pending
                      </span>
                    </td>
                    <td className="px-3 text-center">
                      {onOpenQueue ? (
                        <button
                          type="button"
                          className="font-label-md text-[11px] font-semibold text-secondary hover:underline"
                          onClick={onOpenQueue}
                        >
                          Batch Review
                        </button>
                      ) : null}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function ParishTablePanel({
  pending,
  oldest: _oldest,
  parishTotals,
  verifiedTotal,
  maxVerified,
  onOpenQueue,
  onRefresh,
}: PlacesReviewCoverageProps) {
  void _oldest;
  const parishCount = parishTotals.length;
  const topParish = parishTotals[0];
  const topPct = topParish ? densityPct(topParish.verified, maxVerified) : 0;

  return (
    <div className="space-y-6">
      {/* Page header — D5 main (no aside/top app bar) */}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-headline-lg text-headline-lg font-bold tracking-tight text-on-surface">
            Parish Infrastructure Coverage
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant">
            Geospatial verification audit of parishes with live coverage counts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh ? (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 font-label-md text-label-md text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
              onClick={onRefresh}
            >
              <Icon name="sync" className="text-[16px] text-slate-500" />
              <span>Refresh</span>
            </button>
          ) : null}
          {onOpenQueue ? (
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded bg-slate-900 px-3 font-label-md text-label-md text-white shadow-sm transition-colors hover:bg-black"
              onClick={onOpenQueue}
            >
              <Icon name="rate_review" className="text-[16px]" />
              <span>Open queue</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Metric cards — D5, live bindings only */}
      <div className="mb-2 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded border border-slate-200/90 bg-surface-container-lowest p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-slate-500">
              Total Verified Places
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-headline-xl text-headline-xl font-code-tabular font-bold text-slate-900">
              {verifiedTotal.toLocaleString()}
            </span>
            <span className="text-xs text-slate-400">active POIs</span>
          </div>
          <div className="mt-2 flex items-center gap-1 text-xs text-slate-500">
            <Icon name="check_circle" className="text-[14px] text-slate-400" />
            <span>From live coverage feed</span>
          </div>
        </div>

        <div className="relative rounded border border-slate-200/90 bg-surface-container-lowest p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-slate-500">
              Pending Moderation
            </span>
            <span className="inline-flex items-center rounded border border-stone-300 bg-stone-100 px-1.5 py-0.5 text-[11px] font-semibold text-[#57534e]">
              Action Req.
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-headline-xl text-headline-xl font-code-tabular font-bold text-[#57534e]">{pending}</span>
            <span className="text-xs text-slate-500">places in queue</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-stone-600">
            <span className="flex items-center gap-1">
              <Icon name="schedule" className="text-[14px] text-[#57534e]" />
              <span>Queue depth from coverage</span>
            </span>
            {onOpenQueue ? (
              <button type="button" className="text-[11px] font-medium text-secondary hover:underline" onClick={onOpenQueue}>
                Audit Queue →
              </button>
            ) : null}
          </div>
        </div>

        <div className="rounded border border-slate-200/90 bg-surface-container-lowest p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-slate-500">
              Parishes with Counts
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-headline-xl text-headline-xl font-code-tabular font-bold text-slate-900">{parishCount}</span>
            <span className="text-xs text-slate-500">parishes listed</span>
          </div>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-blue-600"
              style={{ width: `${parishCount ? Math.min(100, Math.round((parishCount / 14) * 100)) : 0}%` }}
            />
          </div>
        </div>

        <div className="rounded border border-slate-200/90 bg-surface-container-lowest p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-slate-500">
              Top Performing Parish
            </span>
            <span className="inline-flex items-center rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              By verified
            </span>
          </div>
          {topParish ? (
            <>
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="font-headline-xl text-headline-xl font-bold text-slate-900 font-mono">{topParish.pcode}</span>
                  <span className="ml-1 text-xs text-slate-500">Parish</span>
                </div>
                <span className="font-headline-lg text-headline-lg font-code-tabular font-bold text-emerald-600">{topPct}%</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>
                  {topParish.verified} verified · {topParish.waiting} pending
                </span>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">The data is not in yet.</p>
          )}
        </div>
      </div>

      {/* Filter rail — D5 visual; county filters not on live rows */}
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3 rounded border border-slate-200/80 bg-surface-container-lowest p-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.02)]">
        <div className="flex flex-wrap items-center gap-1">
          <span className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Coverage:</span>
          <span className="rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
            All listed parishes ({parishCount})
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[#16a34a]" /> Optimal (&gt;75%)
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Moderate (40-75%)
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-300" /> Deficit (&lt;40%)
            </span>
          </div>
        </div>
      </div>

      {/* Main table — D5 structure, live rows */}
      <div
        className="overflow-hidden rounded border border-slate-200 bg-surface-container-lowest shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
        id="table-section"
      >
        <div className="overflow-x-auto">
          {parishTotals.length === 0 ? (
            <p className="p-8 text-sm text-slate-500">The data is not in yet.</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="h-[34px] select-none border-b border-slate-200 bg-[#f8fafc] font-label-sm text-label-sm uppercase tracking-wider text-slate-600">
                  <th className="w-10 px-3 text-center">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-3 font-semibold text-slate-700">Parish</th>
                  <th className="px-3 font-semibold text-slate-700">Infrastructure Breakdown (by kind)</th>
                  <th className="w-64 px-3 font-semibold text-slate-700">Coverage Density</th>
                  <th className="px-3 text-center font-semibold text-slate-700">Pending Review</th>
                  <th className="px-3 text-center font-semibold text-slate-700">Audit Status</th>
                  <th className="px-3 pr-4 text-right font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-body-sm text-body-sm">
                {parishTotals.map((row) => {
                  const pct = densityPct(row.verified, maxVerified);
                  const status = auditStatus(row.waiting, row.verified);
                  return (
                    <tr key={row.pcode} className="group h-[40px] transition-colors hover:bg-slate-50/80">
                      <td className="px-3 text-center">
                        <input
                          className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 text-secondary focus:ring-secondary"
                          type="checkbox"
                          aria-label={`Select ${row.pcode}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-slate-900">{row.pcode}</span>
                          <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
                            {row.rows.length} kind{row.rows.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">
                        <div className="font-code-tabular text-[11px]" title={kindBreakdown(row.rows)}>
                          {row.rows.length === 0 ? (
                            '—'
                          ) : (
                            row.rows.map((kindRow, index) => (
                              <span key={`${row.pcode}-${kindRow.kind}`}>
                                {index > 0 ? <span className="text-slate-300"> • </span> : null}
                                <strong className="text-slate-800">{kindRow.verified_count}</strong> {kindRow.kind}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <div className="h-2 w-36 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${densityBarClass(pct)}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`font-code-tabular text-xs font-semibold ${densityTextClass(pct)}`}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className="inline-flex items-center rounded border border-[#e7e5e4] bg-[#f5f5f4] px-2 py-0.5 text-[11px] font-semibold text-[#57534e]">
                          {row.waiting} pending
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${status.className}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} /> {status.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            className="h-6 rounded border border-slate-200 bg-white px-2 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-100"
                            onClick={onOpenQueue}
                            disabled={!onOpenQueue}
                          >
                            Inspect
                          </button>
                          <button
                            type="button"
                            className="h-6 rounded bg-slate-900 px-2 text-[11px] font-medium text-white transition-colors hover:bg-black disabled:opacity-40"
                            onClick={onOpenQueue}
                            disabled={!onOpenQueue}
                          >
                            Audit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex h-10 items-center justify-between border-t border-slate-200 bg-[#f8fafc] px-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span>
              Displaying <strong>{parishCount}</strong> of <strong>{parishCount}</strong> parishes
            </span>
            <span className="text-slate-300">•</span>
            <span>
              Verified total: <strong>{verifiedTotal.toLocaleString()}</strong>
            </span>
          </div>
          <div className="flex items-center gap-1 text-slate-400">
            <span className="font-code-tabular text-slate-700 px-1">1 / 1</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlacesReviewCoverage({
  pending,
  oldest,
  parishTotals,
  verifiedTotal,
  maxVerified,
  section: sectionProp,
  onSectionChange,
  onOpenQueue,
  onRefresh,
}: PlacesReviewCoverageProps) {
  const [internalSection, setInternalSection] = useState<PlacesReviewCoverageSection>(sectionProp || 'overview');
  const section = sectionProp ?? internalSection;

  const setSection = (next: PlacesReviewCoverageSection) => {
    if (sectionProp == null) setInternalSection(next);
    onSectionChange?.(next);
  };

  return (
    <div className="min-w-0 space-y-4 bg-surface text-on-surface antialiased">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`h-8 rounded border px-3 font-label-md text-label-md ${
            section === 'overview'
              ? 'border-secondary bg-secondary text-surface-container-lowest'
              : 'border-outline-variant/60 bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
          }`}
          onClick={() => setSection('overview')}
        >
          Coverage Overview
        </button>
        <button
          type="button"
          className={`h-8 rounded border px-3 font-label-md text-label-md ${
            section === 'parishes'
              ? 'border-secondary bg-secondary text-surface-container-lowest'
              : 'border-outline-variant/60 bg-surface-container-lowest text-on-surface hover:bg-surface-container-low'
          }`}
          onClick={() => setSection('parishes')}
        >
          Parish Table
        </button>
      </div>

      {section === 'overview' ? (
        <OverviewPanel
          pending={pending}
          oldest={oldest}
          parishTotals={parishTotals}
          verifiedTotal={verifiedTotal}
          maxVerified={maxVerified}
          onOpenQueue={onOpenQueue}
          onRefresh={onRefresh}
          onShowParishes={() => setSection('parishes')}
        />
      ) : (
        <ParishTablePanel
          pending={pending}
          oldest={oldest}
          parishTotals={parishTotals}
          verifiedTotal={verifiedTotal}
          maxVerified={maxVerified}
          onOpenQueue={onOpenQueue}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}
