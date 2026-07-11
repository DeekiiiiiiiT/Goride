import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from "../../ui/card";
import { Badge } from "../../ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { Trip } from "../../../types/data";
import { normalizePlatform } from '../../../utils/normalizePlatform';
import { ChevronDown, CalendarRange, Sparkles } from "lucide-react";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { formatInFleetTz, useFleetTimezone } from '../../../utils/timezoneDisplay';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { groupTripsByWeek } from "../../../utils/tollWeekPeriod";
import { cn } from "../../ui/utils";
import { RefundBulkActionBar } from "./RefundBulkActionBar";
import { RefundResolutionDrawer, RefundResolutionPayload } from "./RefundResolutionDrawer";
import { REFUND_RESOLUTION_META, RefundResolutionType } from "./refundResolutionShell";
import { DriverOption } from "../../ui/DriverPicker";
import type { RefundSuggestion } from "../../../hooks/useTollReconciliation";
import type { UnlinkedShortfallSuggestion } from "../../../hooks/useTollReconciliation";
import {
  isRecommendedUnlinkedShortfall,
  isUnlinkedRefundActionableNow,
} from "../../../utils/unlinkedShortfallEligibility";
import { toast } from "sonner@2.0.3";

const EMPTY_SHORTFALL: UnlinkedShortfallSuggestion[] = [];

interface UnclaimedRefundsListProps {
  trips: Trip[];
  suggestions?: Map<string, RefundSuggestion>;
  shortfallSuggestions?: Map<string, UnlinkedShortfallSuggestion[]>;
  drivers?: DriverOption[];
  onResolve?: (tripId: string, resolution: RefundResolutionType, opts?: { notes?: string; driverId?: string }) => Promise<void> | void;
  onBulkResolve?: (items: Array<{ tripId: string; resolution: RefundResolutionType; notes?: string; driverId?: string }>) => Promise<void> | void;
  onApplyToShortfall?: (
    tripId: string,
    suggestion: UnlinkedShortfallSuggestion,
    opts?: { acknowledgedPlatformMismatch?: boolean },
  ) => Promise<void> | void;
}

export function UnclaimedRefundsList({
  trips,
  suggestions,
  shortfallSuggestions,
  drivers = [],
  onResolve,
  onBulkResolve,
  onApplyToShortfall,
}: UnclaimedRefundsListProps) {
  const [visibleWeekCount, setVisibleWeekCount] = useState(12);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerTrip, setDrawerTrip] = useState<Trip | null>(null);
  const [busy, setBusy] = useState(false);
  const fleetTz = useFleetTimezone();

  const weekGroups = useMemo(() => groupTripsByWeek(trips, fleetTz), [trips, fleetTz]);
  const visibleWeekGroups = weekGroups.slice(0, visibleWeekCount);

  const interactive = !!onResolve;

  const toggle = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const suggestionFor = (tripId: string) => suggestions?.get(tripId);
  const shortfallsFor = (tripId: string) => shortfallSuggestions?.get(tripId) ?? EMPTY_SHORTFALL;
  const bestShortfallFor = (tripId: string) => shortfallsFor(tripId)[0];

  const handleApplyShortfall = async (
    trip: Trip,
    candidate?: UnlinkedShortfallSuggestion,
    opts?: { acknowledgedPlatformMismatch?: boolean },
  ) => {
    const best = candidate ?? bestShortfallFor(trip.id);
    if (!best || !onApplyToShortfall) return;
    setBusy(true);
    try {
      await onApplyToShortfall(trip.id, best, opts);
      toast.success(
        best.coversFully
          ? `Applied $${best.tripRefund.toFixed(2)} — claim reimbursed`
          : `Applied $${best.tripRefund.toFixed(2)} — $${best.leftoverShortfall.toFixed(2)} shortfall left`,
      );
    } catch (e: any) {
      toast.error(e?.message || 'Failed to apply refund to underpaid claim');
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const drawerSuggestion = useMemo(() => {
    if (!drawerTrip) return null;
    const s = suggestionFor(drawerTrip.id);
    return s ? { type: s.status as RefundResolutionType, confidence: s.confidence, reason: s.reason } : null;
  }, [drawerTrip, suggestions]);

  const drawerShortfalls = useMemo(
    () => (drawerTrip ? shortfallsFor(drawerTrip.id) : EMPTY_SHORTFALL),
    [drawerTrip, shortfallSuggestions],
  );

  const handleDrawerResolve = async (payload: RefundResolutionPayload) => {
    if (!onResolve) return;
    await onResolve(payload.tripId, payload.resolution, { notes: payload.notes, driverId: payload.driverId });
  };

  const handleAcceptRow = async (trip: Trip) => {
    const s = suggestionFor(trip.id);
    if (!s || !onResolve) return;
    // Suggestions that need a driver can't be one-click accepted → open drawer.
    if (s.status === 'expense_logged' && !trip.driverId) {
      setDrawerTrip(trip);
      return;
    }
    setBusy(true);
    try {
      await onResolve(trip.id, s.status as RefundResolutionType, { notes: `Accepted suggestion: ${s.reason}` });
    } finally {
      setBusy(false);
    }
  };

  const applyBulk = async (resolution?: RefundResolutionType) => {
    if (!onBulkResolve) return;
    const ids = Array.from(selected);
    const items = ids
      .map(id => {
        const trip = trips.find(t => t.id === id);
        const s = suggestionFor(id);
        // "Apply suggested" uses each row's own suggestion; explicit resolution overrides.
        const res = resolution ?? (s?.status as RefundResolutionType | undefined);
        if (!res || res === 'pending') return null;
        // Skip rows that need a driver but don't have one (keep data integrity).
        if (res === 'expense_logged' && !trip?.driverId) return null;
        return { tripId: id, resolution: res };
      })
      .filter(Boolean) as Array<{ tripId: string; resolution: RefundResolutionType }>;
    if (items.length === 0) return;
    setBusy(true);
    try {
      await onBulkResolve(items);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  const suggestedCount = useMemo(
    () =>
      Array.from(selected).filter(id => {
        const s = suggestionFor(id);
        return s && s.status !== 'pending';
      }).length,
    [selected, suggestions],
  );

  const { needsDecisionCount, waitingImportCount } = useMemo(() => {
    let needsDecision = 0;
    let waiting = 0;
    for (const trip of trips) {
      const shortfall = bestShortfallFor(trip.id);
      const s = suggestionFor(trip.id);
      const actionable = isUnlinkedRefundActionableNow(trip, {
        suggestionStatus: s?.status ?? null,
        hasRecommendedShortfall: !!(shortfall && isRecommendedUnlinkedShortfall(shortfall, trip.platform)),
      });
      if (actionable) needsDecision++;
      else waiting++;
    }
    return { needsDecisionCount: needsDecision, waitingImportCount: waiting };
  }, [trips, suggestions, shortfallSuggestions]);

  if (trips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <div className="h-12 w-12 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <span className="text-xl">👍</span>
        </div>
        <h3 className="text-lg font-medium text-slate-900">No Unlinked Refunds</h3>
        <p>All trips with toll payments are linked or resolved.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unlinked Refunds</CardTitle>
        <div className="text-sm text-muted-foreground space-y-1">
          <p>
            Platform paid a toll on these trips, but no matching toll expense is linked yet.
          </p>
          <p>
            Apply the credit to an underpaid toll when possible; otherwise clear the row with the suggested reason.
          </p>
          {interactive && waitingImportCount > 0 && (
            <p className="text-slate-500 pt-0.5">
              {needsDecisionCount} need{needsDecisionCount === 1 ? 's' : ''} a decision
              {' · '}
              {waitingImportCount} waiting on tag import
            </p>
          )}
        </div>
      </CardHeader>

      {interactive && (
        <RefundBulkActionBar
          selectedCount={selected.size}
          suggestedCount={suggestedCount}
          onApplySuggested={() => applyBulk()}
          onMarkCashWash={() => applyBulk('cash_wash')}
          onClear={() => setSelected(new Set())}
          busy={busy}
        />
      )}

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {interactive && <TableHead className="w-8" />}
              <TableHead>Date</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Refund Amount</TableHead>
              <TableHead>{interactive ? 'Suggestion' : 'Status'}</TableHead>
              <TableHead className="text-right">{interactive ? 'Action' : 'Route'}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleWeekGroups.map((week) => (
              <TableRow key={week.key} className="border-0 hover:bg-transparent">
                <TableCell colSpan={interactive ? 7 : 6} className="p-0 align-top">
                  <Collapsible defaultOpen className="group border-b border-slate-200 last:border-b-0">
                    <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-2 py-3 text-left bg-slate-50/80 dark:bg-slate-900/40 hover:bg-slate-100/90 dark:hover:bg-slate-800/50 transition-colors">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <CalendarRange className="h-4 w-4 text-slate-500 shrink-0" />
                        <span className="font-semibold text-slate-800 dark:text-slate-100">{week.label}</span>
                        <span className="text-[10px] uppercase tracking-wide text-slate-500">Mon–Sun</span>
                        <Badge variant="secondary" className="text-[11px]">{week.items.length} trip{week.items.length !== 1 ? 's' : ''}</Badge>
                      </div>
                      <ChevronDown className="h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-0 group-data-[state=closed]:-rotate-90" />
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <table className="w-full text-sm caption-bottom">
                        <tbody className="[&_tr:last-child]:border-0">
                          {week.items.map(trip => {
                            const s = suggestionFor(trip.id);
                            const shortfall = bestShortfallFor(trip.id);
                            const showApplyShortcut =
                              !!shortfall && isRecommendedUnlinkedShortfall(shortfall, trip.platform);
                            const isFuture = new Date(trip.date) > new Date();
                            return (
                              <TableRow key={trip.id}>
                                {interactive && (
                                  <TableCell className="w-8">
                                    <Checkbox
                                      checked={selected.has(trip.id)}
                                      onCheckedChange={() => toggle(trip.id)}
                                      aria-label="Select refund"
                                    />
                                  </TableCell>
                                )}
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className={`font-medium ${isFuture ? 'text-red-600' : ''}`}>{formatInFleetTz(new Date(trip.date), fleetTz, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                    <span className="text-xs text-slate-500">{formatInFleetTz(new Date(trip.date), fleetTz, { hour: 'numeric', minute: '2-digit', hour12: true })}</span>
                                    {isFuture && <span className="text-[10px] font-medium text-red-500 bg-red-50 px-1 py-0.5 rounded mt-0.5 inline-block">Future Date</span>}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline">{normalizePlatform(trip.platform)}</Badge>
                                </TableCell>
                                <TableCell>
                                  {trip.driverName || <span className="text-slate-400">-</span>}
                                </TableCell>
                                <TableCell className="font-medium text-emerald-600">
                                  +${trip.tollCharges?.toFixed(2)}
                                </TableCell>
                                <TableCell>
                                  {interactive ? (
                                    showApplyShortcut ? (
                                      <div className="flex flex-col gap-0.5">
                                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border-orange-200 bg-orange-50 text-orange-800 border">
                                          Apply to underpaid · {shortfall.confidence}%
                                        </span>
                                        <span className="text-[10px] text-slate-500">
                                          Shortfall ${shortfall.remainingShortfall.toFixed(2)}
                                          {shortfall.leftoverShortfall > 0.05
                                            ? ` → leftover $${shortfall.leftoverShortfall.toFixed(2)}`
                                            : ' → covered'}
                                        </span>
                                      </div>
                                    ) : s ? (
                                      <div className="flex flex-col gap-0.5">
                                        <span className={cn(
                                          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border",
                                          REFUND_RESOLUTION_META[s.status as RefundResolutionType]?.chipClass || "bg-slate-100 text-slate-600 border-slate-200",
                                        )}>
                                          {REFUND_RESOLUTION_META[s.status as RefundResolutionType]?.label || s.status} · {s.confidence}%
                                        </span>
                                        {REFUND_RESOLUTION_META[s.status as RefundResolutionType]?.hint && (
                                          <span className="text-[10px] text-slate-500">
                                            {REFUND_RESOLUTION_META[s.status as RefundResolutionType].hint}
                                          </span>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-400">—</span>
                                    )
                                  ) : (
                                    <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 border-yellow-200">
                                      Likely Cash Paid
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-right">
                                  {interactive ? (
                                    <div className="flex items-center justify-end gap-1">
                                      {showApplyShortcut ? (
                                        <Button
                                          size="sm"
                                          className="bg-orange-600 hover:bg-orange-700"
                                          onClick={() => setDrawerTrip(trip)}
                                        >
                                          Apply to underpaid
                                        </Button>
                                      ) : s && s.status !== 'pending' ? (
                                        <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" disabled={busy} onClick={() => handleAcceptRow(trip)}>
                                          <Sparkles className="h-3.5 w-3.5 mr-1" /> Accept suggestion
                                        </Button>
                                      ) : null}
                                      <Button size="sm" variant="outline" onClick={() => setDrawerTrip(trip)}>Review</Button>
                                    </div>
                                  ) : (
                                    <span className="text-sm text-slate-600 max-w-[200px] truncate inline-block">
                                      {trip.pickupLocation} <span className="text-slate-400">→</span> {trip.dropoffLocation}
                                    </span>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </tbody>
                      </table>
                    </CollapsibleContent>
                  </Collapsible>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visibleWeekCount < weekGroups.length && (
          <div className="flex items-center justify-center pt-4 border-t mt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setVisibleWeekCount(prev => prev + 8)}
              className="text-slate-600 hover:text-slate-900"
            >
              <ChevronDown className="h-4 w-4 mr-1" />
              Show more weeks ({visibleWeekCount} of {weekGroups.length})
            </Button>
          </div>
        )}
      </CardContent>

      {interactive && (
        <RefundResolutionDrawer
          open={!!drawerTrip}
          onOpenChange={(o) => !o && setDrawerTrip(null)}
          trip={drawerTrip}
          suggestion={drawerSuggestion}
          shortfallCandidates={drawerShortfalls}
          drivers={drivers}
          onResolve={handleDrawerResolve}
          onApplyToShortfall={
            onApplyToShortfall
              ? async (tripId, candidate, opts) => {
                  const trip = trips.find((t) => t.id === tripId);
                  if (trip) await handleApplyShortfall(trip, candidate, opts);
                }
              : undefined
          }
        />
      )}
    </Card>
  );
}
