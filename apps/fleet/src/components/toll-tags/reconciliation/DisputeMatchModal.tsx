import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Card, CardContent } from "../../ui/card";
import { Loader2, Search, LinkIcon, Sparkles } from "lucide-react";
import { DisputeRefund } from "../../../types/data";
import { formatStoredDateInFleetTz, fleetTzDateKey, useFleetTimezone } from '../../../utils/timezoneDisplay';
import { api } from '../../../services/api';
import { toast } from 'sonner@2.0.3';
import { PeriodWeekDropdown } from "../../ui/PeriodWeekDropdown";
import { ENTIRE_PERIOD_OPTION_ID, generatePeriodWeekOptions, type PeriodWeekOption } from "../../../utils/periodWeekOptions";

interface SuggestionRow {
  tollId: string;
  tollAmount: number;
  claimAmount?: number;
  uberRefund: number;
  variance: number;
  date: string;
  confidence: number;
  claimId: string | null;
  claimStatus: string | null;
  matchType?: 'claim' | 'toll';
}

interface Candidate {
  matchType: 'claim' | 'toll';
  claimId: string | null;
  tollId: string;
  driverName: string;
  claimAmount: number | null;
  tollAmount: number;
  date: string | null;
  status: string | null;
}

interface DisputeMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refund: DisputeRefund | null;
  onMatched: () => void;
}

export function DisputeMatchModal({ open, onOpenChange, refund, onMatched }: DisputeMatchModalProps) {
  const fleetTz = useFleetTimezone();
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<{ claims: Candidate[]; tolls: Candidate[] }>({ claims: [], tolls: [] });
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [linkingTollId, setLinkingTollId] = useState<string | null>(null);
  // Period filter (Mon–Sun week). Empty = all periods.
  const [periodStart, setPeriodStart] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');

  // Load suggestions + default period = the refund's Mon–Sun week.
  useEffect(() => {
    if (!open || !refund) return;
    setQuery('');
    setSuggestions([]);
    setCandidates({ claims: [], tolls: [] });

    const refundYmd = fleetTzDateKey(refund.date, fleetTz);
    const weekOptions = generatePeriodWeekOptions(16, fleetTz);
    const refundWeek = weekOptions.find(
      (w) => refundYmd && w.startDate <= refundYmd && w.endDate >= refundYmd,
    );
    const start = refundWeek?.startDate ?? '';
    const end = refundWeek?.endDate ?? '';
    setPeriodStart(start);
    setPeriodEnd(end);

    setLoadingSuggestions(true);
    api.getDisputeRefundSuggestions(refund.id)
      .then((res) => setSuggestions(res.suggestions || []))
      .catch(() => setSuggestions([]))
      .finally(() => setLoadingSuggestions(false));

    loadCandidates('', start, end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refund?.id, fleetTz]);

  const loadCandidates = async (q: string, from: string, to: string) => {
    setLoadingCandidates(true);
    try {
      const res = await api.getDisputeMatchCandidates({
        query: q.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setCandidates({ claims: res.claims || [], tolls: res.tolls || [] });
    } catch (err: any) {
      console.error('[DisputeMatch] candidates failed:', err);
      toast.error('Failed to load match candidates');
      setCandidates({ claims: [], tolls: [] });
    } finally {
      setLoadingCandidates(false);
    }
  };

  const onPeriodSelect = (period: PeriodWeekOption) => {
    const start = period.id === ENTIRE_PERIOD_OPTION_ID ? '' : period.startDate;
    const end = period.id === ENTIRE_PERIOD_OPTION_ID ? '' : period.endDate;
    setPeriodStart(start);
    setPeriodEnd(end);
    loadCandidates(query, start, end);
  };

  const link = async (tollId: string, claimId: string | null, createClaim?: boolean) => {
    if (!refund) return;
    setLinkingTollId(tollId);
    try {
      await api.matchDisputeRefund(refund.id, tollId, claimId || undefined, createClaim ? { createClaim: true } : undefined);
      toast.success('Refund matched — claim marked Reimbursed');
      onMatched();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(`Match failed: ${err.message}`);
    } finally {
      setLinkingTollId(null);
    }
  };

  if (!refund) return null;

  const fmtDate = (d?: string | null) =>
    d ? formatStoredDateInFleetTz(d, fleetTz, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  const confidenceClass = (c: number) =>
    c >= 80 ? 'bg-emerald-100 text-emerald-700' : c >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Match dispute refund</DialogTitle>
          <DialogDescription>
            <span className="font-semibold text-emerald-600">${refund.amount.toFixed(2)}</span> won back
            {refund.driverName ? <> · {refund.driverName}</> : null}
            {refund.date ? <> · {formatStoredDateInFleetTz(refund.date, fleetTz, { month: 'short', day: 'numeric', year: 'numeric' })}</> : null}
            {refund.platform ? <> · {refund.platform}</> : null}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] overflow-y-auto space-y-4 pr-1">
          {/* Suggested matches */}
          <section className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700">
              <Sparkles className="h-3.5 w-3.5" /> Suggested matches
            </div>
            {loadingSuggestions ? (
              <div className="flex items-center justify-center py-3 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : suggestions.length === 0 ? (
              <div className="text-xs text-slate-500 py-2">No confident auto-match. Search below to pick it yourself.</div>
            ) : (
              suggestions.map((s) => (
                <Card key={`s-${s.tollId}`} className="border-slate-200 shadow-none">
                  <CardContent className="p-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 text-xs">
                      <div className="text-slate-700">
                        {s.matchType === 'claim' ? 'Underpaid loss' : 'Toll'}:{' '}
                        <span className="font-semibold text-slate-900">${Math.abs(s.claimAmount ?? s.tollAmount).toFixed(2)}</span>
                        {' · '}Won back <span className="font-semibold text-emerald-600">${s.uberRefund.toFixed(2)}</span>
                        {' · '}
                        <span className={Math.abs(s.variance) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}>
                          {Math.abs(s.variance) < 0.01 ? 'Exact match' : `$${Math.abs(s.variance).toFixed(2)} off`}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {fmtDate(s.date)}{s.matchType === 'claim' && <> · on ${Math.abs(s.tollAmount).toFixed(2)} toll</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${confidenceClass(s.confidence)}`}>{s.confidence}%</span>
                      <Button size="sm" className="h-7 px-3 text-xs bg-teal-600 hover:bg-teal-700"
                        onClick={() => link(s.tollId, s.claimId, s.matchType === 'toll')}
                        disabled={linkingTollId === s.tollId}>
                        {linkingTollId === s.tollId ? <Loader2 className="h-3 w-3 animate-spin" /> : <><LinkIcon className="h-3 w-3 mr-1" /> Link</>}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </section>

          {/* Manual search */}
          <section className="space-y-2 border-t border-slate-100 pt-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Search manually (all drivers)</div>
              <PeriodWeekDropdown
                selectedStart={periodStart || undefined}
                selectedEnd={periodEnd || undefined}
                onSelect={onPeriodSelect}
                timezone={fleetTz}
                weekCount={16}
                prependEntireOption
                placeholder="All periods"
                buttonClassName="h-7 py-1"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') loadCandidates(query, periodStart, periodEnd); }}
                placeholder="Search by driver, amount, or date…"
                className="flex-1 h-8 rounded-md border border-slate-200 px-2.5 text-xs outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
              />
              <Button size="sm" className="h-8 px-3 text-xs bg-teal-600 hover:bg-teal-700" onClick={() => loadCandidates(query, periodStart, periodEnd)}>
                <Search className="h-3 w-3 mr-1" /> Search
              </Button>
            </div>

            {loadingCandidates ? (
              <div className="flex items-center justify-center py-3 text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : (candidates.claims.length === 0 && candidates.tolls.length === 0) ? (
              <div className="text-xs text-slate-500 py-2 text-center">No open claims or tolls match that search.</div>
            ) : (
              <div className="space-y-2">
                {candidates.claims.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Open underpaid claims</div>
                    {candidates.claims.map((c) => (
                      <Card key={`c-${c.claimId}`} className="border-slate-200 shadow-none">
                        <CardContent className="p-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0 text-xs">
                            <div className="font-medium text-slate-800 truncate">{c.driverName}</div>
                            <div className="text-[10px] text-slate-500">
                              Loss ${Math.abs(c.claimAmount || 0).toFixed(2)} · on ${Math.abs(c.tollAmount || 0).toFixed(2)} toll
                              {c.date && <> · {fmtDate(c.date)}</>}
                            </div>
                          </div>
                          <Button size="sm" className="h-7 px-3 text-xs bg-teal-600 hover:bg-teal-700"
                            onClick={() => link(c.tollId, c.claimId)} disabled={linkingTollId === c.tollId}>
                            {linkingTollId === c.tollId ? <Loader2 className="h-3 w-3 animate-spin" /> : <><LinkIcon className="h-3 w-3 mr-1" /> Link</>}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                {candidates.tolls.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tolls with no claim yet</div>
                    {candidates.tolls.map((c) => (
                      <Card key={`t-${c.tollId}`} className="border-slate-200 shadow-none">
                        <CardContent className="p-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0 text-xs">
                            <div className="font-medium text-slate-800 truncate">{c.driverName}</div>
                            <div className="text-[10px] text-slate-500">
                              Toll ${Math.abs(c.tollAmount || 0).toFixed(2)}{c.date && <> · {fmtDate(c.date)}</>}
                            </div>
                          </div>
                          <Button size="sm" variant="outline" className="h-7 px-3 text-xs"
                            onClick={() => link(c.tollId, null, true)} disabled={linkingTollId === c.tollId}>
                            {linkingTollId === c.tollId ? <Loader2 className="h-3 w-3 animate-spin" /> : <><LinkIcon className="h-3 w-3 mr-1" /> Link + create claim</>}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
