import { useState } from 'react';
import { ChevronDown, ChevronRight, Check, AlertTriangle } from 'lucide-react';
import { formatMoney } from '@roam/ui/formatMoney';
import type { StatementSummary } from '../../types/statementSummary';
import { cn } from '../ui/utils';

export const STATEMENT_HELP = {
  totalEarnings: 'Uber total earnings for this week. Fare, cancellation, time at stop, priority, wait time, and tip.',
  fare: 'Uber Fare block. Open it to see each piece.',
  tip: 'Extra paid by the rider.',
  toll: 'Toll refund Uber added on top of earnings. Opens Toll Reconciliation.',
  adjustments: 'Money carried from an earlier week.',
  cash: 'Cash the rider paid the driver. Taken from one source only.',
  net: 'What Uber paid to the bank. It must match the deposit.',
};

export function StatementTooltipIcon({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-[10px] text-slate-500"
        aria-label={content}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open && (
        <span className="absolute left-0 top-5 z-20 w-56 rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-600 shadow-md dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {content}
        </span>
      )}
    </span>
  );
}

type LineClick = (line: 'fare' | 'cancellation' | 'tip' | 'toll' | 'trips') => void;

type Props = {
  summary: StatementSummary;
  onOpenTollRecon?: () => void;
  onOpenLine?: LineClick;
  deltas?: { earnings: number; net: number; trips: number } | null;
  /** Optional "Updated hh:mm" from API when available. */
  updatedLabel?: string | null;
};

function tieStateOf(summary: StatementSummary): 'ties' | 'off' | 'not_checked' {
  if (summary.tieState) return summary.tieState;
  if (summary.bankSource === 'computed') return 'not_checked';
  const gap = summary.tieOutDifference ?? summary.payoutReconciliationGap;
  if (gap == null) return 'not_checked';
  return Math.abs(gap) < 0.01 ? 'ties' : 'off';
}

function deltaText(n: number, money = true): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${money ? formatMoney(n) : n}`;
}

function Money({ n, sign }: { n: number; sign?: boolean }) {
  const text = formatMoney(sign && n > 0 ? -n : n);
  return <span className="tabular-nums">{text}</span>;
}

function Row({
  label,
  amount,
  indent = 0,
  help,
  onClick,
  strong,
  sign,
}: {
  label: string;
  amount: number;
  indent?: number;
  help?: string;
  onClick?: () => void;
  strong?: boolean;
  sign?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between py-1.5 text-left text-sm',
        onClick && 'hover:bg-slate-50 dark:hover:bg-slate-800/60',
        strong && 'font-semibold',
      )}
      style={{ paddingLeft: indent * 16 }}
    >
      <span className="flex items-center text-slate-700 dark:text-slate-200">
        {label}
        {help ? <StatementTooltipIcon content={help} /> : null}
      </span>
      <Money n={amount} sign={sign} />
    </Tag>
  );
}

export function StatementSummaryCard({ summary, onOpenTollRecon, onOpenLine, deltas, updatedLabel }: Props) {
  const [fareOpen, setFareOpen] = useState(true);
  const [refundsOpen, setRefundsOpen] = useState(true);
  const [payoutOpen, setPayoutOpen] = useState(true);
  const platform = summary.platform;
  const isUber = platform === 'Uber';
  const toll = summary.tollRefund ?? summary.platformTollCredits ?? summary.uberTollCredits ?? 0;
  const net = summary.netEarnings ?? summary.bankTransfer;
  const tieState = tieStateOf(summary);
  const hash = tieState === 'ties' && summary.importFileHash ? String(summary.importFileHash).slice(0, 6) : null;
  const tieCopy = tieState === 'not_checked'
    ? 'Not checked — no Uber deposit row'
    : tieState === 'off'
      ? `Off by ${formatMoney(summary.tieOutDifference ?? summary.payoutReconciliationGap ?? 0)}`
      : `Ties${hash ? ` to file ${hash}` : ''}`;

  return (
    <article className="statement-print rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {platform}
          {summary.driverName ? ` · ${summary.driverName}` : ''}
          <span className="ml-2 text-sm font-normal text-slate-500">
            {summary.periodStart} – {summary.periodEnd}
          </span>
        </h3>
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium',
          tieState === 'ties' && 'bg-emerald-50 text-emerald-800',
          tieState === 'off' && 'bg-amber-50 text-amber-900',
          tieState === 'not_checked' && 'bg-slate-100 text-slate-600',
        )}>
          {tieState === 'ties' ? <Check className="h-3.5 w-3.5" /> : tieState === 'off' ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
          {tieCopy}
        </span>
      </header>

      <div className="px-4 py-2">
        {isUber ? (
          <>
            <button type="button" className="flex w-full items-center justify-between py-2 text-sm font-semibold" onClick={() => setFareOpen((v) => !v)}>
              <span className="flex items-center gap-1">
                {fareOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Total earnings
                <StatementTooltipIcon content={STATEMENT_HELP.totalEarnings} />
              </span>
              <Money n={summary.totalEarnings} />
            </button>
            {fareOpen && (
              <div className="pb-2">
                <Row label="Fare" amount={summary.fare ?? summary.netFare} indent={2} onClick={() => onOpenLine?.('fare')} />
                <Row label="Cancellation" amount={summary.cancellation ?? 0} indent={3} onClick={() => onOpenLine?.('cancellation')} />
                <Row label="Time at stop" amount={summary.timeAtStop ?? 0} indent={3} />
                <Row
                  label={summary.prioritySource === 'residual' ? 'UberX Priority (estimated)' : 'UberX Priority'}
                  amount={summary.priority ?? 0}
                  indent={3}
                />
                <Row label="Wait time at pick-up" amount={summary.waitTime ?? 0} indent={3} />
                <Row label="Extra (tip given by user)" amount={summary.tips} indent={1} help={STATEMENT_HELP.tip} onClick={() => onOpenLine?.('tip')} />
              </div>
            )}
            <button type="button" className="flex w-full items-center justify-between py-2 text-sm font-semibold" onClick={() => setRefundsOpen((v) => !v)}>
              <span className="flex items-center gap-1">
                {refundsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Refunds & expenses
              </span>
              <Money n={toll} />
            </button>
            {refundsOpen && (
              <Row label="Toll" amount={toll} indent={2} help={STATEMENT_HELP.toll} onClick={onOpenTollRecon} />
            )}
            <Row label="Adjustments from previous periods" amount={summary.periodAdjustments} help={STATEMENT_HELP.adjustments} />
            {(summary.carriedFromWeeks ?? []).map((week) => (
              <p key={week} className="pl-4 text-xs text-slate-500">Carried from week {week}</p>
            ))}
            <button type="button" className="flex w-full items-center justify-between py-2 text-sm font-semibold" onClick={() => setPayoutOpen((v) => !v)}>
              <span className="flex items-center gap-1">
                {payoutOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Payout
              </span>
              <Money n={summary.cashCollected} sign />
            </button>
            {payoutOpen && (
              <Row label="Cash collected" amount={summary.cashCollected} indent={2} sign help={STATEMENT_HELP.cash} />
            )}
          </>
        ) : platform === 'Roam' ? (
          <>
            <Row label="Fare" amount={summary.totalEarnings} strong />
            <Row label="Tips" amount={summary.tips} />
            <Row label="Cash collected" amount={summary.cashCollected} sign />
            {summary.commissionRecorded ? (
              <>
                <Row label="Commission" amount={summary.platformFee ?? 0} sign />
                <Row label="Net to fleet" amount={net} strong />
              </>
            ) : (
              <p className="py-2 text-sm text-slate-500">Net — no commission recorded</p>
            )}
          </>
        ) : (
          <>
            <Row label="Fare" amount={summary.totalEarnings} strong />
            {summary.commissionRecorded ? (
              <Row label="InDrive service fee" amount={summary.platformFee ?? 0} sign />
            ) : (
              <p className="py-2 text-sm text-slate-500">InDrive service fee — not recorded</p>
            )}
            <Row label="Cash collected" amount={summary.cashCollected} sign />
            {summary.commissionRecorded ? <Row label="Net income" amount={net} strong /> : null}
          </>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
        <div>
          {(platform === 'Roam' || platform === 'InDrive') && !summary.commissionRecorded ? null : (
            <>
              <p className="text-xs text-slate-500">Net earnings (paid to bank)</p>
              <p className="text-lg font-semibold tabular-nums">{formatMoney(net)}</p>
              {summary.bankSource === 'computed' && (
                <p className="text-xs text-slate-500">Computed from driver payments</p>
              )}
            </>
          )}
          {tieState !== 'ties' && summary.importedAt && (
            <p className="text-xs text-slate-500">Last import {new Date(summary.importedAt).toLocaleString()}</p>
          )}
          {summary.actualDeposit != null && summary.actualDepositDate && (
            <p className="text-xs text-slate-500">Deposited on {summary.actualDepositDate} {formatMoney(summary.actualDeposit)}</p>
          )}
          {deltas && (
            <p className="text-xs text-slate-500">
              Vs last week {deltaText(deltas.earnings)} earnings
              {(platform === 'Roam' || platform === 'InDrive') && !summary.commissionRecorded ? '' : ` · ${deltaText(deltas.net)} net`}
              {` · ${deltaText(deltas.trips, false)} trips`}
            </p>
          )}
          {updatedLabel ? <p className="text-xs text-slate-500">Updated {updatedLabel}</p> : null}
        </div>
        <button type="button" className="text-sm text-indigo-700 underline" onClick={() => onOpenLine?.('trips')}>
          Trips {summary.tripCount ?? 0}
          {summary.distanceKm ? ` · ${summary.distanceKm.toLocaleString(undefined, { maximumFractionDigits: 1 })} km (trip activity)` : ''}
        </button>
      </footer>
    </article>
  );
}
