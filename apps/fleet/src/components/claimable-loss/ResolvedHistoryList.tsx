import React, { useState, useMemo } from 'react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "../ui/table";
import { Badge } from "../ui/badge";
import { CheckCircle2, History, Trash2, MoreHorizontal, FileText, UserMinus } from "lucide-react";
import { Claim, DisputeRefund, FinancialTransaction } from "../../types/data";
import { toast } from "sonner@2.0.3";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { formatClaimPeriodLabel } from "../../utils/tollWeekPeriod";
import { isUnlinkedApplySplitState } from "../../utils/unlinkedShortfallEligibility";
import { UndoApplyToUnderpaidDialog } from "../toll-tags/reconciliation/UndoApplyToUnderpaidDialog";
import type { Trip } from "../../types/data";
import { PlatformSourceBadge } from "../toll-tags/reconciliation/PlatformSourceBadge";
import {
  disputePlatformByClaimId,
  getClaimCategoryChipClass,
  getClaimCategoryLabel,
  getClaimLocationDisplay,
  getClaimPlatformDisplay,
} from "../../utils/claimHistoryDisplay";

/** Period label from toll-first anchor (shared with wizard period filter). */
export function getClaimPeriodLabel(
  claim: Claim,
  toll?: Pick<FinancialTransaction, 'date'> | null,
): string {
  const tollDateById =
    claim.transactionId && toll?.date
      ? new Map([[claim.transactionId, toll.date]])
      : undefined;
  return formatClaimPeriodLabel(claim, tollDateById);
}

interface ResolutionStyle {
  badgeClass: string;
  textClass: string;
}

const getResolutionStyle = (reason?: string): ResolutionStyle => {
  switch (reason) {
    case 'Reimbursed':
      return {
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
        textClass: "text-emerald-600"
      };
    case 'Charge Driver':
      return {
        badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
        textClass: "text-orange-600"
      };
    case 'Write Off':
      return {
        badgeClass: "bg-blue-50 text-blue-700 border-blue-200",
        textClass: "text-blue-600"
      };
    default:
      return {
        badgeClass: "bg-slate-50 text-slate-700 border-slate-200",
        textClass: "text-slate-500"
      };
  }
};

interface ResolvedHistoryListProps {
  claims: Claim[];
  isLoading?: boolean;
  getDriverName?: (id: string) => string;
  onDelete?: (ids: string[]) => void;
  onUpdateStatus?: (claim: Claim, newReason: 'Charge Driver' | 'Write Off' | 'Reimbursed') => void;
  /** Opens the admin detail overlay for a row. */
  onSelectClaim?: (claim: Claim) => void;
  /** Linked trips — used to detect split undo (trip pending, claim still Reimbursed). */
  trips?: Trip[];
  /** Toll ledger rows keyed by id — platform + category context. */
  tollById?: ReadonlyMap<string, FinancialTransaction>;
  /** Dispute refunds — platform fallback when claim.platform / trip link is missing. */
  disputeRefunds?: DisputeRefund[];
  /** Undo apply from claim row — passes the linked unlinked trip id. */
  onUndoUnlinkedApply?: (tripId: string) => Promise<void> | void;
  busyUnlinkedTripId?: string | null;
}

export function ResolvedHistoryList({
  claims,
  isLoading,
  getDriverName,
  onDelete,
  onUpdateStatus,
  onSelectClaim,
  trips = [],
  tollById,
  disputeRefunds = [],
  onUndoUnlinkedApply,
  busyUnlinkedTripId,
}: ResolvedHistoryListProps) {
  const tripById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);
  const disputeById = useMemo(
    () => new Map((disputeRefunds || []).filter((r) => r?.id).map((r) => [r.id, r])),
    [disputeRefunds],
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  if (isLoading) {
    return <div className="p-8 text-center text-slate-500">Loading history...</div>;
  }

  if (claims.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 border rounded-lg border-dashed bg-slate-50">
        <div className="bg-emerald-50 p-3 rounded-full mb-4">
          <History className="h-6 w-6 text-emerald-400" />
        </div>
        <h3 className="text-lg font-medium text-slate-900">No resolved claims</h3>
        <p className="text-slate-500 text-sm mt-1">Claims that are successfully reimbursed or written off will appear here.</p>
      </div>
    );
  }

  const toggleSelectAll = () => {
      if (selectedIds.size === claims.length) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(claims.map(c => c.id)));
      }
  };

  const toggleSelect = (id: string) => {
      const newSelected = new Set(selectedIds);
      if (newSelected.has(id)) {
          newSelected.delete(id);
      } else {
          newSelected.add(id);
      }
      setSelectedIds(newSelected);
  };

  return (
    <div className="space-y-6">
      <div className="border rounded-md bg-white shadow-sm">
      <div className="p-4 border-b bg-slate-50/50 flex justify-between items-center min-h-[72px]">
        <div>
            <h3 className="font-semibold text-slate-900">Resolved History</h3>
            <p className="text-sm text-slate-500">History of closed claims and reimbursements.</p>
        </div>
        
        {selectedIds.size > 0 ? (
            <div className="flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200">
                 <span className="text-sm text-slate-500 mr-2">{selectedIds.size} selected</span>
                 <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => {
                        const ids = Array.from(selectedIds);
                        const blocked = ids.filter((id) => {
                          const c = claims.find((x) => x.id === id);
                          return !!c?.unlinkedTripId;
                        });
                        if (blocked.length > 0) {
                          toast.error('Use Undo Apply instead of delete', {
                            description: `${blocked.length} selected claim(s) are linked to an unlinked refund apply.`,
                          });
                          return;
                        }
                        onDelete?.(ids);
                        setSelectedIds(new Set());
                    }}
                    className="gap-2 h-8"
                 >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Selected
                 </Button>
            </div>
        ) : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
                <Checkbox 
                    checked={claims.length > 0 && selectedIds.size === claims.length}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                />
            </TableHead>
            <TableHead>Date Resolved</TableHead>
            <TableHead>Period</TableHead>
            <TableHead>Driver</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Status</TableHead>
            {onUndoUnlinkedApply && <TableHead className="text-right w-[120px]">Action</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {claims.map((claim) => {
            const styles = getResolutionStyle(claim.resolutionReason);
            const toll = claim.transactionId ? tollById?.get(claim.transactionId) : undefined;
            const platformDisplay = getClaimPlatformDisplay(claim, toll, tripById, {
              disputePlatform: disputePlatformByClaimId(claim, disputeById),
            });
            const category = getClaimCategoryLabel(claim, toll);
            const linkedTrip = claim.unlinkedTripId ? tripById.get(claim.unlinkedTripId) : undefined;
            const location = getClaimLocationDisplay(claim, toll, tripById);
            const splitApply = isUnlinkedApplySplitState(claim, linkedTrip);
            const staleUnlinkedApply =
              !!claim.unlinkedTripId &&
              claim.status === 'Resolved' &&
              claim.resolutionReason === 'Reimbursed';
            const showUndo = !!onUndoUnlinkedApply && claim.unlinkedTripId && (splitApply || staleUnlinkedApply);
            return (
              <TableRow
                key={claim.id}
                className={`${selectedIds.has(claim.id) ? "bg-slate-50/50" : ""} ${onSelectClaim ? "cursor-pointer hover:bg-slate-50" : ""}`}
                onClick={() => onSelectClaim?.(claim)}
              >
                <TableCell onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    <Checkbox
                        checked={selectedIds.has(claim.id)}
                        onCheckedChange={() => toggleSelect(claim.id)}
                        aria-label={`Select claim`}
                    />
                </TableCell>
                <TableCell className="font-medium text-slate-700">
                  {new Date(claim.updatedAt || claim.createdAt).toLocaleDateString()}
                  <div className="text-xs text-slate-400">
                      {new Date(claim.updatedAt || claim.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </div>
                </TableCell>
                <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                  {getClaimPeriodLabel(claim, tollById?.get(claim.transactionId || ''))}
                </TableCell>
                <TableCell>
                    <div className="font-medium text-sm">
                      {getDriverName ? getDriverName(claim.driverId) : claim.driverId}
                    </div> 
                </TableCell>
                <TableCell>
                    <div className="text-sm truncate max-w-[200px]" title={location || undefined}>
                        {location || 'Unknown Location'}
                    </div>
                </TableCell>
                <TableCell>
                  {platformDisplay.platform || platformDisplay.tollPlatform ? (
                    <PlatformSourceBadge
                      platform={platformDisplay.platform}
                      tollPlatform={platformDisplay.tollPlatform}
                      refundPlatform={platformDisplay.refundPlatform}
                    />
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={`text-[10px] font-medium ${getClaimCategoryChipClass(category)}`}>
                    {category}
                  </Badge>
                </TableCell>
                <TableCell className={`text-right font-bold ${
                    claim.resolutionReason === 'Write Off' ? 'text-red-600' : 'text-emerald-600'
                }`}>
                  {claim.resolutionReason === 'Write Off' ? '-' : '+'}${(Number(claim.amount) || 0).toFixed(2)}
                </TableCell>
                <TableCell className="text-right" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                  <div className="flex flex-col items-end gap-1 group relative">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <div className="cursor-pointer hover:opacity-80 transition-opacity">
                            <Badge variant="outline" className={`${styles.badgeClass} gap-1`}>
                               <CheckCircle2 className="h-3 w-3" />
                               {claim.status}
                            </Badge>
                            {claim.resolutionReason && (
                                <div className={`flex items-center justify-end gap-1 mt-1 text-xs font-medium ${styles.textClass}`}>
                                    {claim.resolutionReason}
                                    <MoreHorizontal className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            )}
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Change Resolution</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                            onClick={() => onUpdateStatus?.(claim, 'Reimbursed')}
                            disabled={claim.resolutionReason === 'Reimbursed'}
                        >
                            <CheckCircle2 className="mr-2 h-4 w-4 text-emerald-600" />
                            Mark Reimbursed
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                            onClick={() => onUpdateStatus?.(claim, 'Charge Driver')}
                            disabled={claim.resolutionReason === 'Charge Driver'}
                        >
                            <UserMinus className="mr-2 h-4 w-4 text-orange-600" />
                            Charge Driver
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                            onClick={() => onUpdateStatus?.(claim, 'Write Off')}
                            disabled={claim.resolutionReason === 'Write Off'}
                        >
                            <FileText className="mr-2 h-4 w-4 text-blue-600" />
                            Write Off (Fleet)
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
                {onUndoUnlinkedApply && (
                  <TableCell className="text-right" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                    {showUndo && claim.unlinkedTripId ? (
                      <div className="flex flex-col items-end gap-1">
                        {splitApply && (
                          <span className="text-[10px] font-medium text-amber-700">Out of sync</span>
                        )}
                        <UndoApplyToUnderpaidDialog
                          summary={{
                            tripId: claim.unlinkedTripId,
                            tripRefund: Math.abs(linkedTrip?.tollCharges ?? 0),
                            tripPlatform: linkedTrip?.platform,
                            tollAmount: Math.abs(Number(claim.expectedAmount ?? claim.amount) || 0),
                            tollLocation: claim.pickup || claim.subject,
                            priorClaimStatus: claim.preUnlinkedStatus,
                            priorResolutionReason: claim.preUnlinkedResolutionReason,
                            willReinstateDriverCharge:
                              claim.preUnlinkedResolutionReason === 'Charge Driver',
                          }}
                          onConfirm={() => onUndoUnlinkedApply(claim.unlinkedTripId!)}
                          disabled={busyUnlinkedTripId === claim.unlinkedTripId}
                          triggerLabel="Undo apply"
                        />
                      </div>
                    ) : (
                      <span className="text-slate-300 text-xs">—</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
