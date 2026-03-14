import React, { useState, useMemo } from 'react';
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { Card, CardContent } from "../../ui/card";
import { Loader2, ShieldCheck, Copy, Check, LinkIcon, Unlink, Search, ChevronDown, Sparkles, ExternalLink } from "lucide-react";
import { DisputeRefund } from "../../../types/data";
import { formatInFleetTz, useFleetTimezone } from '../../../utils/timezoneDisplay';
import { api } from '../../../services/api';
import { toast } from 'sonner@2.0.3';

interface DisputeRefundsListProps {
  refunds: DisputeRefund[];
  onMatchComplete: () => void; // Trigger refresh after match/unmatch
}

interface SuggestionRow {
  tollId: string;
  tripId: string | null;
  tollAmount: number;
  uberRefund: number;
  variance: number;
  date: string;
  confidence: number;
  claimId: string | null;
  claimStatus: string | null;
}

export function DisputeRefundsList({ refunds, onMatchComplete }: DisputeRefundsListProps) {
  const fleetTz = useFleetTimezone();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedRefundId, setExpandedRefundId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [matchingId, setMatchingId] = useState<string | null>(null);
  const [unmatchingId, setUnmatchingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(25);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unmatched' | 'matched'>('all');

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return refunds;
    return refunds.filter(r => r.status === statusFilter);
  }, [refunds, statusFilter]);

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

  const loadSuggestions = async (refundId: string) => {
    if (expandedRefundId === refundId) {
      setExpandedRefundId(null);
      setSuggestions([]);
      return;
    }
    setExpandedRefundId(refundId);
    setLoadingSuggestions(true);
    try {
      const res = await api.getDisputeRefundSuggestions(refundId);
      setSuggestions(res.suggestions || []);
    } catch (err: any) {
      console.error('[DisputeRefunds] Failed to load suggestions:', err);
      toast.error('Failed to load match suggestions');
      setSuggestions([]);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleMatch = async (refundId: string, tollId: string, claimId?: string | null) => {
    setMatchingId(tollId);
    try {
      await api.matchDisputeRefund(refundId, tollId, claimId || undefined);
      toast.success('Refund matched to toll transaction');
      setExpandedRefundId(null);
      setSuggestions([]);
      onMatchComplete();
    } catch (err: any) {
      console.error('[DisputeRefunds] Match failed:', err);
      toast.error(`Match failed: ${err.message}`);
    } finally {
      setMatchingId(null);
    }
  };

  const handleUnmatch = async (refundId: string) => {
    setUnmatchingId(refundId);
    try {
      await api.unmatchDisputeRefund(refundId);
      toast.success('Refund unlinked from toll transaction');
      onMatchComplete();
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
            {filtered.slice(0, visibleCount).map(refund => (
              <React.Fragment key={refund.id}>
                <TableRow className="[&>td]:py-2 [&>td]:px-3 hover:bg-slate-50/50">
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
                        onClick={() => copyToClipboard(refund.supportCaseId, refund.id)}
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
                    ) : refund.status === 'matched' ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">Matched</Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px]">Auto-Resolved</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {refund.status === 'unmatched' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-teal-600 hover:text-teal-700 hover:bg-teal-50"
                          onClick={() => loadSuggestions(refund.id)}
                        >
                          {expandedRefundId === refund.id ? (
                            <><ChevronDown className="h-3 w-3 mr-1 rotate-180" /> Close</>
                          ) : (
                            <><Sparkles className="h-3 w-3 mr-1" /> Match</>
                          )}
                        </Button>
                      ) : (
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
                      )}
                    </div>
                  </TableCell>
                </TableRow>

                {/* Expanded suggestions panel */}
                {expandedRefundId === refund.id && (
                  <TableRow>
                    <TableCell colSpan={7} className="p-0 bg-teal-50/30">
                      <div className="px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-teal-700">
                          <Search className="h-3.5 w-3.5" />
                          Smart Match Suggestions for ${refund.amount.toFixed(2)} refund
                        </div>

                        {loadingSuggestions ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-teal-500" />
                            <span className="ml-2 text-xs text-slate-500">Finding matching tolls...</span>
                          </div>
                        ) : suggestions.length === 0 ? (
                          <div className="text-xs text-slate-500 py-3 text-center">
                            No matching toll transactions found. The toll may not have been imported yet.
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {suggestions.map((s, i) => (
                              <Card key={s.tollId} className="border-slate-200 shadow-none">
                                <CardContent className="p-3 flex items-center justify-between gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 text-xs">
                                      <span className="text-slate-600">
                                        Toll: <span className="font-semibold text-slate-800">${Math.abs(s.tollAmount).toFixed(2)}</span>
                                      </span>
                                      <span className="text-slate-400">|</span>
                                      <span className="text-slate-600">
                                        Refund: <span className="font-semibold text-emerald-600">${s.uberRefund.toFixed(2)}</span>
                                      </span>
                                      <span className="text-slate-400">|</span>
                                      <span className={`font-medium ${Math.abs(s.variance) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                        {Math.abs(s.variance) < 0.01 ? 'Exact match' : `$${Math.abs(s.variance).toFixed(2)} variance`}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500">
                                      <span>{formatInFleetTz(s.date, fleetTz, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                                      {s.claimId && (
                                        <Badge variant="outline" className="text-[9px] border-purple-200 text-purple-600">
                                          Claim: {s.claimStatus || 'Pending'}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {/* Confidence indicator */}
                                    <div className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                      s.confidence >= 80 ? 'bg-emerald-100 text-emerald-700' :
                                      s.confidence >= 50 ? 'bg-amber-100 text-amber-700' :
                                      'bg-slate-100 text-slate-600'
                                    }`}>
                                      {s.confidence}%
                                    </div>
                                    <Button
                                      size="sm"
                                      className="h-7 px-3 text-xs bg-teal-600 hover:bg-teal-700"
                                      onClick={() => handleMatch(refund.id, s.tollId, s.claimId)}
                                      disabled={matchingId === s.tollId}
                                    >
                                      {matchingId === s.tollId ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <><LinkIcon className="h-3 w-3 mr-1" /> Link</>
                                      )}
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Load more */}
      {visibleCount < filtered.length && (
        <div className="flex items-center justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setVisibleCount(prev => prev + 25)}
            className="text-slate-600 hover:text-slate-900"
          >
            <ChevronDown className="h-4 w-4 mr-1" />
            Show More ({visibleCount} of {filtered.length})
          </Button>
        </div>
      )}
    </div>
  );
}