import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Banknote, CreditCard, Landmark, Wallet } from 'lucide-react';
import { api } from '../../services/api';
import {
  EarningsPeriodFilter,
  initialEarningsPeriod,
} from '../earnings/EarningsPeriodFilter';
import type { FleetWalletSnapshot } from '../../types/fleetWallet';
import { emptyFleetWalletSnapshot } from '../../types/fleetWallet';
import { cn } from '../ui/utils';
import { Button } from '../ui/button';

type Props = {
  onNavigate?: (page: string) => void;
};

function formatJmd(n: number): string {
  const abs = Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-JMD ${abs}` : `JMD ${abs}`;
}

export function WalletPage({ onNavigate }: Props) {
  const [period, setPeriod] = useState(initialEarningsPeriod);
  const startDate = period.startDate;
  const endDate = period.endDate;

  const walletQuery = useQuery({
    queryKey: ['fleet-wallet-snapshot', startDate, endDate],
    queryFn: () => api.getFleetWalletSnapshot({ startDate, endDate }),
    enabled: Boolean(startDate && endDate),
    staleTime: 30_000,
  });

  const snapshot: FleetWalletSnapshot =
    walletQuery.data?.snapshot ?? emptyFleetWalletSnapshot(startDate, endDate);
  const loading = walletQuery.isLoading || walletQuery.isFetching;

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            Wallet
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Cash drivers are holding, Roam rider debt, and platform bank payouts for the
            selected period.
          </p>
        </div>
        <EarningsPeriodFilter
          value={period}
          onChange={setPeriod}
          className="w-full sm:w-auto sm:min-w-[320px]"
        />
      </div>

      {walletQuery.isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          Could not load wallet. {String((walletQuery.error as Error)?.message || '')}
        </div>
      ) : null}

      {/* Row 1: Balance | Roam Cash (Uber Wallet pattern) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SummaryTile
          label="Balance"
          subtitle={
            snapshot.balance.payoutScheduledLabel
              ? `Payout scheduled: ${snapshot.balance.payoutScheduledLabel}`
              : 'Platform bank transfer for this period'
          }
          amount={snapshot.balance.amount}
          loading={loading}
          icon={<Landmark className="h-5 w-5 text-slate-500" />}
          footer={
            <PlatformBreakdown
              byPlatform={snapshot.balance.byPlatform}
              loading={loading}
            />
          }
        />
        <SummaryTile
          label="Roam Cash"
          subtitle="Coming soon"
          amount={null}
          loading={false}
          comingSoon
          icon={<Wallet className="h-5 w-5 text-slate-400" />}
        />
      </div>

      {/* Row 2: Cash in Hand | Debt */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ActionTile
          label="Cash in Hand"
          subtitle="Cash drivers are holding"
          amount={snapshot.cashInHand.amount}
          loading={loading}
          accent="emerald"
          icon={<Banknote className="h-5 w-5" />}
          meta={
            snapshot.cashInHand.driverCount > 0
              ? `${snapshot.cashInHand.driverCount} driver${snapshot.cashInHand.driverCount === 1 ? '' : 's'}`
              : undefined
          }
          ctaLabel="Collect cash"
          onCta={onNavigate ? () => onNavigate('driver-settlements') : undefined}
          rows={snapshot.cashInHand.topHolders.map((h) => ({
            id: h.driverId,
            name: h.name,
            amount: h.amount,
          }))}
        />
        <ActionTile
          label="Debt"
          subtitle="Roam rider change debt"
          amount={snapshot.debt.amount}
          loading={loading}
          accent="rose"
          icon={<CreditCard className="h-5 w-5" />}
          meta={
            snapshot.debt.driverCount > 0
              ? `${snapshot.debt.driverCount} driver${snapshot.debt.driverCount === 1 ? '' : 's'}`
              : undefined
          }
          rows={snapshot.debt.topDebtors.map((d) => ({
            id: d.driverId,
            name: d.name,
            amount: d.amount,
          }))}
        />
      </div>

      {/* Desk shortcuts — navigation only */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
          Related desks
        </h2>
        <div className="flex flex-wrap gap-2">
          <DeskLink
            label="Bank deposits"
            onClick={onNavigate ? () => onNavigate('fleet-financials') : undefined}
          />
          <DeskLink
            label="Driver settlements"
            onClick={onNavigate ? () => onNavigate('driver-settlements') : undefined}
          />
          <DeskLink
            label="InDrive wallet"
            onClick={onNavigate ? () => onNavigate('indrive-wallet') : undefined}
          />
          <DeskLink
            label="Earnings"
            onClick={onNavigate ? () => onNavigate('earnings') : undefined}
          />
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  subtitle,
  amount,
  loading,
  icon,
  comingSoon,
  footer,
}: {
  label: string;
  subtitle: string;
  amount: number | null;
  loading: boolean;
  icon: ReactNode;
  comingSoon?: boolean;
  footer?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-slate-50 px-5 py-5 dark:border-slate-700 dark:bg-slate-900/60',
        comingSoon && 'opacity-80',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
            {comingSoon ? '—' : loading ? '—' : formatJmd(amount ?? 0)}
          </p>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <div className="rounded-lg bg-white p-2 shadow-sm dark:bg-slate-800">{icon}</div>
      </div>
      {footer}
    </div>
  );
}

function PlatformBreakdown({
  byPlatform,
  loading,
}: {
  byPlatform: { roam: number; uber: number; indrive: number };
  loading: boolean;
}) {
  if (loading) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-200/80 pt-3 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-400">
      <span>Roam {formatJmd(byPlatform.roam)}</span>
      <span>Uber {formatJmd(byPlatform.uber)}</span>
      <span>InDrive {formatJmd(byPlatform.indrive)}</span>
    </div>
  );
}

function ActionTile({
  label,
  subtitle,
  amount,
  loading,
  accent,
  icon,
  meta,
  ctaLabel,
  onCta,
  rows,
}: {
  label: string;
  subtitle: string;
  amount: number;
  loading: boolean;
  accent: 'emerald' | 'rose';
  icon: ReactNode;
  meta?: string;
  ctaLabel?: string;
  onCta?: () => void;
  rows: Array<{ id: string; name: string; amount: number }>;
}) {
  const accentCls =
    accent === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-400'
      : 'text-rose-700 dark:text-rose-400';
  const iconWrap =
    accent === 'emerald'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400';

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className={cn('mt-1 text-2xl font-semibold tracking-tight', accentCls)}>
            {loading ? '—' : formatJmd(amount)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {subtitle}
            {meta ? ` · ${meta}` : ''}
          </p>
        </div>
        <div className={cn('rounded-lg p-2', iconWrap)}>{icon}</div>
      </div>

      {rows.length > 0 ? (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
            >
              <span className="truncate text-slate-700 dark:text-slate-300">{r.name}</span>
              <span className="shrink-0 font-medium tabular-nums text-slate-900 dark:text-slate-100">
                {formatJmd(r.amount)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400 dark:border-slate-800">
          {loading ? 'Loading…' : 'Nothing outstanding'}
        </p>
      )}

      {ctaLabel && onCta ? (
        <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onCta}>
            {ctaLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function DeskLink({ label, onClick }: { label: string; onClick?: () => void }) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="min-h-11"
      disabled={!onClick}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}
