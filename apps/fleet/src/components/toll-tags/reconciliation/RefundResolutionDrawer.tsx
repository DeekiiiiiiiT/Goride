import React, { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "../../ui/sheet";
import { Button } from "../../ui/button";
import { Textarea } from "../../ui/textarea";
import { Sparkles } from "lucide-react";
import { cn } from "../../ui/utils";
import { DriverPicker, DriverOption } from "../../ui/DriverPicker";
import {
  RefundResolutionType,
  RefundSuggestion,
  RefundTripLike,
  REFUND_RESOLUTION_META,
  REFUND_RESOLUTION_ORDER,
} from "./refundResolutionShell";

export interface RefundResolutionPayload {
  tripId: string;
  resolution: RefundResolutionType;
  notes?: string;
  driverId?: string;
  auto: boolean;
}

interface RefundResolutionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: RefundTripLike | null;
  suggestion?: RefundSuggestion | null;
  /** Driver list for the picker when the trip has no driver. */
  drivers?: DriverOption[];
  onResolve: (payload: RefundResolutionPayload) => Promise<void> | void;
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

/**
 * Refund Resolution Drawer (Phase 1 shell).
 *
 * Presents the automation's suggested resolution front-and-center (one-tap
 * accept) with a manual fallback list. Fully interactive UI; the actual
 * persistence is delegated to `onResolve` (wired in Phase 3).
 */
export function RefundResolutionDrawer({
  open,
  onOpenChange,
  trip,
  suggestion,
  drivers = [],
  onResolve,
}: RefundResolutionDrawerProps) {
  const [selected, setSelected] = useState<RefundResolutionType | null>(null);
  const [notes, setNotes] = useState("");
  const [driverId, setDriverId] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  // Reset local state whenever the target trip changes.
  useEffect(() => {
    setSelected(suggestion?.type ?? null);
    setNotes("");
    setDriverId(trip?.driverId ?? undefined);
  }, [trip?.id, suggestion?.type, trip?.driverId]);

  const amount = useMemo(() => Math.abs(trip?.tollCharges ?? 0), [trip]);

  // "Log cash expense" attributes cost to a driver — require one.
  const needsDriver = selected === "expense_logged" && !driverId;

  const submit = async (resolution: RefundResolutionType, auto: boolean) => {
    if (!trip) return;
    if (resolution === "expense_logged" && !driverId) return; // guarded by disabled state
    setSubmitting(true);
    try {
      await onResolve({ tripId: trip.id, resolution, notes: notes.trim() || undefined, driverId, auto });
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!trip) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0">
        <SheetHeader className="p-5 border-b border-slate-200">
          <SheetTitle className="text-lg text-slate-900">Resolve Unlinked Refund</SheetTitle>
          <SheetDescription>
            The platform reimbursed a toll on this trip, but no toll expense is linked.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Trip context */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-700">
                {trip.platform || "Unknown"}
              </span>
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

          {/* Suggested resolution banner */}
          {suggestion && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">
                  <Sparkles className="h-3.5 w-3.5" />
                </span>
                <div className="text-sm font-semibold text-indigo-900">
                  Suggested: {REFUND_RESOLUTION_META[suggestion.type].label}
                </div>
                <span className="ml-auto inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                  {suggestion.confidence}% confidence
                </span>
              </div>
              <p className="text-xs text-indigo-700 mt-2">{suggestion.reason}</p>
              <Button
                onClick={() => submit(suggestion.type, true)}
                disabled={submitting || (suggestion.type === "expense_logged" && !driverId)}
                className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700"
              >
                Accept suggestion
              </Button>
            </div>
          )}

          {/* Manual options */}
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wider text-slate-500">
              Or choose manually
            </div>
            {REFUND_RESOLUTION_ORDER.map((type) => {
              const meta = REFUND_RESOLUTION_META[type];
              const active = selected === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelected(type)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    active ? "border-indigo-400 bg-indigo-50/50" : "border-slate-200 hover:border-indigo-300",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1 h-4 w-4 shrink-0 rounded-full border",
                      active ? "border-indigo-600 bg-indigo-600 ring-2 ring-indigo-100" : "border-slate-300",
                    )}
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">{meta.label}</span>
                    <span className="block text-xs text-slate-500">{meta.description}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {/* Driver picker when logging a cash expense with no driver */}
          {selected === "expense_logged" && (
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                Assign driver
              </label>
              <p className="text-xs text-slate-500 mb-1.5">Required to attribute the cash toll expense.</p>
              <DriverPicker drivers={drivers} value={driverId} onChange={setDriverId} />
            </div>
          )}

          {/* Notes */}
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
        </div>

        <SheetFooter className="p-4 border-t border-slate-200 flex-row gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 bg-indigo-600 hover:bg-indigo-700"
            disabled={!selected || needsDriver || submitting}
            onClick={() => selected && submit(selected, false)}
          >
            Resolve
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
