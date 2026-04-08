import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Receipt,
  Wallet,
  FileSpreadsheet,
  Calculator,
  Car,
  Info,
} from 'lucide-react';
import { cn } from '../ui/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { StatementSummary, StatementPlatform } from '../../types/statementSummary';

/** Explanations match GET /ledger/statement-summary aggregation logic. */
export const STATEMENT_HELP = {
  periodNetEarnings:
    'Gross in-period earnings before tolls and payout split. Sum of all canonical ledger inflows in your date range for this platform: trip fares (fare_earning), promotions, and tips.',
  netFare:
    'Sum of net amounts on fare_earning events in the period. Each completed trip with a fare posts one row; InDrive uses net fare after service fee when that data exists on the trip.',
  promotions:
    'Sum of promotion ledger events in the period (e.g. Uber promo amounts from imported trip data).',
  tips:
    'Sum of tip ledger events in the period (e.g. Uber tips from imported trip data).',
  totalEarnings:
    'Net Fare + Promotions + Tips. This is the earnings subtotal before Refunds & Expenses.',
  refundsExpenses:
    'Toll-related costs and credits in the period, expressed as a single net expense figure for the statement.',
  tolls:
    'Total of toll_charge ledger events (absolute amounts). This is what was charged or attributed to tolls.',
  tollAdjustments:
    'Credits that reduce toll expense: toll_refund events, and for Uber, organization toll refunds (statement REFUNDS_TOLL) when present.',
  totalRefundsExpenses:
    'Net toll impact: Tolls minus Toll Adjustments. Shown as an expense in the statement flow.',
  adjustments:
    'Corrections that apply to this statement period (e.g. prior-period items).',
  periodAdjustments:
    'Reserved for future prior-period adjustment lines. Currently zero unless we add those events to the ledger.',
  payout:
    'How earnings are allocated between cash collected from passengers and amounts treated as bank/digital payout for this platform in the period.',
  cashCollected:
    'Uber: from payout_cash on the organization import when available. Roam/InDrive: sum of physical cash on cash fare trips (fare_earning with paymentMethod Cash, using metadata.cashCollected or the fare amount).',
  bankTransfer:
    'Uber: payout_bank from import when available. Other platforms: remainder so that Cash + Bank matches earnings after toll charges in the formula (Total Earnings − toll charges − Cash Collected, not below zero).',
  totalPayout:
    'Cash Collected + Transferred to Bank. Should align with how the platform paid out or how cash was handled for the period.',
  netPeriodEarnings:
    'Bottom line for the card: Total Earnings − Total Refunds & Expenses + Period Adjustments. This is what you keep after toll net expense, before interpreting cash vs bank in the Payout section.',
  combinedTotalEarnings:
    'Sum of each platform’s Total Earnings (Net Fare + Promotions + Tips) for the selected date range.',
  combinedTotalExpenses:
    'Sum of each platform’s Total Refunds & Expenses (net toll impact) for the selected date range.',
  combinedCashCollected:
    'Sum of each platform’s Cash Collected for the selected date range.',
  combinedBankTransfer:
    'Sum of each platform’s Transferred to Bank for the selected date range.',
} as const;

interface StatementSummaryCardProps {
  summary: StatementSummary;
  className?: string;
  defaultExpanded?: boolean;
}

const PLATFORM_CONFIG: Record<StatementPlatform, { 
  label: string; 
  color: string; 
  bgColor: string;
  icon: React.ElementType;
}> = {
  Uber: { 
    label: 'Uber', 
    color: 'text-slate-900', 
    bgColor: 'bg-slate-100',
    icon: Car
  },
  Roam: { 
    label: 'Roam', 
    color: 'text-amber-700', 
    bgColor: 'bg-amber-50',
    icon: Car
  },
  InDrive: { 
    label: 'InDrive', 
    color: 'text-emerald-700', 
    bgColor: 'bg-emerald-50',
    icon: Car
  },
};

function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'JMD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount).replace('JMD', '$');
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
  showSign = false 
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
    <span className={cn(
      'font-medium tabular-nums',
      isZero ? 'text-slate-400' : isNegative ? 'text-red-600' : 'text-emerald-600'
    )}>
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
          {total !== undefined && (
            <AmountDisplay amount={total} isExpense={isExpense} />
          )}
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
    <div
      className={cn(
        'flex items-center justify-between gap-2 py-1.5 text-sm',
        indent && 'pl-6',
      )}
    >
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

export function StatementSummaryCard({ 
  summary, 
  className,
  defaultExpanded = true 
}: StatementSummaryCardProps) {
  const [earningsExpanded, setEarningsExpanded] = useState(defaultExpanded);
  const [expensesExpanded, setExpensesExpanded] = useState(defaultExpanded);
  const [adjustmentsExpanded, setAdjustmentsExpanded] = useState(defaultExpanded);
  const [payoutExpanded, setPayoutExpanded] = useState(defaultExpanded);

  const config = PLATFORM_CONFIG[summary.platform];
  const Icon = config.icon;

  return (
    <div className={cn(
      'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden',
      className
    )}>
      {/* Header */}
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
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full',
              summary.sourceType === 'csv_import' 
                ? 'bg-blue-100 text-blue-700' 
                : 'bg-purple-100 text-purple-700'
            )}>
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

      {/* Content */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {/* Period Net Earnings */}
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
              <LineItem
                label="Net Fare"
                amount={summary.netFare}
                indent
                tooltipContent={STATEMENT_HELP.netFare}
              />
              <LineItem
                label="Promotions"
                amount={summary.promotions}
                indent
                tooltipContent={STATEMENT_HELP.promotions}
              />
              <LineItem
                label="Tips"
                amount={summary.tips}
                indent
                tooltipContent={STATEMENT_HELP.tips}
              />
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

        {/* Refunds & Expenses */}
        <div>
          <SectionHeader
            title="Refunds & Expenses"
            icon={TrendingDown}
            expanded={expensesExpanded}
            onToggle={() => setExpensesExpanded(!expensesExpanded)}
            total={summary.totalRefundsExpenses}
            isExpense
            tooltipContent={STATEMENT_HELP.refundsExpenses}
          />
          {expensesExpanded && (
            <div className="px-4 pb-3">
              <LineItem
                label="Tolls"
                amount={summary.tolls}
                isExpense
                indent
                tooltipContent={STATEMENT_HELP.tolls}
              />
              <LineItem
                label="Toll Adjustments"
                amount={summary.tollAdjustments}
                indent
                tooltipContent={STATEMENT_HELP.tollAdjustments}
              />
              <div className="border-t border-slate-100 dark:border-slate-800 mt-2 pt-2">
                <TotalLineRow
                  label="Total Refunds & Expenses"
                  amount={summary.totalRefundsExpenses}
                  isExpense
                  tooltipContent={STATEMENT_HELP.totalRefundsExpenses}
                />
              </div>
            </div>
          )}
        </div>

        {/* Adjustments */}
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

        {/* Payout */}
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
            </div>
          )}
        </div>
      </div>

      {/* Footer - Grand Total */}
      <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Net Period Earnings
            </span>
            <StatementTooltipIcon content={STATEMENT_HELP.netPeriodEarnings} />
          </div>
          <span
            className={cn(
              'text-lg font-bold tabular-nums shrink-0',
              summary.totalEarnings - summary.totalRefundsExpenses >= 0
                ? 'text-emerald-600'
                : 'text-red-600',
            )}
          >
            {formatCurrency(
              summary.totalEarnings - summary.totalRefundsExpenses + summary.periodAdjustments,
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
