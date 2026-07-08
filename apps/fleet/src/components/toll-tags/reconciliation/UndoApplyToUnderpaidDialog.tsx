import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../ui/alert-dialog";
import { Button } from "../../ui/button";
import { normalizePlatform } from "../../../utils/normalizePlatform";

export interface UndoApplySummary {
  tripId: string;
  tripRefund: number;
  tripPlatform?: string | null;
  tollAmount?: number | null;
  tollLocation?: string | null;
  priorClaimStatus?: string | null;
  priorResolutionReason?: string | null;
  willReinstateDriverCharge?: boolean;
}

/**
 * Confirm undo for an Apply-to-Underpaid resolution. One confirm; lists consequences.
 */
export function UndoApplyToUnderpaidDialog({
  summary,
  onConfirm,
  disabled,
  triggerLabel = "Undo",
}: {
  summary: UndoApplySummary;
  onConfirm: () => Promise<void> | void;
  disabled?: boolean;
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const platform = normalizePlatform(summary.tripPlatform || undefined);
  const tollLabel = summary.tollLocation || "underpaid toll";
  const tollAmt =
    typeof summary.tollAmount === "number" ? `$${summary.tollAmount.toFixed(2)} ` : "";
  const prior =
    summary.priorResolutionReason ||
    summary.priorClaimStatus ||
    "previous open status";

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            Undo Applied Refund
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                <span className="font-semibold text-slate-800">
                  ${Math.abs(summary.tripRefund).toFixed(2)}
                </span>{" "}
                from a {platform} trip was applied to the {tollAmt}
                {tollLabel}.
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-slate-700">
                <li>Trip returns to Unlinked Refunds</li>
                <li>
                  Claim reverts to: <span className="font-medium">{prior}</span>
                </li>
                {summary.willReinstateDriverCharge && (
                  <li className="text-amber-800 font-medium">
                    Driver charge will reinstate on Driver Financials
                  </li>
                )}
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleConfirm();
            }}
            disabled={busy}
            className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-600"
          >
            {busy ? "Undoing…" : "Confirm Undo"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
