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

export interface RefundResolutionPayload {
  tripId: string;
  resolution: RefundResolutionType;
  notes?: string;
  driverId?: string;
  auto: boolean;
}

export interface ApplyToShortfallOptions {
  acknowledgedPlatformMismatch?: boolean;
}

interface RefundResolutionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: RefundTripLike | null;
  /** Leftover resolution suggestion (cash wash / phantom / etc.) — not primary. */
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

/**
 * Review drawer: primary path is Apply to underpaid (picker).
 * Cash wash / Phantom / Pending / Expense logged live under "Other ways to clear".
 */
export function RefundResolutionDrawer({
  open,
  onOpenChange,
  trip,
  suggestion,
  shortfallCandidates = [],
  drivers = [],
  onResolve,
  onApplyToShortfall,
}: RefundResolutionDrawerProps) {
  const [selectedShortfallKey, setSelectedShortfallKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<RefundResolutionType | null>(null);
  const [notes, setNotes] = useState("");
  const [driverId, setDriverId] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [otherOpen, setOtherOpen] = useState(false);
  const [acknowledgedMismatch, setAcknowledgedMismatch] = useState(false);

  const amount = useMemo(() => Math.abs(trip?.tollCharges ?? 0), [trip]);

  const rankedCandidates = useMemo(
    () => [...shortfallCandidates].sort((a, b) => b.confidence - a.confidence),
    [shortfallCandidates],
  );

  // Reset when trip changes; auto-select top recommended shortfall once candidates are present.
  useEffect(() => {
    setSelected(null);
    setNotes("");
    setDriverId(trip?.driverId ?? undefined);
    setOtherOpen(false);
    setAcknowledgedMismatch(false);
    const recommended =
      rankedCandidates.find((c) => isRecommendedUnlinkedShortfall(c, trip?.platform)) ??
      rankedCandidates.find((c) => !isUnlinkedShortfallPlatformMismatch(c, trip?.platform)) ??
      rankedCandidates[0] ??
      null;
    setSelectedShortfallKey(recommended ? candidateKey(recommended) : null);
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
    if (!trip || !selectedCandidate || !onApplyToShortfall) return;
    if (selectedMismatch && !acknowledgedMismatch) return;
    setSubmitting(true);
    try {
      await onApplyToShortfall(trip.id, selectedCandidate, {
        acknowledgedPlatformMismatch: selectedMismatch ? acknowledgedMismatch : undefined,
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
            Apply this credit to an underpaid toll, or use another way to clear it.
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
              <p className="text-sm text-slate-500 rounded-lg border border-dashed border-slate-200 p-3">
                No underpaid tolls found for this driver — use Other ways to clear below.
              </p>
            ) : (
              <div className="space-y-2">
                {rankedCandidates.map((c) => {
                  const key = candidateKey(c);
                  const active = selectedShortfallKey === key;
                  const recommended = isRecommendedUnlinkedShortfall(c, trip.platform);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setSelectedShortfallKey(key);
                        setSelected(null);
                        setAcknowledgedMismatch(false);
                      }}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                        active ? "border-orange-400 bg-orange-50/60" : "border-slate-200 hover:border-orange-300",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1 h-4 w-4 shrink-0 rounded-full border",
                          active ? "border-orange-600 bg-orange-600 ring-2 ring-orange-100" : "border-slate-300",
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
                          {c.leftoverShortfall > 0.05
                            ? ` · leftover $${c.leftoverShortfall.toFixed(2)} after apply`
                            : " · fully covered"}
                        </span>
                        {(c.platformMismatch ||
                          platformsMismatch(c.tripPlatform || trip.platform, c.tollPlatform)) && (
                          <span className="mt-1 inline-flex text-[10px] font-semibold text-amber-700">
                            Platform differs from refund
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
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
              {suggestion && suggestion.confidence >= 40 && (
                <p className="text-xs text-slate-500 px-0.5">
                  System hint: {REFUND_RESOLUTION_META[suggestion.type]?.label} ({suggestion.confidence}%) — {suggestion.reason}
                </p>
              )}
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
