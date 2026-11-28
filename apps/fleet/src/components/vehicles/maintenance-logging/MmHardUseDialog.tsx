/**
 * Hard use on one car (maintenance step 12, MER-25), ported from
 * docs/stitch/maintenance-rebuild-fleet/maintenance_turn_off_hard_use ("in audit records" dropped, Round 2).
 *
 * Turning hard use OFF asks why (at least 10 characters); the server refuses without it and writes who, when and
 * why to the maintenance audit log. Turning it ON needs no reason. The old dialog sent the fixed reason
 * "fleet maintenance" and the server threw it away.
 *
 * Not drawn: Stitch's grey "Engine oil: every 5,000 km → every 10,000 km" box. The rules do not carry separate
 * hard-use numbers yet (0 of 21 had them in the review), so the box would show invented numbers.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";

const MM_DIALOG_LAYER = "z-[60]";

/** The words that stop Turn off, or null (same rule as the server). */
export function hardUseOffReasonProblem(reason: string): string | null {
  return reason.trim().length >= 10 ? null : "At least 10 characters";
}

export function MmHardUseDialog({
  open,
  onOpenChange,
  vehicleId,
  plate,
  carName,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  plate: string;
  /** "Toyota Roomy 2018" under the plate. */
  carName?: string;
  /** Hard use now. The dialog offers the other choice. */
  initial: boolean;
  onSaved: (severe: boolean) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const turningOff = initial;

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const save = async () => {
    if (turningOff && hardUseOffReasonProblem(reason)) return;
    setBusy(true);
    try {
      await api.patchVehicleSevereDuty(vehicleId, {
        severe_duty: !turningOff,
        reason: turningOff ? reason.trim() : "Hard use turned on",
      });
      toast.success(turningOff ? "Hard use turned off" : "Hard use turned on");
      onSaved(!turningOff);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const problem = turningOff ? hardUseOffReasonProblem(reason) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${MM_DIALOG_LAYER} sm:max-w-[520px]`} overlayClassName={MM_DIALOG_LAYER} data-testid="mm-hard-use-dialog">
        <DialogHeader>
          <DialogTitle>{turningOff ? "Turn off hard use?" : "Turn on hard use?"}</DialogTitle>
        </DialogHeader>
        <p className="flex flex-wrap items-center gap-2 text-[15px] text-slate-700">
          <span className="rounded-md bg-[#e6eeff] px-2 py-0.5 font-mono text-[13px] font-semibold text-[#0b1c30]">{plate}</span>
          {carName ? <span>{carName}</span> : null}
        </p>
        <p className="text-[15px] text-slate-800">
          {turningOff
            ? "This car will use the normal schedules. Some parts will come due later."
            : "This car will use the shorter schedules for taxi, ride-hail, delivery or heavy traffic. Some parts will come due sooner."}
        </p>
        {turningOff ? (
          <label className="block">
            <span className="text-[14px] font-medium">Why?</span>
            <textarea
              className="mt-1 min-h-[88px] w-full rounded-lg border border-slate-300 p-3 text-[15px]"
              placeholder="For example: car moved to private use"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="mm-hard-use-reason"
            />
            <span className={`text-[13px] ${reason && problem ? "text-red-700" : "text-slate-500"}`}>At least 10 characters</span>
          </label>
        ) : null}
        <p className="text-[13px] text-slate-500">Saved with your name and today's date.</p>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            {turningOff ? "Keep hard use" : "Cancel"}
          </Button>
          <Button
            type="button"
            className={`h-11 ${turningOff ? "bg-red-600 text-white hover:bg-red-700" : "bg-black text-white hover:bg-black/90"}`}
            disabled={busy || !!problem}
            onClick={() => void save()}
            data-testid="mm-hard-use-save"
          >
            {turningOff ? "Turn off" : "Turn on"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
