import { HelpCircle, DollarSign, TrendingUp, Wallet, TrendingDown, AlertTriangle } from "lucide-react";
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
}

/**
 * The 5-card financial snapshot — one balancing story: Spend − Reimbursed −
 * Charged = Net Loss. Shared by PeriodLandingPage (all-time totals, across
 * every period) and ReconciliationWizard (this period's totals only), so the
 * same numbers always render identically regardless of which scope is
 * feeding them.
 */
function PlatformSplit({ breakdown, className }: { breakdown?: PlatformAmountBreakdown; className?: string }) {
  if (!breakdown) return null;
  const lines = platformBreakdownLines(breakdown);
  if (lines.length === 0) return null;
  return (
    <div className={`mt-1.5 space-y-0.5 ${className || ''}`}>
      {lines.map(({ label, amount }) => (
        <div key={label} className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
          <span>{label}</span>
          <span className="font-medium text-slate-700 tabular-nums">${amount.toFixed(2)}</span>
        </div>
      ))}
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
}: TollFinancialOverviewCardsProps) {
  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-2 h-full bg-slate-400" />
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-medium text-slate-600 uppercase tracking-wider">Toll Spend</h3>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-[200px] text-xs">Total tolls the fleet paid (tag charges, cash, and geofence-detected). This is the money that went out.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">${tollSpend.toFixed(2)}</div>
              <div className="text-xs text-slate-500 mt-1">Money out</div>
              <PlatformSplit breakdown={tollSpendByPlatform} />
            </div>
            <DollarSign className="h-5 w-5 text-slate-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-emerald-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-2 h-full bg-emerald-400" />
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-medium text-emerald-600 uppercase tracking-wider">
                  Reimbursed{reimbursedLabelSuffix || ''}
                </h3>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3.5 w-3.5 text-emerald-400 hover:text-emerald-600 transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-[200px] text-xs">Toll money the rideshare platform (Uber / InDrive / Roam) paid back on trips through the fare, plus matched Uber support adjustments.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">${reimbursedAmount.toFixed(2)}</div>
              <div className="text-xs text-slate-500 mt-1">
                Paid back on trips
                {scopedDisputeRefund > 0 && (
                  <span className="block text-teal-600 mt-0.5">
                    Incl. ${scopedDisputeRefund.toFixed(2)} from dispute refunds
                  </span>
                )}
              </div>
              <PlatformSplit breakdown={reimbursedByPlatform} />
            </div>
            <TrendingUp className="h-5 w-5 text-emerald-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-purple-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-2 h-full bg-purple-400" />
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-medium text-purple-600 uppercase tracking-wider">Charged to Drivers</h3>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3.5 w-3.5 text-purple-400 hover:text-purple-600 transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-[240px] text-xs">
                      Fleet recovery from resolved &quot;Charge Driver&quot; claims — including tag personal, deadhead, underpaid shortfalls, and cash personal (no reimbursement). Driver Financials → Expenses / Cash Wallet use posted wallet Toll Charge rows (requires charge sync ON for parity).
                    </p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">${chargedToDrivers.toFixed(2)}</div>
              <div className="text-xs text-slate-500 mt-1">Recovered from drivers</div>
            </div>
            <Wallet className="h-5 w-5 text-purple-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-rose-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-2 h-full bg-rose-400" />
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-medium text-rose-600 uppercase tracking-wider">Net Toll Loss</h3>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3.5 w-3.5 text-rose-400 hover:text-rose-600 transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-[200px] text-xs">What the fleet is actually out of pocket: Toll Spend − Reimbursed by Uber − Charged to Drivers.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">${netTollLoss.toFixed(2)}</div>
              <div className="text-xs text-slate-500 mt-1">Unrecovered toll cost</div>
            </div>
            <TrendingDown className="h-5 w-5 text-rose-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-amber-200 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-2 h-full bg-amber-400" />
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-xs font-medium text-amber-600 uppercase tracking-wider">Needs Review</h3>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-3.5 w-3.5 text-amber-400 hover:text-amber-600 transition-colors" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-[200px] text-xs">Open items still to sort across every step below.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-1">{needsReviewCount}</div>
              <div className="text-xs text-slate-500 mt-1">
                {tollsNeedingReviewCount} tolls · {refundsNeedingReviewCount} refunds
                {resolvedRefundsAmount > 0 && (
                  <span className="block text-emerald-600 mt-0.5">
                    ${resolvedRefundsAmount.toFixed(2)} resolved
                  </span>
                )}
              </div>
            </div>
            <AlertTriangle className="h-5 w-5 text-amber-400" />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
