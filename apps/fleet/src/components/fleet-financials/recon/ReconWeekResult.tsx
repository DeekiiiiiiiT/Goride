/**
 * Week result of a closed rideshare week (Stitch "Week result" screens 1–3, owner 15 Nov 2026).
 * Five numbers only: Revenue − Expenses = Profit, then Fleet profit + Driver profit = Profit.
 * Numbers come from GET /recon/runs/:line/:week/result (every driver's closed statements).
 */
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Banknote, Loader2, Receipt, TrendingDown, TrendingUp, Info } from 'lucide-react';
import { fetchWeekResult, type ReconWeekResult as WeekResult } from '../../../services/reconApi';

const CARD =
  'rounded-[20px] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_6px_12px_-2px_rgba(15,23,42,0.04)]';

/** Whole J$ on the card ("J$92,021", "−J$5,500"). */
export function formatWholeJmd(minor: number): string {
  const major = Math.round(minor / 100);
  return `${major < 0 ? '−' : ''}J$${Math.abs(major).toLocaleString('en-US')}`;
}

/** Exact amount for the tooltip ("J$92,021.20"). */
export function formatExactJmd(minor: number): string {
  const body = (Math.abs(minor) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${minor < 0 ? '−' : ''}J$${body}`;
}

function Shimmer({ className }: { className: string }) {
  return <span className={`block animate-pulse rounded-xl bg-[#dce9ff] ${className}`} aria-hidden />;
}

function BigCard({
  label,
  icon,
  minor,
  helper,
  tone = 'plain',
  chip,
  loading,
  testId,
}: {
  label: string;
  icon: React.ReactNode;
  minor?: number;
  helper?: string;
  tone?: 'plain' | 'profit' | 'loss';
  chip?: React.ReactNode;
  loading?: boolean;
  testId: string;
}) {
  const color = tone === 'profit' ? 'text-[#069669]' : tone === 'loss' ? 'text-[#ba1a1a]' : 'text-[#0b1c30]';
  return (
    <div className={`${CARD} flex-1`} data-testid={testId}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[#47464c]">{label}</span>
        {icon}
      </div>
      {loading || minor == null ? (
        <Shimmer className="mt-2 h-12 w-40" />
      ) : (
        <p
          className={`mt-2 text-[40px] font-semibold leading-[48px] tracking-tight tabular-nums ${color}`}
          title={formatExactJmd(minor)}
        >
          {formatWholeJmd(minor)}
        </p>
      )}
      {chip ? <div className="mt-1">{chip}</div> : helper ? <p className="mt-1 text-[13px] font-medium text-[#47464c]">{helper}</p> : null}
    </div>
  );
}

function Sign({ children }: { children: string }) {
  return (
    <span className="hidden shrink-0 select-none px-1 text-[26px] font-light text-[#47464c]/40 md:block" aria-hidden>
      {children}
    </span>
  );
}

/** The five numbers. `result` null = still adding up (Stitch screen 3). Exported for tests. */
export function WeekResultCards({ result }: { result: WeekResult | null }) {
  const loading = !result;
  const loss = !!result && result.profitMinor < 0;
  const shared = !!result && result.fleetSharePercent != null && result.driverSharePercent != null;
  return (
    <div className="space-y-4" data-testid="recon-week-result">
      <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center">
        <BigCard
          testId="week-result-revenue"
          label="Revenue"
          icon={<Banknote className="h-[18px] w-[18px] text-[#47464c] opacity-40" aria-hidden />}
          minor={result?.revenueMinor}
          helper="Fares and tips"
          loading={loading}
        />
        <Sign>−</Sign>
        <BigCard
          testId="week-result-expenses"
          label="Expenses"
          icon={<Receipt className="h-[18px] w-[18px] text-[#47464c] opacity-40" aria-hidden />}
          minor={result?.expensesMinor}
          helper="Fuel + tolls"
          loading={loading}
        />
        <Sign>=</Sign>
        <BigCard
          testId="week-result-profit"
          label="Profit"
          icon={
            loss ? (
              <TrendingDown className="h-[18px] w-[18px] text-[#ba1a1a]" aria-hidden />
            ) : (
              <TrendingUp className={`h-[18px] w-[18px] ${loading ? 'text-[#47464c] opacity-40' : 'text-[#069669]'}`} aria-hidden />
            )
          }
          minor={result?.profitMinor}
          tone={loss ? 'loss' : 'profit'}
          loading={loading}
          chip={
            loading ? (
              <Shimmer className="h-7 w-28" />
            ) : loss ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ffdad6] px-2.5 py-1 text-[11px] font-semibold text-[#ba1a1a]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#ba1a1a]" aria-hidden /> Loss
              </span>
            ) : result!.marginPercent != null ? (
              <span className="inline-flex items-center rounded-full bg-[#85f8c4] px-2.5 py-1 text-[11px] font-semibold text-[#005137]">
                {result!.marginPercent}% margin
              </span>
            ) : null
          }
        />
      </div>

      <div className={CARD} data-testid="week-result-shared">
        <h3 className="mb-6 text-base font-semibold text-[#0b1c30]">How the profit was shared</h3>
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#47464c]">Fleet profit</span>
              {shared ? (
                <span className="rounded-full bg-black px-2.5 py-1 text-[11px] font-semibold text-white">{result!.fleetSharePercent}%</span>
              ) : null}
            </div>
            {loading ? (
              <Shimmer className="mt-2 h-10 w-36" />
            ) : (
              <p
                className={`mt-1 text-[32px] font-semibold leading-10 tracking-tight tabular-nums ${result!.fleetProfitMinor < 0 ? 'text-[#ba1a1a]' : 'text-[#0b1c30]'}`}
                title={formatExactJmd(result!.fleetProfitMinor)}
                data-testid="week-result-fleet-profit"
              >
                {formatWholeJmd(result!.fleetProfitMinor)}
              </p>
            )}
            <p className="mt-1 text-[13px] font-medium text-[#47464c]">After paying drivers</p>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#47464c]">Driver profit</span>
              {shared ? (
                <span className="rounded-full bg-[#eff4ff] px-2.5 py-1 text-[11px] font-semibold text-[#0051d5]">{result!.driverSharePercent}%</span>
              ) : null}
            </div>
            {loading ? (
              <Shimmer className="mt-2 h-10 w-36" />
            ) : (
              <p
                className="mt-1 text-[32px] font-semibold leading-10 tracking-tight tabular-nums text-[#0051d5]"
                title={formatExactJmd(result!.driverProfitMinor)}
                data-testid="week-result-driver-profit"
              >
                {formatWholeJmd(result!.driverProfitMinor)}
              </p>
            )}
            <p className="mt-1 text-[13px] font-medium text-[#47464c]">Driver&apos;s cut after expenses</p>
            <p className="mt-1 text-[11px] font-semibold tracking-wide text-[#47464c] opacity-70">Added up for all drivers that week</p>
          </div>
        </div>
        {loading ? (
          <div className="mt-6 flex h-3 w-full overflow-hidden rounded-full" aria-hidden>
            <div className="h-full w-1/3 bg-[#b0bccf]" />
            <div className="h-full flex-1 bg-[#b4c5ff]" />
          </div>
        ) : shared ? (
          <div className="mt-6 flex h-3 w-full overflow-hidden rounded-full bg-[#e5eeff]" data-testid="week-result-split-bar">
            <div className="h-full bg-black" style={{ width: `${result!.fleetSharePercent}%` }} />
            <div className="h-full bg-[#0051d5]" style={{ width: `${result!.driverSharePercent}%` }} />
          </div>
        ) : (
          <p className="mt-6 flex items-center gap-2 text-sm text-[#47464c]" data-testid="week-result-loss-note">
            <Info className="h-4 w-4 shrink-0" aria-hidden /> Drivers were still paid for their trips, so the fleet carried the loss.
          </p>
        )}
      </div>

      {loading ? (
        <p className="flex items-center justify-center gap-2 pt-4 text-sm text-[#47464c]" data-testid="week-result-adding-up">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Adding up the week… this takes about 2 minutes.
        </p>
      ) : null}
    </div>
  );
}

/** Loads the week result and keeps asking while the close is still writing the statements. */
export function ReconWeekResult({ weekKey, version }: { weekKey: string; version: number }) {
  const q = useQuery({
    queryKey: ['recon-week-result', 'rideshare', weekKey, version],
    queryFn: () => fetchWeekResult('rideshare', weekKey),
    refetchInterval: (query) => (query.state.data && query.state.data.ready ? false : 10_000),
    staleTime: 60_000,
    retry: 1,
  });
  if (q.isError) {
    return (
      <p className="rounded-2xl bg-[#fff1f2] px-4 py-3 text-sm text-[#93000a]">
        Could not load the week result. Reload the week.
      </p>
    );
  }
  return <WeekResultCards result={q.data && q.data.ready ? q.data.result : null} />;
}
