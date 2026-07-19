import React, { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "../../ui/sheet";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import { ChevronDown } from "lucide-react";
import { cn } from "../../ui/utils";
import { DriverPicker, DriverOption } from "../../ui/DriverPicker";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import {
  RefundResolutionType,
  RefundSuggestion,
  RefundTripLike,
  REFUND_RESOLUTION_META,
  REFUND_RESOLUTION_ORDER,
  REFUND_OTHER_WAYS_LABEL,
} from "./refundResolutionShell";
import type { UnlinkedShortfallSuggestion } from "../../../hooks/useTollReconciliation";
import { isRecommendedUnlinkedShortfall, isUnlinkedShortfallPlatformMismatch } from "../../../utils/unlinkedShortfallEligibility";
import { PlatformMismatchWarning, platformsMismatch } from "./PlatformMismatchWarning";
import { PlatformSourceBadge } from "./PlatformSourceBadge";
import { getCrossPeriodCoverage } from "../../../utils/tollWeekPeriod";
import { useFleetTimezone } from "../../../utils/timezoneDisplay";

export interface RefundResolutionPayload {
  tripId: string;
  resolution: RefundResolutionType;
  notes?: string;
  driverId?: string;
  auto: boolean;
}

export interface ApplyToShortfallOptions {
  acknowledgedPlatformMismatch?: boolean;
  forceSingleTarget?: boolean;
  applyShare?: number;
  targets?: Array<{ claimId?: string | null; tollId?: string | null; share?: number }>;
}

interface RefundResolutionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: RefundTripLike | null;
  /** Leftover resolution suggestion — reserved for future row pre-select; not shown as hint copy. */
  suggestion?: RefundSuggestion | null;
  /** Underpaid claim/toll candidates for Apply to underpaid. */
  shortfallCandidates?: UnlinkedShortfallSuggestion[];
  drivers?: DriverOption[];
  onResolve: (payload: RefundResolutionPayload) => Promise<void> | void;
  onApplyToShortfall?: (
    tripId: string,
    candidate: UnlinkedShortfallSuggestion,
    opts?: ApplyToShortfallOptions,
  ) => Promise<void> | void;
}

function formatDate(iso: string): string {
  // Date-only strings parse as UTC midnight — render as a plain local date or
  // the row shifts to the previous evening (e.g. Jun 30 shown as "Jun 29, 19:00").
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function candidateKey(c: UnlinkedShortfallSuggestion): string {
  return `${c.tollId}::${c.claimId ?? ""}`;
}

function pickPrimaryCandidate(
  ranked: UnlinkedShortfallSuggestion[],
  platform?: string | null,
): UnlinkedShortfallSuggestion | null {
  return (
    ranked.find((c) => isRecommendedUnlinkedShortfall(c, platform)) ??
    ranked.find((c) => !isUnlinkedShortfallPlatformMismatch(c, platform)) ??
    ranked[0] ??
    null
  );
}

function ShortfallCandidateRow({
  candidate: c,
  tripPlatform,
  tripDate,
  active,
  showRecommended,
  multiMode,
  proposedShare,
  onSelect,
}: {
  candidate: UnlinkedShortfallSuggestion;
  tripPlatform?: string | null;
  tripDate?: string | null;
  active: boolean;
  showRecommended: boolean;
  multiMode?: boolean;
  proposedShare?: number;
  onSelect: () => void;
}) {
  const fleetTz = useFleetTimezone();
  const recommended = showRecommended && isRecommendedUnlinkedShortfall(c, tripPlatform);
  const share = proposedShare ?? c.proposedShare;
  const crossPeriod = getCrossPeriodCoverage(tripDate, c.date, fleetTz);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
        active ? "border-orange-400 bg-orange-50/60" : "border-slate-200 hover:border-orange-300",
      )}
    >
      <span
        className={cn(
          "mt-1 h-4 w-4 shrink-0 border",
          multiMode ? "rounded-sm" : "rounded-full",
          active
            ? multiMode
              ? "border-orange-600 bg-orange-600"
              : "border-orange-600 bg-orange-600 ring-2 ring-orange-100"
            : "border-slate-300",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 flex-wrap">
          <PlatformSourceBadge platform={c.tollPlatform} size="sm" />
          <span className="text-sm font-medium text-slate-900">
            {formatDate(c.date)} · ${c.tollAmount.toFixed(2)}
          </span>
          {recommended && (
            <span className="inline-flex items-center rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800">
              Recommended
            </span>
          )}
          <span className="ml-auto text-[11px] font-semibold text-slate-500">
            {c.confidence}%
          </span>
        </span>
        {c.location && (
          <span className="block text-xs text-slate-500 mt-0.5 truncate">{c.location}</span>
        )}
        <span className="block text-xs text-slate-500 mt-0.5">
          Shortfall ${c.remainingShortfall.toFixed(2)}
          {typeof share === "number"
            ? ` · apply $${share.toFixed(2)}`
            : c.leftoverShortfall > 0.05
              ? ` · leftover $${c.leftoverShortfall.toFixed(2)} after apply`
              : " · fully covered"}
        </span>
        {(c.platformMismatch ||
          platformsMismatch(c.tripPlatform || tripPlatform, c.tollPlatform)) && (
          <span className="mt-1 inline-flex text-[10px] font-semibold text-amber-700">
            Platform differs from refund
          </span>
        )}
        {crossPeriod && (
          <span className="mt-1 inline-flex rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
            Other period · {crossPeriod.targetWeekLabel}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * Review drawer: primary path is Apply to underpaid (picker).
 * Cash wash / Phantom / Pending / Expense logged live under "Other ways to clear".
 */
export function RefundResolutionDrawer({
  open,
  onOpenChange,
  trip,
  shortfallCandidates = [],
  drivers = [],
  onResolve,
  onApplyToShortfall,
}: RefundResolutionDrawerProps) {
  const [selectedShortfallKey, setSelectedShortfallKey] = useState<string | null>(null);
  const [selectedMultiKeys, setSelectedMultiKeys] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<RefundResolutionType | null>(null);
  const [notes, setNotes] = useState("");
  const [driverId, setDriverId] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [otherOpen, setOtherOpen] = useState(true);
  const [moreUnderpaidOpen, setMoreUnderpaidOpen] = useState(false);
  const [acknowledgedMismatch, setAcknowledgedMismatch] = useState(false);
  const [forceSingleOpen, setForceSingleOpen] = useState(false);

  const amount = useMemo(() => Math.abs(trip?.tollCharges ?? 0), [trip]);

  const rankedCandidates = useMemo(
    () => [...shortfallCandidates].sort((a, b) => b.confidence - a.confidence),
    [shortfallCandidates],
  );

  const multiMode = useMemo(
    () => rankedCandidates.some((c) => c.requiresMultiTarget),
    [rankedCandidates],
  );

  const poolCandidates = useMemo(() => {
    if (!multiMode) return [];
    const ids = new Set(
      rankedCandidates.find((c) => c.multiTargetTollIds?.length)?.multiTargetTollIds ||
        rankedCandidates.filter((c) => (c.proposedShare ?? 0) > 0.05).map((c) => c.tollId),
    );
    return rankedCandidates
      .filter((c) => ids.has(c.tollId))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [rankedCandidates, multiMode]);

  const primaryCandidate = useMemo(
    () => pickPrimaryCandidate(rankedCandidates, trip?.platform),
    [rankedCandidates, trip?.platform],
  );

  const otherCandidates = useMemo(() => {
    if (multiMode) return [];
    if (!primaryCandidate) return rankedCandidates;
    const primaryKey = candidateKey(primaryCandidate);
    return rankedCandidates.filter((c) => candidateKey(c) !== primaryKey);
  }, [rankedCandidates, primaryCandidate, multiMode]);

  // Reset when trip changes; auto-select top recommended shortfall once candidates are present.
  useEffect(() => {
    setSelected(null);
    setNotes("");
    setDriverId(trip?.driverId ?? undefined);
    setOtherOpen(true);
    setMoreUnderpaidOpen(false);
    setAcknowledgedMismatch(false);
    setForceSingleOpen(false);
    if (multiMode && poolCandidates.length > 0) {
      setSelectedMultiKeys(new Set(poolCandidates.map((c) => candidateKey(c))));
      setSelectedShortfallKey(null);
    } else {
      const recommended = pickPrimaryCandidate(rankedCandidates, trip?.platform);
      setSelectedShortfallKey(recommended ? candidateKey(recommended) : null);
      setSelectedMultiKeys(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-init selection when trip or candidate set identity changes
  }, [trip?.id, trip?.driverId, shortfallCandidates]);

  const selectedCandidate = rankedCandidates.find((c) => candidateKey(c) === selectedShortfallKey) ?? null;
  const needsDriver = selected === "expense_logged" && !driverId;
  const selectedMismatch =
    !!selectedCandidate &&
    (selectedCandidate.platformMismatch === true ||
      platformsMismatch(
        selectedCandidate.tripPlatform || trip?.platform,
        selectedCandidate.tollPlatform,
      ));

  const multiSelected = poolCandidates.filter((c) => selectedMultiKeys.has(candidateKey(c)));
  const multiMismatch = multiSelected.some(
    (c) =>
      c.platformMismatch === true ||
      platformsMismatch(c.tripPlatform || trip?.platform, c.tollPlatform),
  );

  const toggleMulti = (key: string) => {
    setSelectedMultiKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelected(null);
  };

  const submitLeftover = async (resolution: RefundResolutionType, auto: boolean) => {
    if (!trip) return;
    if (resolution === "expense_logged" && !driverId) return;
    setSubmitting(true);
    try {
      await onResolve({ tripId: trip.id, resolution, notes: notes.trim() || undefined, driverId, auto });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const submitApply = async () => {
    if (!trip || !onApplyToShortfall) return;
    if (multiMode && !forceSingleOpen) {
      if (multiSelected.length < 2) return;
      if (multiMismatch && !acknowledgedMismatch) return;
      setSubmitting(true);
      try {
        await onApplyToShortfall(trip.id, multiSelected[0], {
          acknowledgedPlatformMismatch: multiMismatch ? acknowledgedMismatch : undefined,
          targets: multiSelected.map((c) => ({
            claimId: c.claimId,
            tollId: c.tollId,
            share: c.proposedShare,
          })),
        });
        onOpenChange(false);
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (!selectedCandidate) return;
    if (selectedMismatch && !acknowledgedMismatch) return;
    const share =
      typeof selectedCandidate.proposedShare === "number" && selectedCandidate.proposedShare > 0.05
        ? selectedCandidate.proposedShare
        : Math.min(amount, selectedCandidate.remainingShortfall);
    if (share <= 0.05) return;
    setSubmitting(true);
    try {
      await onApplyToShortfall(trip.id, selectedCandidate, {
        acknowledgedPlatformMismatch: selectedMismatch ? acknowledgedMismatch : undefined,
        // Explicit single pick — never re-run multi-plaza dump guard with a $0 share.
        forceSingleTarget: true,
        applyShare: share,
      });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!trip) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-5 border-b border-slate-200">
          <SheetTitle className="text-lg text-slate-900">Resolve Unlinked Refund</SheetTitle>
          <SheetDescription>
            This trip has a toll credit with no linked expense.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Trip context */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <PlatformSourceBadge platform={trip.platform} size="md" />
              <span className="font-semibold text-emerald-600">+${amount.toFixed(2)}</span>
            </div>
            <div className="mt-3 text-sm text-slate-700">
              <div className="font-medium">{formatDate(trip.date)}</div>
              <div className="text-slate-500 mt-0.5">
                {trip.pickupLocation || "—"} <span className="text-slate-400">→</span> {trip.dropoffLocation || "—"}
              </div>
              <div className="text-slate-500">
                Driver:{" "}
                <span className="text-slate-700 font-medium">{trip.driverName || "Unassigned"}</span>
              </div>
            </div>
          </div>

          {/* Primary: Apply to underpaid */}
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Apply to underpaid
            </div>
            {rankedCandidates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-3 space-y-1">
                <p className="text-sm font-medium text-slate-700">
                  No underpaid toll in this week for this driver.
                </p>
                <p className="text-sm text-slate-500">
                  Clear this credit with Cash wash or another option below — do not guess a later week.
                </p>
              </div>
            ) : multiMode && !forceSingleOpen ? (
              <div className="space-y-2">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  This credit looks like multiple plazas. Apply across both underpaid tolls so leftover
                  credit is not burned on one shortfall.
                </div>
                {poolCandidates.map((c) => {
                  const key = candidateKey(c);
                  return (
                    <ShortfallCandidateRow
                      key={key}
                      candidate={c}
                      tripPlatform={trip.platform}
                    tripDate={trip.date}
                      active={selectedMultiKeys.has(key)}
                      showRecommended={false}
                      multiMode
                      proposedShare={c.proposedShare}
                      onSelect={() => toggleMulti(key)}
                    />
                  );
                })}
                {multiMismatch && (
                  <PlatformMismatchWarning
                    sourcePlatform={multiSelected[0]?.tripPlatform || trip.platform}
                    targetPlatform={multiSelected.find((c) => c.tollPlatform)?.tollPlatform}
                    acknowledged={acknowledgedMismatch}
                    onAcknowledge={setAcknowledgedMismatch}
                  />
                )}
                <Button
                  onClick={submitApply}
                  disabled={
                    multiSelected.length < 2 ||
                    !onApplyToShortfall ||
                    submitting ||
                    (multiMismatch && !acknowledgedMismatch)
                  }
                  className="w-full bg-orange-600 hover:bg-orange-700"
                >
                  Apply ${amount.toFixed(2)} across {multiSelected.length} tolls
                </Button>
                <button
                  type="button"
                  className="text-xs text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline"
                  onClick={() => {
                    setForceSingleOpen(true);
                    setSelectedShortfallKey(
                      poolCandidates[0] ? candidateKey(poolCandidates[0]) : null,
                    );
                  }}
                >
                  Apply to one toll only (not recommended)
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {multiMode && forceSingleOpen && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    Applying the full credit to one toll clears this unlinked refund. Leftover will not
                    cover the other plaza.
                  </div>
                )}
                {primaryCandidate && (
                  <ShortfallCandidateRow
                    candidate={primaryCandidate}
                    tripPlatform={trip.platform}
                    tripDate={trip.date}
                    active={selectedShortfallKey === candidateKey(primaryCandidate)}
                    showRecommended={!multiMode}
                    onSelect={() => {
                      setSelectedShortfallKey(candidateKey(primaryCandidate));
                      setSelected(null);
                      setAcknowledgedMismatch(false);
                    }}
                  />
                )}
                {otherCandidates.length > 0 && (
                  <Collapsible open={moreUnderpaidOpen} onOpenChange={setMoreUnderpaidOpen}>
                    <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors">
                      <span>
                        {moreUnderpaidOpen ? "Hide" : "Show"} {otherCandidates.length} other underpaid toll
                        {otherCandidates.length === 1 ? "" : "s"}
                      </span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 text-slate-500 transition-transform",
                          moreUnderpaidOpen ? "rotate-0" : "-rotate-90",
                        )}
                      />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-1">
                      {otherCandidates.map((c) => {
                        const key = candidateKey(c);
                        return (
                          <ShortfallCandidateRow
                            key={key}
                            candidate={c}
                            tripPlatform={trip.platform}
                          tripDate={trip.date}
                            active={selectedShortfallKey === key}
                            showRecommended={false}
                            onSelect={() => {
                              setSelectedShortfallKey(key);
                              setSelected(null);
                              setAcknowledgedMismatch(false);
                            }}
                          />
                        );
                      })}
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {multiMode && forceSingleOpen && poolCandidates.length > 0 && !primaryCandidate && (
                  <div className="space-y-2">
                    {poolCandidates.map((c) => {
                      const key = candidateKey(c);
                      return (
                        <ShortfallCandidateRow
                          key={key}
                          candidate={c}
                          tripPlatform={trip.platform}
                          tripDate={trip.date}
                          active={selectedShortfallKey === key}
                          showRecommended={false}
                          onSelect={() => {
                            setSelectedShortfallKey(key);
                            setSelected(null);
                            setAcknowledgedMismatch(false);
                          }}
                        />
                      );
                    })}
                  </div>
                )}
                {selectedCandidate && selectedMismatch && (
                  <PlatformMismatchWarning
                    sourcePlatform={selectedCandidate.tripPlatform || trip.platform}
                    targetPlatform={selectedCandidate.tollPlatform}
                    acknowledged={acknowledgedMismatch}
                    onAcknowledge={setAcknowledgedMismatch}
                  />
                )}
                <Button
                  onClick={submitApply}
                  disabled={
                    !selectedCandidate ||
                    !onApplyToShortfall ||
                    submitting ||
                    (selectedMismatch && !acknowledgedMismatch)
                  }
                  className="w-full bg-orange-600 hover:bg-orange-700"
                >
                  Apply to selected
                </Button>
              </div>
            )}
          </div>

          {/* Secondary leftovers */}
          <Collapsible open={otherOpen} onOpenChange={setOtherOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left hover:bg-slate-100 transition-colors">
              <span className="text-xs font-medium uppercase tracking-wider text-slate-600">
                {REFUND_OTHER_WAYS_LABEL}
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-slate-500 transition-transform",
                  otherOpen ? "rotate-0" : "-rotate-90",
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2">
              {REFUND_RESOLUTION_ORDER.map((type) => {
                const meta = REFUND_RESOLUTION_META[type];
                const active = selected === type;
                const isAdvanced = type === "expense_logged";
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setSelected(type);
                      setSelectedShortfallKey(null);
                    }}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                      active ? "border-indigo-400 bg-indigo-50/50" : "border-slate-200 hover:border-indigo-300",
                      isAdvanced && "mt-1",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1 h-4 w-4 shrink-0 rounded-full border",
                        active ? "border-indigo-600 bg-indigo-600 ring-2 ring-indigo-100" : "border-slate-300",
                      )}
                    />
                    <span>
                      <span className="block text-sm font-medium text-slate-900">
                        {meta.label}
                        {isAdvanced && (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Advanced
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-slate-500">{meta.description}</span>
                    </span>
                  </button>
                );
              })}

              {selected === "expense_logged" && (
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                    Assign driver
                  </label>
                  <p className="text-xs text-slate-500 mb-1.5">Required to attribute the cash toll expense.</p>
                  <DriverPicker drivers={drivers} value={driverId} onChange={setDriverId} />
                </div>
              )}

              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                  Notes (optional)
                </label>
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add context for the audit trail…"
                  className="mt-1"
                />
              </div>

              <Button
                className="w-full bg-indigo-600 hover:bg-indigo-700"
                disabled={!selected || needsDriver || submitting}
                onClick={() => selected && submitLeftover(selected, false)}
              >
                Resolve with selected
              </Button>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <SheetFooter className="p-4 border-t border-slate-200">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
