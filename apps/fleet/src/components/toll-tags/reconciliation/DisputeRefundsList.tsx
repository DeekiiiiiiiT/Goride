import React, { useState, useMemo, useEffect } from 'react';
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { Loader2, ShieldCheck, Copy, Check, Unlink, ChevronDown, Sparkles, CalendarRange } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { groupDisputeRefundsByWeek } from "../../../utils/tollWeekPeriod";
import { DisputeRefund } from "../../../types/data";
import { formatInFleetTz, useFleetTimezone } from '../../../utils/timezoneDisplay';
import { api } from '../../../services/api';
import { toast } from 'sonner@2.0.3';
import { DisputeMatchModal } from "./DisputeMatchModal";
import { DisputeRefundDetailDialog } from "./DisputeRefundDetailDialog";

export type DisputeMatchEvent =
  | { type: 'match'; refundId: string; tollId: string }
  | { type: 'unmatch'; refundId: string };

interface DisputeRefundsListProps {
  refunds: DisputeRefund[];
  onMatchComplete: (event: DisputeMatchEvent) => void;
}

export function DisputeRefundsList({ refunds, onMatchComplete }: DisputeRefundsListProps) {
  const fleetTz = useFleetTimezone();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [unmatchingId, setUnmatchingId] = useState<string | null>(null);
  const [visibleWeekCount, setVisibleWeekCount] = useState(12);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unmatched' | 'matched'>('all');
  // Match overlay (smart suggestions + manual search live inside the modal)
  const [matchModalRefund, setMatchModalRefund] = useState<DisputeRefund | null>(null);
  const [detailRefund, setDetailRefund] = useState<DisputeRefund | null>(null);

  const isMatched = (r: DisputeRefund) =>
    r.status === 'matched' || r.status === 'auto_resolved';

  const handleRowClick = (refund: DisputeRefund) => {
    if (isMatched(refund)) {
      setDetailRefund(refund);
    } else {
      setMatchModalRefund(refund);
    }
  };

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return refunds;
    return refunds.filter(r => r.status === statusFilter);
  }, [refunds, statusFilter]);

  const weekGroups = useMemo(() => groupDisputeRefundsByWeek(filtered, fleetTz), [filtered, fleetTz]);
  const visibleWeekGroups = weekGroups.slice(0, visibleWeekCount);

  useEffect(() => {
    setVisibleWeekCount(12);
  }, [statusFilter]);

  const unmatchedCount = refunds.filter(r => r.status === 'unmatched').length;
  const matchedCount = refunds.filter(r => r.status === 'matched' || r.status === 'auto_resolved').length;
  const totalAmount = refunds.reduce((s, r) => s + (r.amount || 0), 0);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleUnmatch = async (refundId: string) => {
    setUnmatchingId(refundId);
    try {
      await api.unmatchDisputeRefund(refundId);
      toast.success('Refund unlinked from toll transaction');
      onMatchComplete({ type: 'unmatch', refundId });
    } catch (err: any) {
      console.error('[DisputeRefunds] Unmatch failed:', err);
      toast.error(`Unmatch failed: ${err.message}`);
    } finally {
      setUnmatchingId(null);
    }
  };

  // Empty state
  if (refunds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <ShieldCheck className="h-12 w-12 text-teal-300 mb-4" />
        <h3 className="text-base font-medium text-slate-700">No dispute refunds imported yet</h3>
        <p className="text-sm mt-1 max-w-md text-center">
          Import an Uber <code className="bg-slate-100 px-1 py-0.5 rounded text-xs">payments_transaction</code> CSV 
          to detect Support Adjustment refunds automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm text-slate-600">
          <ShieldCheck className="h-4 w-4 text-teal-500" />
          <span className="font-medium">{refunds.length} refund{refunds.length !== 1 ? 's' : ''}</span>
          <span className="text-slate-400">|</span>
          <span className="font-semibold text-emerald-600">${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        </div>

        <div className="flex gap-1 ml-auto">
          {(['all', 'unmatched', 'matched'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-all ${
                statusFilter === f
                  ? 'bg-teal-50 border-teal-300 text-teal-700'
                  : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
              }`}
            >
              {f === 'all' ? `All (${refunds.length})` : f === 'unmatched' ? `Unmatched (${unmatchedCount})` : `Matched (${matchedCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-md overflow-x-auto">
        <Table className="text-xs">
          <TableHeader>
            <TableRow className="[&>th]:py-2 [&>th]:px-3 [&>th]:text-[11px] [&>th]:font-semibold [&>th]:text-slate-500 [&>th]:uppercase [&>th]:tracking-wider">
              <TableHead>Date</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Support Case ID</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-sm text-slate-500">
                  No refunds match this filter.
                </TableCell>
              </TableRow>
            ) : (
              visibleWeekGroups.map((week) => {
                const matchedInWeek = week.items.filter(
                  (r) => r.status === 'matched' || r.status === 'auto_resolved'
                ).length;
                const fullyMatched = matchedInWeek === week.items.length;
                return (
                <TableRow key={week.key} className="border-0 hover:bg-transparent">
                  <TableCell colSpan={7} className="p-0 align-top">
                    <Collapsible defaultOpen className="group border-b border-slate-200 last:border-b-0">
                      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left bg-slate-50/80 dark:bg-slate-900/40 hover:bg-slate-100/90 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <CalendarRange className="h-4 w-4 text-slate-500 shrink-0" />
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{week.label}</span>
                          <span className="text-[10px] uppercase tracking-wide text-slate-500">Mon–Sun</span>
                          <Badge
                            className={
                              fullyMatched
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200 text-[11px]'
                                : 'bg-amber-100 text-amber-700 border-amber-200 text-[11px]'
                            }
                          >
                            {matchedInWeek} of {week.items.length} matched
                          </Badge>
                        </div>
                        <ChevronDown className="h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-0 group-data-[state=closed]:-rotate-90" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <table className="w-full text-xs caption-bottom">
                          <tbody className="[&_tr:last-child]:border-0">
                            {week.items.map((refund) => (
                              <React.Fragment key={refund.id}>
                                <TableRow
                                  className={`[&>td]:py-2 [&>td]:px-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 ${
                                    isMatched(refund) ? 'cursor-pointer' : ''
                                  }`}
                                  onClick={() => handleRowClick(refund)}
                                >
                                  <TableCell className="whitespace-nowrap text-slate-700">
                                    {formatInFleetTz(refund.date, fleetTz, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                                  </TableCell>
                                  <TableCell className="whitespace-nowrap font-medium text-slate-800">
                                    {refund.driverName || <span className="text-slate-400">Unknown</span>}
                                  </TableCell>
                                  <TableCell className="text-right font-semibold text-emerald-600 whitespace-nowrap">
                                    ${refund.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-1">
                                      <code className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 max-w-[120px] truncate" title={refund.supportCaseId}>
                                        {refund.supportCaseId.slice(0, 12)}...
                                      </code>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard(refund.supportCaseId, refund.id);
                                        }}
                                        className="text-slate-400 hover:text-slate-600 transition-colors"
                                        title="Copy full ID"
                                      >
                                        {copiedId === refund.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                                      </button>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant="outline" className="text-[10px] font-normal">{refund.platform}</Badge>
                                  </TableCell>
                                  <TableCell>
                                    {refund.status === 'unmatched' ? (
                                      <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">Unmatched</Badge>
                                    ) : refund.resolvedBy === 'system-auto' ? (
                                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">Auto-Matched</Badge>
                                    ) : (
                                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Matched</Badge>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-1">
                                      {refund.status === 'unmatched' ? (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 px-2 text-xs text-teal-600 hover:text-teal-700 hover:bg-teal-50"
                                          onClick={() => setMatchModalRefund(refund)}
                                        >
                                          <Sparkles className="h-3 w-3 mr-1" /> Match
                                        </Button>
                                      ) : (
                                        <>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs text-slate-600 hover:text-indigo-700 hover:bg-indigo-50"
                                            onClick={() => setDetailRefund(refund)}
                                          >
                                            View
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50"
                                            onClick={() => handleUnmatch(refund.id)}
                                            disabled={unmatchingId === refund.id}
                                          >
                                            {unmatchingId === refund.id ? (
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                              <><Unlink className="h-3 w-3 mr-1" /> Unlink</>
                                            )}
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>

                              </React.Fragment>
                            ))}
                          </tbody>
                        </table>
                      </CollapsibleContent>
                    </Collapsible>
                  </TableCell>
                </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && visibleWeekCount < weekGroups.length && (
        <div className="flex items-center justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVisibleWeekCount((prev) => prev + 8)}
            className="text-slate-600 hover:text-slate-900"
          >
            <ChevronDown className="h-4 w-4 mr-1" />
            Show more weeks ({visibleWeekCount} of {weekGroups.length})
          </Button>
        </div>
      )}

      <DisputeMatchModal
        open={!!matchModalRefund}
        onOpenChange={(o) => { if (!o) setMatchModalRefund(null); }}
        refund={matchModalRefund}
        onMatched={(tollId) => {
          if (!matchModalRefund) return;
          onMatchComplete({ type: 'match', refundId: matchModalRefund.id, tollId });
        }}
      />

      <DisputeRefundDetailDialog
        open={!!detailRefund}
        onOpenChange={(o) => { if (!o) setDetailRefund(null); }}
        refund={detailRefund}
        unmatching={!!detailRefund && unmatchingId === detailRefund.id}
        onUnmatch={async (refundId) => {
          await handleUnmatch(refundId);
          setDetailRefund(null);
        }}
      />
    </div>
  );
}