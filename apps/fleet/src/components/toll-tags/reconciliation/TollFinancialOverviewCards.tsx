import type { ReactNode } from "react";
import { HelpCircle, DollarSign, TrendingUp, Wallet, TrendingDown, AlertTriangle, CheckCircle2, UserSearch, Banknote } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";
import { platformBreakdownLines, type PlatformAmountBreakdown } from "../../../utils/tollFinancialOverview";

export interface TollFinancialOverviewCardsProps {
  tollSpend: number;
  tollSpendByPlatform?: PlatformAmountBreakdown;
  reimbursedAmount: number;
  reimbursedByPlatform?: PlatformAmountBreakdown;
  /** e.g. " · Uber" when a platform filter is active — omitted on the all-time landing page. */
  reimbursedLabelSuffix?: string;
  scopedDisputeRefund: number;
  chargedToDrivers: number;
  netTollLoss: number;
  needsReviewCount: number;
  tollsNeedingReviewCount: number;
  refundsNeedingReviewCount: number;
  resolvedRefundsAmount: number;
  /** Landing page hides this card — Action Required banner covers it. Wizard keeps it. */
  showNeedsReviewCard?: boolean;
}

/**
 * The financial snapshot — one balancing story: Spend − Reimbursed −
 * Charged = Net Loss. Shared by PeriodLandingPage and ReconciliationWizard.
 * Visual language matched to Stitch "Toll Reconciliation - Premium Redesign".
 */
function PlatformSplit({ breakdown, className }: { breakdown?: PlatformAmountBreakdown; className?: string }) {
  if (!breakdown) return null;
  const lines = platformBreakdownLines(breakdown);
  if (lines.length === 0) return null;
  return (
    <div className={`mt-2 space-y-1 ${className || ''}`}>
      {lines.map(({ label, amount }) => (
        <div key={label} className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>{label}</span>
          <span className="font-medium text-slate-700 tabular-nums">${amount.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function GlassStatCard({
  children,
  accentClass,
  className = '',
}: {
  children: ReactNode;
  accentClass?: string;
  className?: string;
}) {
  return (
    <div
      className={`group rounded-2xl border border-indigo-100/60 bg-white/70 p-6 shadow-sm backdrop-blur-sm transition-shadow hover:shadow-md ${accentClass || ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function TollFinancialOverviewCards({
  tollSpend,
  tollSpendByPlatform,
  reimbursedAmount,
  reimbursedByPlatform,
  reimbursedLabelSuffix,
  scopedDisputeRefund,
  chargedToDrivers,
  netTollLoss,
  needsReviewCount,
  tollsNeedingReviewCount,
  refundsNeedingReviewCount,
  resolvedRefundsAmount,
  showNeedsReviewCard = true,
}: TollFinancialOverviewCardsProps) {
  const gridCols = showNeedsReviewCard
    ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5'
    : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <TooltipProvider>
      <div className={`grid gap-4 ${gridCols}`}>
        <GlassStatCard>
          <div className="mb-4 flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 transition-transform group-hover:scale-110">
              <Banknote className="h-5 w-5" aria-hidden />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Toll Spend</p>
            <Tooltip>
              <TooltipTrigger className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center -m-2">
                <HelpCircle className="h-3.5 w-3.5 text-slate-400 transition-colors hover:text-slate-600" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[200px] text-xs">Total tolls the fleet paid (tag charges, cash, and geofence-detected). This is the money that went out.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <h4 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">${tollSpend.toFixed(2)}</h4>
          <p className="mt-2 text-[11px] font-medium text-slate-500">Gross expenditure this period</p>
          <PlatformSplit breakdown={tollSpendByPlatform} />
        </GlassStatCard>

        <GlassStatCard accentClass="border-l-4 border-l-emerald-600">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 transition-transform group-hover:scale-110">
              <CheckCircle2 className="h-5 w-5" aria-hidden />
            </div>
            <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden />
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Reimbursed{reimbursedLabelSuffix || ''}
            </p>
            <Tooltip>
              <TooltipTrigger className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center -m-2">
                <HelpCircle className="h-3.5 w-3.5 text-emerald-400 transition-colors hover:text-emerald-600" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[220px] text-xs">
                  Platform money that offsets fleet Toll Spend (linked trips, open unlinked credits, expense logged, dispute matches). Cash washes stay under Needs Review → resolved — they are driver-paid, not fleet spend.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <h4 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">${reimbursedAmount.toFixed(2)}</h4>
          <p className="mt-2 text-[11px] font-medium text-slate-500">
            {scopedDisputeRefund > 0
              ? `Incl. $${scopedDisputeRefund.toFixed(2)} from dispute refunds`
              : 'Paid back on trips'}
          </p>
          <PlatformSplit breakdown={reimbursedByPlatform} />
        </GlassStatCard>

        <GlassStatCard accentClass="border-l-4 border-l-amber-700">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-800 transition-transform group-hover:scale-110">
              <UserSearch className="h-5 w-5" aria-hidden />
            </div>
            <Wallet className="h-4 w-4 text-amber-700" aria-hidden />
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Charged to Drivers</p>
            <Tooltip>
              <TooltipTrigger className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center -m-2">
                <HelpCircle className="h-3.5 w-3.5 text-amber-500 transition-colors hover:text-amber-700" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[240px] text-xs">
                  Fleet recovery from resolved &quot;Charge Driver&quot; claims — including tag personal, deadhead, underpaid shortfalls, and cash personal (no reimbursement). Driver Financials → Expenses / Cash Wallet use posted wallet Toll Charge rows (requires charge sync ON for parity).
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <h4 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">${chargedToDrivers.toFixed(2)}</h4>
          <p className="mt-2 text-[11px] font-medium text-slate-500">Successfully recovered assets</p>
        </GlassStatCard>

        <GlassStatCard accentClass="border-l-4 border-l-rose-600">
          <div className="mb-4 flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600 transition-transform group-hover:scale-110">
              <DollarSign className="h-5 w-5" aria-hidden />
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-600">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              Alert
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Net Toll Loss</p>
            <Tooltip>
              <TooltipTrigger className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center -m-2">
                <HelpCircle className="h-3.5 w-3.5 text-rose-400 transition-colors hover:text-rose-600" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[200px] text-xs">What the fleet is actually out of pocket: Toll Spend − Reimbursed by Uber − Charged to Drivers.</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <h4 className="mt-1 text-2xl font-bold tracking-tight text-rose-600 tabular-nums">${netTollLoss.toFixed(2)}</h4>
          <p className="mt-2 text-[11px] font-medium text-slate-500">Unrecovered toll leakage</p>
        </GlassStatCard>

        {showNeedsReviewCard && (
          <GlassStatCard accentClass="border-l-4 border-l-amber-500">
            <div className="mb-4 flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600 transition-transform group-hover:scale-110">
                <AlertTriangle className="h-5 w-5" aria-hidden />
              </div>
              <TrendingDown className="h-4 w-4 text-amber-500" aria-hidden />
            </div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Needs Review</p>
              <Tooltip>
                <TooltipTrigger className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center -m-2">
                  <HelpCircle className="h-3.5 w-3.5 text-amber-400 transition-colors hover:text-amber-600" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-[200px] text-xs">Open items still to sort across every step below.</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <h4 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{needsReviewCount}</h4>
            <p className="mt-2 text-[11px] font-medium text-slate-500">
              {tollsNeedingReviewCount} tolls · {refundsNeedingReviewCount} refunds
              {resolvedRefundsAmount > 0 && (
                <span className="mt-0.5 block text-emerald-600">
                  ${resolvedRefundsAmount.toFixed(2)} resolved
                </span>
              )}
            </p>
          </GlassStatCard>
        )}
      </div>
    </TooltipProvider>
  );
}
