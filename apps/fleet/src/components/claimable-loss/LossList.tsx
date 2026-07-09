import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import {
  AlertCircle,
  ArrowRight,
  Clock,
  Info,
  MoreHorizontal,
  Undo2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Claim, FinancialTransaction, Trip } from '../../types/data';
import { MatchResult, TollFinancials } from '../../utils/tollReconciliation';
import { calculateDaysRemaining } from '../../utils/timeUtils';
import { PlatformSourceBadge } from '../toll-tags/reconciliation/PlatformSourceBadge';

export type TollRefundSourceKind = 'trip_match' | 'unlinked_refund' | 'dispute_refund' | 'mixed';

export function getTollRefundSource(
  transaction: FinancialTransaction,
  claim?: Claim | null,
): TollRefundSourceKind {
  const hasUnlinked = !!(transaction.unlinkedSourceTripId || claim?.unlinkedTripId);
  const hasDispute = !!claim?.disputeRefundId;
  if (hasUnlinked && hasDispute) return 'mixed';
  if (hasUnlinked) return 'unlinked_refund';
  if (hasDispute) return 'dispute_refund';
  return 'trip_match';
}

export function refundSourceLabel(kind: TollRefundSourceKind): string {
  switch (kind) {
    case 'unlinked_refund':
      return 'Unlinked Refund';
    case 'dispute_refund':
      return 'Dispute Refund';
    case 'mixed':
      return 'Mixed Credits';
    default:
      return 'Trip Match';
  }
}

export interface LossItem {
  transaction: FinancialTransaction;
  match: MatchResult;
  claim?: Claim | null;
  financials: TollFinancials;
}

interface LossListProps {
  losses: LossItem[];
  isLoading?: boolean;
  onSelectLoss: (item: LossItem) => void;
  onReverse?: (item: LossItem) => void;
  onBulkReverse?: (items: LossItem[]) => void;
  onUndoUnlinkedApply?: (tripId: string) => Promise<void> | void;
  busyUnlinkedTripId?: string | null;
}

export function LossList({
  losses,
  isLoading,
  onSelectLoss,
  onReverse,
  onBulkReverse,
  onUndoUnlinkedApply,
  busyUnlinkedTripId,
}: LossListProps) {
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    setSelectedIds(new Set());
  }, [losses]);

  const toggleSelectAll = () => {
    if (selectedIds.size === losses.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(losses.map((l) => l.transaction.id)));
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkAction = () => {
    if (!onBulkReverse) return;
    onBulkReverse(losses.filter((l) => selectedIds.has(l.transaction.id)));
    setSelectedIds(new Set());
  };

  const canReverse = (item: LossItem) => {
    const tx = item.transaction;
    const claim = item.claim;
    return !tx.unlinkedSourceTripId && !claim?.unlinkedTripId;
  };

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Analyzing claims...</div>;
  }

  if (losses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border rounded-lg border-dashed bg-slate-50">
        <div className="bg-orange-100 p-3 rounded-full mb-4">
          <AlertCircle className="h-6 w-6 text-orange-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No claimable losses found</h3>
        <p className="text-slate-500 text-sm mt-1">Great job! All active trips appear to be fully reimbursed.</p>
      </div>
    );
  }

  return (
    <div className="border rounded-md bg-white shadow-sm">
      <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-slate-900">
            Underpaid Trips{' '}
            <span className="ml-2 bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full text-xs">{losses.length}</span>
          </h3>
          <p className="text-sm text-slate-500">Tolls incurred during a trip that were not fully refunded.</p>
        </div>
        <div className="flex items-center gap-4">
          {selectedIds.size > 0 && onBulkReverse && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500 font-medium">{selectedIds.size} selected</span>
              <Button
                size="sm"
                variant="outline"
                onClick={handleBulkAction}
                className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200"
              >
                <Undo2 className="mr-2 h-4 w-4" />
                Reverse
              </Button>
            </div>
          )}
          <div className="text-sm font-medium text-slate-600">
            Total Potential Claim:{' '}
            <span className="text-orange-600 font-bold ml-1">
              ${losses.reduce((sum, item) => sum + item.financials.netLoss, 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[40px]">
              <Checkbox
                checked={losses.length > 0 && selectedIds.size === losses.length}
                onCheckedChange={toggleSelectAll}
                aria-label="Select all"
              />
            </TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Toll Description</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Refund Source</TableHead>
            <TableHead>Trip Ref</TableHead>
            <TableHead className="text-right">Toll Cost</TableHead>
            <TableHead className="text-right">Credits Received</TableHead>
            <TableHead className="text-right">Net Loss</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {losses.map((item) => {
            const { transaction, match, claim, financials } = item;
            const trip = match.trip;
            const sourceKind = getTollRefundSource(transaction, claim);
            const creditsReceived = financials.totalRecovered;
            const { daysRemaining, status } = calculateDaysRemaining(transaction.date);
            const unlinkedTripId = claim?.unlinkedTripId || transaction.unlinkedSourceTripId;

            const expiry =
              status === 'expired'
                ? { color: 'text-red-600 font-bold', icon: <AlertCircle className="h-3 w-3" />, text: 'Expired' }
                : daysRemaining <= 2
                  ? { color: 'text-rose-600 font-bold animate-pulse', icon: <Clock className="h-3 w-3" />, text: `${daysRemaining} days left` }
                  : daysRemaining <= 4
                    ? { color: 'text-orange-600 font-bold', icon: <Clock className="h-3 w-3" />, text: `${daysRemaining} days left` }
                    : { color: 'text-emerald-600 font-medium', icon: <Clock className="h-3 w-3" />, text: `${daysRemaining} days left` };

            return (
              <TableRow key={transaction.id} data-state={selectedIds.has(transaction.id) ? 'selected' : undefined}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.has(transaction.id)}
                    onCheckedChange={() => toggleSelect(transaction.id)}
                    aria-label="Select row"
                  />
                </TableCell>
                <TableCell className="font-medium text-slate-700">
                  {new Date(transaction.date).toLocaleDateString()}
                  <div className="text-xs text-slate-400">{transaction.time}</div>
                  <div className={`mt-1 text-xs flex items-center gap-1 ${expiry.color}`}>
                    {expiry.icon}
                    {expiry.text}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{transaction.description}</div>
                  <div className="text-xs text-slate-500 capitalize">{transaction.category}</div>
                </TableCell>
                <TableCell>
                  <PlatformSourceBadge
                    platform={trip.platform}
                    refundPlatform={transaction.unlinkedSourcePlatform || claim?.unlinkedSourcePlatform}
                    size="sm"
                  />
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      sourceKind === 'unlinked_refund'
                        ? 'bg-orange-50 text-orange-700 border-orange-200 text-[10px]'
                        : sourceKind === 'dispute_refund'
                          ? 'bg-violet-50 text-violet-700 border-violet-200 text-[10px]'
                          : 'bg-slate-50 text-slate-600 border-slate-200 text-[10px]'
                    }
                  >
                    {refundSourceLabel(sourceKind)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col text-xs">
                    <span className="font-mono text-slate-600">
                      {trip.pickupLocation?.split(',')[0] || 'Unknown Origin'}
                      <span className="mx-1">→</span>
                      {trip.dropoffLocation?.split(',')[0] || 'Unknown Dest'}
                    </span>
                    <span className="text-slate-400 mt-0.5">
                      {new Date(trip.requestTime || trip.date).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-slate-600">${financials.cost.toFixed(2)}</TableCell>
                <TableCell className="text-right text-emerald-600">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 cursor-help">
                          ${creditsReceived.toFixed(2)}
                          <Info className="h-3 w-3 opacity-50" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="space-y-1 text-xs">
                          <div className="font-semibold">Credits breakdown</div>
                          <div className="flex justify-between gap-4">
                            <span>Trip refund:</span>
                            <span>${financials.platformRefund.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-4">
                            <span>Applied credits:</span>
                            <span>${financials.creditsApplied.toFixed(2)}</span>
                          </div>
                          {financials.disputeRefund > 0 && (
                            <div className="flex justify-between gap-4">
                              <span>Dispute:</span>
                              <span>${financials.disputeRefund.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200 font-bold">
                    -${financials.netLoss.toFixed(2)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-2">
                        Actions <MoreHorizontal className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={(e) => {
                          e.preventDefault();
                          onSelectLoss(item);
                        }}
                      >
                        <ArrowRight className="mr-2 h-4 w-4" />
                        View Match
                      </DropdownMenuItem>
                      {unlinkedTripId && onUndoUnlinkedApply && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onUndoUnlinkedApply(unlinkedTripId)}
                            disabled={busyUnlinkedTripId === unlinkedTripId}
                            className="text-orange-700 focus:text-orange-800 focus:bg-orange-50"
                          >
                            <Undo2 className="mr-2 h-4 w-4" />
                            Undo apply in History
                          </DropdownMenuItem>
                        </>
                      )}
                      {onReverse && canReverse(item) && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onReverse(item)}
                            className="text-orange-600 focus:text-orange-700 focus:bg-orange-50"
                          >
                            <Undo2 className="mr-2 h-4 w-4" />
                            Reverse
                          </DropdownMenuItem>
                        </>
                      )}
                      {onReverse && !canReverse(item) && !unlinkedTripId && (
                        <DropdownMenuLabel className="text-xs text-slate-400 font-normal">
                          Reverse blocked — use Undo apply
                        </DropdownMenuLabel>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
