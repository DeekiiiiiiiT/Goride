import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Receipt,
  Wallet,
  FileSpreadsheet,
  Calculator,
  Car,
  Info,
  ExternalLink,
} from 'lucide-react';
import { cn } from '../ui/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import {
  StatementSummary,
  StatementPlatform,
  FleetTollSnapshot,
} from '../../types/statementSummary';

/** Explanations match GET /ledger/statement-summary + Uber CSV vocabulary. */
export const STATEMENT_HELP = {
  periodNetEarnings:
    'Gross in-period earnings before payout split. Sum of fare earnings, promotions, and tips for this platform.',
  netFare:
    'Uber: sum of fare_earning minus promotions (CSV fare components). Other platforms: sum of fare_earning.',
  promotions:
    'Uber: payments_driver Promotions total. Other platforms: promotion events in range.',
  tips: 'Sum of tip ledger events in the period.',
  totalEarnings: 'Net Fare + Promotions + Tips — earnings subtotal before any trip toll expense.',
  uberTollCredits:
    'Uber CSV Refunds:Toll credits posted as toll_reimbursement. This is a credit memo from the statement — not plaza tag spend, and not “reimbursed for nothing.”',
  platformTollCredits:
    'Platform fare toll credits in earnings (CSV Refunds:Toll for Uber). Fleet tag spend is tracked in Toll Recon.',
  fleetTagSpendLinked:
    'Fleet plaza/tag spend on crossings linked to this platform’s trips this week (from Toll Recon engines). Informational — not subtracted from Net Period Earnings on this card.',
  noPlatformTolls:
    'This platform has no toll credits in the earnings statement. Fleet toll P&L (tag spend, credits, charged to drivers, net loss) lives in Toll Recon.',
  tripTollExpense:
    'Trip-level platform toll expense when the platform bills tolls as a cost line. Uber fare does not include toll — Uber uses CSV credits instead.',
  statementTollExpense:
    'Only real trip-level toll expense on this statement. Plaza tag spend is never included here.',
  adjustments:
    'Corrections from previous statement periods that apply to this period.',
  periodAdjustments: 'Sum of prior_period_adjustment ledger events.',
  payout:
    'Cash collected vs bank/digital payout for this platform in the period.',
  cashCollected:
    'Uber: payout_cash from organization import when available. Roam/InDrive: cash on cash fare trips.',
  bankTransfer:
    'Observed: payout_bank from import. Derived (no payout events): Total Earnings − statement toll expense − Cash Collected.',
  totalPayout: 'Cash Collected + Transferred to Bank.',
  payoutObserved:
    'Observed means payout_cash / payout_bank events were present. Derived means the bank line was computed from earnings.',
  payoutReconciliation:
    'Difference between Total Payout and (Total Earnings − statement toll expense + Period Adjustments).',
  netPeriodEarnings:
    'Total Earnings − statement toll expense + Period Adjustments. Uber toll credits are memo lines and are not subtracted as expenses.',
  combinedTotalEarnings: 'Sum of each platform’s Total Earnings for the selected date range.',
  combinedCashCollected: 'Sum of each platform’s Cash Collected.',
  combinedBankTransfer: 'Sum of each platform’s Transferred to Bank.',
  fleetTollSpend: 'Fleet plaza/tag spend this week (same as Toll Recon Spend card).',
  fleetTollCredits: 'Trip toll credits reimbursed by platforms (same as Toll Recon Reimbursed card).',
  fleetTollCharged: 'Amount charged back to drivers (same as Toll Recon Charged card).',
  fleetTollNetLoss: 'Spend − Credits − Charged (same as Toll Recon Net Loss).',
  openTollRecon: 'Opens Week Reconciliation → Tolls for this Monday–Sunday window.',
} as const;

interface StatementSummaryCardProps {
  summary: StatementSummary;
  className?: string;
  defaultExpanded?: boolean;
  showUberDriverScopePayoutNote?: boolean;
  /** Linked Uber (or platform) tag spend from fleetTollSnapshot — informational. */
  linkedTagSpend?: number;
  onOpenTollRecon?: () => void;
}

const PLATFORM_CONFIG: Record<
  StatementPlatform,
  { label: string; color: string; bgColor: string; icon: React.ElementType }
> = {
  Uber: { label: 'Uber', color: 'text-slate-900', bgColor: 'bg-slate-100', icon: Car },
  Roam: { label: 'Roam', color: 'text-amber-700', bgColor: 'bg-amber-50', icon: Car },
  InDrive: { label: 'InDrive', color: 'text-emerald-700', bgColor: 'bg-emerald-50', icon: Car },
};

function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'JMD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(amount)
    .replace('JMD', '$');
}

export function StatementTooltipIcon({ content }: { content: string }) {
  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 rounded-full p-0.5 text-slate-400 transition-colors hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/80 dark:hover:text-slate-300"
          aria-label="How this is calculated"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <Info className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[min(320px,calc(100vw-2rem))] text-left text-xs font-normal leading-snug text-balance px-3 py-2.5"
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

function AmountDisplay({
  amount,
  isExpense = false,
  showSign = false,
}: {
  amount: number | undefined | null;
  isExpense?: boolean;
  showSign?: boolean;
}) {
  if (amount === undefined || amount === null) {
    return <span className="text-slate-400">—</span>;
  }
  const isZero = Math.abs(amount) < 0.01;
  const isNegative = amount < 0 || isExpense;
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        isZero ? 'text-slate-400' : isNegative ? 'text-red-600' : 'text-emerald-600',
      )}
    >
      {showSign && !isZero && (isNegative ? '−' : '+')}
      {formatCurrency(Math.abs(amount))}
    </span>
  );
}

function SectionHeader({
  title,
  icon: Icon,
  expanded,
  onToggle,
  total,
  isExpense = false,
  tooltipContent,
}: {
  title: string;
  icon: React.ElementType;
  expanded: boolean;
  onToggle: () => void;
  total?: number;
  isExpense?: boolean;
  tooltipContent?: string;
}) {
  return (
    <div className="flex w-full items-stretch gap-1 p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg transition-colors">
      <button
        type="button"
        onClick={onToggle}
        className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="h-4 w-4 shrink-0 text-slate-500" />
          <span className="font-medium text-slate-700 dark:text-slate-300">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {total !== undefined && <AmountDisplay amount={total} isExpense={isExpense} />}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </button>
      {tooltipContent ? (
        <div className="flex shrink-0 items-center pr-0.5">
          <StatementTooltipIcon content={tooltipContent} />
        </div>
      ) : null}
    </div>
  );
}

function LineItem({
  label,
  amount,
  isExpense = false,
  indent = false,
  tooltipContent,
}: {
  label: string;
  amount: number | undefined | null;
  isExpense?: boolean;
  indent?: boolean;
  tooltipContent?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-2 py-1.5 text-sm', indent && 'pl-6')}>
      <div className="flex min-w-0 items-center gap-1">
        <span className="text-slate-600 dark:text-slate-400">{label}</span>
        {tooltipContent ? <StatementTooltipIcon content={tooltipContent} /> : null}
      </div>
      <AmountDisplay amount={amount} isExpense={isExpense} />
    </div>
  );
}

function TotalLineRow({
  label,
  amount,
  isExpense = false,
  tooltipContent,
}: {
  label: string;
  amount: number | undefined | null;
  isExpense?: boolean;
  tooltipContent?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm font-medium">
      <div className="flex min-w-0 items-center gap-1">
        <span className="text-slate-700 dark:text-slate-300">{label}</span>
        {tooltipContent ? <StatementTooltipIcon content={tooltipContent} /> : null}
      </div>
      <AmountDisplay amount={amount} isExpense={isExpense} />
    </div>
  );
}

function TollStorySection({
  summary,
  linkedTagSpend,
  onOpenTollRecon,
  expanded,
  onToggle,
}: {
  summary: StatementSummary;
  linkedTagSpend?: number;
  onOpenTollRecon?: () => void;
  expanded: boolean;
  onToggle: () => void;
}) {
  const story =
    summary.tollStory ||
    (summary.platform === 'Uber' && (summary.uberTollCredits ?? summary.platformTollCredits ?? 0) > 0.005
      ? 'uber_csv_credits'
      : (summary.statementTollExpense ?? summary.totalRefundsExpenses) > 0.005
        ? 'trip_toll_expense'
        : 'no_platform_tolls');

  const credits =
    summary.platform === 'Uber'
      ? (summary.uberTollCredits ?? summary.platformTollCredits ?? summary.tollReimbursements ?? 0)
      : (summary.platformTollCredits ?? summary.tollReimbursements ?? 0);
  const expense = summary.statementTollExpense ?? summary.totalRefundsExpenses ?? 0;

  if (story === 'no_platform_tolls') {
    return (
      <div className="px-4 py-3 space-y-2">
        <div className="flex items-start gap-1">
          <p className="text-sm text-slate-500 dark:text-slate-400 leading-snug">
            No platform toll credits in earnings. Fleet toll P&amp;L is in Toll Recon.
          </p>
          <StatementTooltipIcon content={STATEMENT_HELP.noPlatformTolls} />
        </div>
        {onOpenTollRecon && (
          <button
            type="button"
            onClick={onOpenTollRecon}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
          >
            Open Toll Recon
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  if (story === 'uber_csv_credits' || (summary.platform === 'Uber' && credits > 0.005)) {
    return (
      <div>
        <SectionHeader
          title="Uber toll credits (from statement CSV)"
          icon={Receipt}
          expanded={expanded}
          onToggle={onToggle}
          total={credits}
          tooltipContent={STATEMENT_HELP.uberTollCredits}
        />
        {expanded && (
          <div className="px-4 pb-3 space-y-2">
            <LineItem
              label="Refunds:Toll credits"
              amount={credits}
              indent
              tooltipContent={STATEMENT_HELP.uberTollCredits}
            />
            {linkedTagSpend != null && (
              <p className="pl-6 text-xs text-slate-500 dark:text-slate-400 leading-snug">
                Fleet tag spend on Uber-linked crossings this week:{' '}
                <span className="font-medium tabular-nums text-slate-700 dark:text-slate-300">
                  {formatCurrency(linkedTagSpend)}
                </span>
                <span className="ml-1 inline-flex align-middle">
                  <StatementTooltipIcon content={STATEMENT_HELP.fleetTagSpendLinked} />
                </span>
              </p>
            )}
            {onOpenTollRecon && (
              <button
                type="button"
                onClick={onOpenTollRecon}
                className="ml-6 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
              >
                Open Toll Recon
                <ExternalLink className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // trip_toll_expense
  return (
    <div>
      <SectionHeader
        title="Statement toll expense"
        icon={Receipt}
        expanded={expanded}
        onToggle={onToggle}
        total={expense}
        isExpense
        tooltipContent={STATEMENT_HELP.tripTollExpense}
      />
      {expanded && (
        <div className="px-4 pb-3">
          <LineItem
            label="Trip toll expense"
            amount={expense}
            isExpense
            indent
            tooltipContent={STATEMENT_HELP.statementTollExpense}
          />
          {onOpenTollRecon && (
            <button
              type="button"
              onClick={onOpenTollRecon}
              className="mt-2 ml-6 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              Open Toll Recon
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function StatementSummaryCard({
  summary,
  className,
  defaultExpanded = true,
  showUberDriverScopePayoutNote = false,
  linkedTagSpend,
  onOpenTollRecon,
}: StatementSummaryCardProps) {
  const [earningsExpanded, setEarningsExpanded] = useState(defaultExpanded);
  const [tollExpanded, setTollExpanded] = useState(defaultExpanded);
  const [adjustmentsExpanded, setAdjustmentsExpanded] = useState(defaultExpanded);
  const [payoutExpanded, setPayoutExpanded] = useState(defaultExpanded);

  const config = PLATFORM_CONFIG[summary.platform];
  const Icon = config.icon;
  const statementExpense = summary.statementTollExpense ?? summary.totalRefundsExpenses ?? 0;
  const netPeriod = summary.totalEarnings - statementExpense + summary.periodAdjustments;

  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden',
        className,
      )}
    >
      <div className={cn('px-4 py-3 border-b border-slate-200 dark:border-slate-700', config.bgColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn('h-5 w-5', config.color)} />
            <h3 className={cn('font-semibold', config.color)}>{config.label}</h3>
            {summary.tripCount !== undefined && summary.tripCount > 0 && (
              <span className="text-xs text-slate-500 bg-white/50 px-2 py-0.5 rounded-full">
                {summary.tripCount} trips
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                summary.sourceType === 'csv_import'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-purple-100 text-purple-700',
              )}
            >
              {summary.sourceType === 'csv_import' ? (
                <span className="flex items-center gap-1">
                  <FileSpreadsheet className="h-3 w-3" />
                  CSV Import
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <Calculator className="h-3 w-3" />
                  Computed
                </span>
              )}
            </span>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {summary.periodStart} — {summary.periodEnd}
        </p>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        <div>
          <SectionHeader
            title="Period Net Earnings"
            icon={TrendingUp}
            expanded={earningsExpanded}
            onToggle={() => setEarningsExpanded(!earningsExpanded)}
            total={summary.totalEarnings}
            tooltipContent={STATEMENT_HELP.periodNetEarnings}
          />
          {earningsExpanded && (
            <div className="px-4 pb-3">
              <LineItem label="Net Fare" amount={summary.netFare} indent tooltipContent={STATEMENT_HELP.netFare} />
              <LineItem
                label="Promotions"
                amount={summary.promotions}
                indent
                tooltipContent={STATEMENT_HELP.promotions}
              />
              <LineItem label="Tips" amount={summary.tips} indent tooltipContent={STATEMENT_HELP.tips} />
              <div className="border-t border-slate-100 dark:border-slate-800 mt-2 pt-2">
                <TotalLineRow
                  label="Total Earnings"
                  amount={summary.totalEarnings}
                  tooltipContent={STATEMENT_HELP.totalEarnings}
                />
              </div>
            </div>
          )}
        </div>

        <TollStorySection
          summary={summary}
          linkedTagSpend={linkedTagSpend}
          onOpenTollRecon={onOpenTollRecon}
          expanded={tollExpanded}
          onToggle={() => setTollExpanded(!tollExpanded)}
        />

        <div>
          <SectionHeader
            title="Adjustments"
            icon={Receipt}
            expanded={adjustmentsExpanded}
            onToggle={() => setAdjustmentsExpanded(!adjustmentsExpanded)}
            total={summary.periodAdjustments}
            tooltipContent={STATEMENT_HELP.adjustments}
          />
          {adjustmentsExpanded && (
            <div className="px-4 pb-3">
              <LineItem
                label="Period Adjustments"
                amount={summary.periodAdjustments}
                indent
                tooltipContent={STATEMENT_HELP.periodAdjustments}
              />
            </div>
          )}
        </div>

        <div>
          <SectionHeader
            title="Payout"
            icon={Wallet}
            expanded={payoutExpanded}
            onToggle={() => setPayoutExpanded(!payoutExpanded)}
            total={summary.totalPayout}
            tooltipContent={STATEMENT_HELP.payout}
          />
          {payoutExpanded && (
            <div className="px-4 pb-3">
              {showUberDriverScopePayoutNote && summary.platform === 'Uber' && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3 leading-snug">
                  Cash and bank totals come from import batch rows; they may reflect fleet-level payouts when
                  the ledger does not split org payout by driver.
                </p>
              )}
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={cn(
                    'text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-medium',
                    summary.payoutObserved
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800',
                  )}
                >
                  {summary.payoutObserved ? 'Observed payout' : 'Derived payout'}
                </span>
                <StatementTooltipIcon
                  content={
                    summary.platform === 'Uber'
                      ? `${STATEMENT_HELP.payoutObserved} Uber payouts come from payments_driver / organization import.`
                      : `${STATEMENT_HELP.payoutObserved} Roam derived plug is not a bank feed.`
                  }
                />
              </div>
              <LineItem
                label="Cash Collected"
                amount={summary.cashCollected}
                indent
                tooltipContent={STATEMENT_HELP.cashCollected}
              />
              <LineItem
                label="Transferred to Bank"
                amount={summary.bankTransfer}
                indent
                tooltipContent={STATEMENT_HELP.bankTransfer}
              />
              <div className="border-t border-slate-100 dark:border-slate-800 mt-2 pt-2">
                <TotalLineRow
                  label="Total Payout"
                  amount={summary.totalPayout}
                  tooltipContent={STATEMENT_HELP.totalPayout}
                />
              </div>
              {Math.abs(summary.payoutReconciliationGap ?? 0) >= 0.01 && (
                <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 dark:border-amber-800 dark:bg-amber-950/40">
                  <LineItem
                    label="Payout vs earnings gap"
                    amount={summary.payoutReconciliationGap}
                    tooltipContent={STATEMENT_HELP.payoutReconciliation}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Net Period Earnings</span>
            <StatementTooltipIcon content={STATEMENT_HELP.netPeriodEarnings} />
          </div>
          <span
            className={cn(
              'text-lg font-bold tabular-nums shrink-0',
              netPeriod >= 0 ? 'text-emerald-600' : 'text-red-600',
            )}
          >
            {formatCurrency(netPeriod)}
          </span>
        </div>
      </div>
    </div>
  );
}

export type { FleetTollSnapshot };
