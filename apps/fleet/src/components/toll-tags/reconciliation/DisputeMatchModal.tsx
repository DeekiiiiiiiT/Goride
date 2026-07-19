import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../../ui/dialog";
import { Button } from "../../ui/button";
import { Card, CardContent } from "../../ui/card";
import { Loader2, Search, LinkIcon, Sparkles, ChevronDown, ChevronUp, MapPin } from "lucide-react";
import { DisputeRefund } from "../../../types/data";
import { formatStoredDateInFleetTz, fleetTzDateKey, useFleetTimezone } from '../../../utils/timezoneDisplay';
import { api } from '../../../services/api';
import { toast } from 'sonner@2.0.3';
import { PeriodWeekDropdown } from "../../ui/PeriodWeekDropdown";
import { ENTIRE_PERIOD_OPTION_ID, generatePeriodWeekOptions, type PeriodWeekOption } from "../../../utils/periodWeekOptions";
import { FleetBusyProvider, useFleetBusy } from '../../shared/FleetBusyLock';
import { useLockedDialog } from '../../shared/useLockedDialog';

interface SuggestionRow {
  tollId: string;
  tollAmount: number;
  claimAmount?: number;
  tripRefund?: number;
  shortfall?: number;
  uberRefund: number;
  variance: number;
  date: string;
  confidence: number;
  claimId: string | null;
  claimStatus: string | null;
  matchType?: 'claim' | 'toll';
  eligibleForAuto?: boolean;
  rejectReason?: string | null;
}

interface Candidate {
  matchType: 'claim' | 'toll';
  claimId: string | null;
  tollId: string;
  /** The persisted trip link, if this toll/claim is already reconciled to one. */
  tripId?: string | null;
  driverName: string;
  claimAmount: number | null;
  tollAmount: number;
  /** What Uber's trip fare already paid toward this toll, if a trip is linked or suggested. */
  tripRefund?: number | null;
  /** The live-suggested trip for a bare toll with no persisted trip link yet — passed
   *  through to the match endpoint so linking reconciles the toll to this trip too. */
  suggestedTripId?: string | null;
  /** Matched/suggested trip details — shown on demand via "View trip" so the
   *  user can verify exactly which trip a candidate is linked to. */
  tripPickup?: string | null;
  tripDropoff?: string | null;
  tripPlatform?: string | null;
  tripRequestTime?: string | null;
  tripDropoffTime?: string | null;
  /** The toll's own time-of-day — shown next to the matched trip's time so a
   *  cross-day or otherwise implausible match is visible at a glance. */
  tollTime?: string | null;
  date: string | null;
  status: string | null;
  workflowStage?: string | null;
}

interface DisputeMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refund: DisputeRefund | null;
  onMatched: (tollId: string) => void;
}

export function DisputeMatchModal(props: DisputeMatchModalProps) {
  return (
    <FleetBusyProvider>
      <DisputeMatchModalInner {...props} />
    </FleetBusyProvider>
  );
}

function DisputeMatchModalInner({ open, onOpenChange, refund, onMatched }: DisputeMatchModalProps) {
  const fleetTz = useFleetTimezone();
  const { runExclusive } = useFleetBusy();
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<{ claims: Candidate[]; tolls: Candidate[] }>({ claims: [], tolls: [] });
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [linkingTollId, setLinkingTollId] = useState<string | null>(null);
  const lockBusy = !!linkingTollId;
  const {
    onOpenChange: lockedOpenChange,
    contentProps: lockedContentProps,
  } = useLockedDialog(open, onOpenChange, lockBusy);
  // Period filter (Mon–Sun week). Empty = all periods.
  const [periodStart, setPeriodStart] = useState<string>('');
  const [periodEnd, setPeriodEnd] = useState<string>('');

  // Load suggestions first, then default the search week to the best match's
  // original underpaid week (not the refund's arrival week). No suggestion →
  // all periods so late refunds stay searchable across charged prior weeks.
  useEffect(() => {
    if (!open || !refund) return;
    let cancelled = false;
    setQuery('');
    setSuggestions([]);
    setCandidates({ claims: [], tolls: [] });
    setPeriodStart('');
    setPeriodEnd('');
    setLoadingSuggestions(true);
    setLoadingCandidates(true);

    const weekOptions = generatePeriodWeekOptions(24, fleetTz);

    (async () => {
      let nextSuggestions: SuggestionRow[] = [];
      try {
        const res = await api.getDisputeRefundSuggestions(refund.id);
        nextSuggestions = res.suggestions || [];
      } catch {
        nextSuggestions = [];
      }
      if (cancelled) return;
      setSuggestions(nextSuggestions);
      setLoadingSuggestions(false);

      const anchorYmd = nextSuggestions[0]?.date
        ? fleetTzDateKey(nextSuggestions[0].date, fleetTz)
        : null;
      const targetWeek = anchorYmd
        ? weekOptions.find((w) => w.startDate <= anchorYmd && w.endDate >= anchorYmd)
        : null;
      const start = targetWeek?.startDate ?? '';
      const end = targetWeek?.endDate ?? '';
      setPeriodStart(start);
      setPeriodEnd(end);
      // Scope by driverId (alias-aware on server). Avoid seeding the mangled
      // Uber CSV name — it used to hide the Roam-named claim/toll rows.
      setQuery('');

      try {
        const res = await api.getDisputeMatchCandidates({
          from: start || undefined,
          to: end || undefined,
          driverId: refund.driverId || undefined,
        });
        if (cancelled) return;
        setCandidates({ claims: res.claims || [], tolls: res.tolls || [] });
      } catch (err: any) {
        console.error('[DisputeMatch] candidates failed:', err);
        if (!cancelled) {
          toast.error('Failed to load match candidates');
          setCandidates({ claims: [], tolls: [] });
        }
      } finally {
        if (!cancelled) setLoadingCandidates(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refund?.id, fleetTz]);

  const loadCandidates = async (q: string, from: string, to: string) => {
    setLoadingCandidates(true);
    try {
      const res = await api.getDisputeMatchCandidates({
        query: q.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
        driverId: refund?.driverId || undefined,
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

  const link = async (tollId: string, claimId: string | null, createClaim?: boolean, suggestedTripId?: string | null) => {
    if (!refund) return;
    setLinkingTollId(tollId);
    const result = await runExclusive('Matching dispute refund…', async () => {
      try {
        const res = await api.matchDisputeRefund(refund.id, tollId, claimId || undefined, createClaim ? { createClaim: true, suggestedTripId } : undefined);
        if (res.warning) {
          toast.warning(res.warning);
        } else {
          toast.success('Refund matched — claim marked Reimbursed');
        }
        onMatched(tollId);
        lockedOpenChange(false);
        return true;
      } catch (err: any) {
        toast.error(`Match failed: ${err.message}`);
        return false;
      }
    });
    setLinkingTollId(null);
    if (result === undefined) {
      toast.message('Another action is still running — try again when it finishes.');
    }
  };

  if (!refund) return null;

  const fmtDate = (d?: string | null) =>
    d ? formatStoredDateInFleetTz(d, fleetTz, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  const confidenceClass = (c: number) =>
    c >= 80 ? 'bg-emerald-100 text-emerald-700' : c >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';

  return (
    <Dialog open={open} onOpenChange={lockedOpenChange}>
      <DialogContent className="max-w-lg" hideCloseButton={lockBusy} {...lockedContentProps}>
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
              suggestions.map((s) => {
                const shortfall = s.shortfall ?? s.claimAmount ?? 0;
                return (
                <Card key={`s-${s.tollId}`} className="border-slate-200 shadow-none">
                  <CardContent className="p-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0 text-xs">
                      {s.matchType === 'claim' ? (
                        <div className="text-slate-700 flex flex-wrap items-center gap-x-1.5">
                          <span>Toll <span className="font-semibold text-rose-600">-${Math.abs(s.tollAmount).toFixed(2)}</span></span>
                          <span className="text-slate-300">·</span>
                          <span>Paid <span className="font-semibold text-emerald-600">${Math.abs(s.tripRefund ?? 0).toFixed(2)}</span></span>
                          <span className="text-slate-300">·</span>
                          <span>Shortfall <span className="font-semibold text-amber-600">-${Math.abs(shortfall).toFixed(2)}</span></span>
                        </div>
                      ) : (
                        <div className="text-slate-700">
                          Toll: <span className="font-semibold text-slate-900">${Math.abs(s.tollAmount).toFixed(2)}</span>
                        </div>
                      )}
                      <div className="text-slate-700 mt-0.5">
                        Won back <span className="font-semibold text-emerald-600">${s.uberRefund.toFixed(2)}</span>
                        {' · '}
                        <span className={Math.abs(s.variance) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}>
                          {Math.abs(s.variance) < 0.01 ? 'Covers shortfall' : `$${Math.abs(s.variance).toFixed(2)} off`}
                        </span>
                      </div>
                      {s.eligibleForAuto === false && s.rejectReason && (
                        <div className="text-[10px] text-amber-700 mt-0.5">Manual review: {s.rejectReason}</div>
                      )}
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {fmtDate(s.date)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s.eligibleForAuto && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Auto OK</span>
                      )}
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${confidenceClass(s.confidence)}`}>{s.confidence}%</span>
                      <Button size="sm" className="h-7 px-3 text-xs bg-teal-600 hover:bg-teal-700"
                        onClick={() => link(s.tollId, s.claimId, s.matchType === 'toll')}
                        disabled={linkingTollId === s.tollId}>
                        {linkingTollId === s.tollId ? <Loader2 className="h-3 w-3 animate-spin" /> : <><LinkIcon className="h-3 w-3 mr-1" /> Link</>}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );})
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
                      <ClaimCandidateCard
                        key={`c-${c.claimId}`}
                        candidate={c}
                        fleetTz={fleetTz}
                        fmtDate={fmtDate}
                        linking={linkingTollId === c.tollId}
                        onLink={() => link(c.tollId, c.claimId)}
                      />
                    ))}
                  </div>
                )}
                {candidates.tolls.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Tolls with no claim yet</div>
                    {candidates.tolls.map((c) => (
                      <TollCandidateCard
                        key={`t-${c.tollId}`}
                        candidate={c}
                        fleetTz={fleetTz}
                        fmtDate={fmtDate}
                        linking={linkingTollId === c.tollId}
                        onLink={() => link(c.tollId, null, true, c.suggestedTripId)}
                      />
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

/** Matched/suggested trip's pickup, dropoff, and times — expanded on demand
 *  via "View trip" so the user can verify exactly which trip a candidate is
 *  linked to before linking it (and so trip-matching bugs are traceable). */
function TripLinkDetails({ candidate, fleetTz }: { candidate: Candidate; fleetTz: string }) {
  const hasTripInfo = candidate.tripPickup || candidate.tripDropoff || candidate.tripRequestTime;
  if (!hasTripInfo) {
    return (
      <div className="mt-1.5 rounded-md border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-500">
        No trip details available for this match.
      </div>
    );
  }
  return (
    <div className="mt-1.5 rounded-md border border-slate-200 bg-slate-50 p-2 text-[10px] text-slate-600 space-y-0.5">
      {candidate.tripPlatform && <div className="font-semibold text-slate-700">{candidate.tripPlatform} trip</div>}
      {candidate.tripPickup && <div>Pickup: {candidate.tripPickup}</div>}
      {candidate.tripDropoff && <div>Dropoff: {candidate.tripDropoff}</div>}
      {candidate.tripRequestTime && (
        <div>
          Pickup time: {formatStoredDateInFleetTz(candidate.tripRequestTime, fleetTz, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
        </div>
      )}
      {candidate.tripDropoffTime && (
        <div>
          Dropoff time: {formatStoredDateInFleetTz(candidate.tripDropoffTime, fleetTz, { hour: 'numeric', minute: '2-digit', hour12: true })}
        </div>
      )}
    </div>
  );
}

function ViewTripToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 hover:text-indigo-800"
    >
      <MapPin className="h-3 w-3" />
      View trip
      {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
    </button>
  );
}

interface CandidateCardProps {
  candidate: Candidate;
  fleetTz: string;
  fmtDate: (d?: string | null) => string;
  linking: boolean;
  onLink: () => void;
}

function ClaimCandidateCard({ candidate: c, fleetTz, fmtDate, linking, onLink }: CandidateCardProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="p-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs flex-1">
          <div className="font-medium text-slate-800 truncate">{c.driverName}</div>
          <div className="flex flex-wrap items-center gap-x-1.5 mt-0.5">
            <span>Toll <span className="font-semibold text-rose-600">-${Math.abs(c.tollAmount || 0).toFixed(2)}</span></span>
            <span className="text-slate-300">·</span>
            <span>Refund <span className="font-semibold text-emerald-600">${Math.abs(c.tripRefund ?? 0).toFixed(2)}</span></span>
            <span className="text-slate-300">·</span>
            <span>Underpaid <span className="font-semibold text-amber-600">-${Math.abs(c.claimAmount || 0).toFixed(2)}</span></span>
          </div>
          {c.date && (
            <div className="text-[10px] text-slate-500 mt-0.5">
              {fmtDate(c.date)}{c.tollTime && ` · ${c.tollTime}`}
            </div>
          )}
          {c.tripId && <ViewTripToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />}
          {expanded && <TripLinkDetails candidate={c} fleetTz={fleetTz} />}
        </div>
        <Button size="sm" className="h-7 px-3 text-xs bg-teal-600 hover:bg-teal-700 shrink-0"
          onClick={onLink} disabled={linking}>
          {linking ? <Loader2 className="h-3 w-3 animate-spin" /> : <><LinkIcon className="h-3 w-3 mr-1" /> Link</>}
        </Button>
      </CardContent>
    </Card>
  );
}

function TollCandidateCard({ candidate: c, fleetTz, fmtDate, linking, onLink }: CandidateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasTripRefund = c.tripRefund != null;
  const flaggedUnderpaid = c.workflowStage === 'underpaid_pending';
  const showBreakdown = hasTripRefund || flaggedUnderpaid;
  const tripRefundAmt = hasTripRefund ? Math.abs(c.tripRefund || 0) : 0;
  const underpaidBy = showBreakdown ? Math.abs(c.tollAmount || 0) - tripRefundAmt : null;
  const linkedTripId = c.tripId || c.suggestedTripId;
  return (
    <Card className="border-slate-200 shadow-none">
      <CardContent className="p-2.5 flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs flex-1">
          <div className="font-medium text-slate-800 truncate">{c.driverName}</div>
          {showBreakdown ? (
            <div className="flex flex-wrap items-center gap-x-1.5 mt-0.5">
              <span>Toll <span className="font-semibold text-rose-600">-${Math.abs(c.tollAmount || 0).toFixed(2)}</span></span>
              <span className="text-slate-300">·</span>
              <span>Refund <span className="font-semibold text-emerald-600">${tripRefundAmt.toFixed(2)}</span></span>
              <span className="text-slate-300">·</span>
              <span>Underpaid <span className="font-semibold text-amber-600">-${(underpaidBy || 0).toFixed(2)}</span></span>
            </div>
          ) : (
            <div className="text-[10px] text-slate-500 mt-0.5">
              Toll <span className="font-semibold text-rose-600">-${Math.abs(c.tollAmount || 0).toFixed(2)}</span> · no trip matched yet
            </div>
          )}
          {c.date && (
            <div className="text-[10px] text-slate-500 mt-0.5">
              {fmtDate(c.date)}{c.tollTime && ` · ${c.tollTime}`}
            </div>
          )}
          {linkedTripId && <ViewTripToggle expanded={expanded} onToggle={() => setExpanded((v) => !v)} />}
          {expanded && <TripLinkDetails candidate={c} fleetTz={fleetTz} />}
        </div>
        <Button size="sm" variant="outline" className="h-7 px-3 text-xs shrink-0"
          onClick={onLink} disabled={linking}>
          {linking ? <Loader2 className="h-3 w-3 animate-spin" /> : <><LinkIcon className="h-3 w-3 mr-1" /> Link + create claim</>}
        </Button>
      </CardContent>
    </Card>
  );
}
