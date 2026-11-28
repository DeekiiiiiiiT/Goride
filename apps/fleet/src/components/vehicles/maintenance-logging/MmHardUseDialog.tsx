/**
 * Step 16d (28 Nov 2026): "Change for this car". Roam decides hard use every night from how far the car drives
 * against the average-use baseline (and short trips). The fleet can keep normal or shorter schedules for a while,
 * with a reason (at least 10 characters), or hand the car back to Roam. The server writes who, when and why to the
 * maintenance audit log. Replaces the step-12 Turn on / Turn off dialog.
 */
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../services/api";
import type { HardUseMode, VehicleHardUse } from "../../../types/hardUse";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { HARD_USE_REASON_MIN, hardUseChoices, hardUseLine, hardUseSaveProblem, hardUseTitle } from "./hardUseModel";

const MM_DIALOG_LAYER = "z-[60]";

function choiceText(mode: HardUseMode, v: VehicleHardUse | null): { title: string; line: string } {
  const normalDays = v?.policy?.keptNormalDays ?? 90;
  const hardDays = v?.policy?.keptHardDays ?? 90;
  if (mode === "auto") return { title: "Let Roam decide", line: "Roam checks every night from how far the car drives." };
  if (mode === "keep_normal") {
    return { title: "Use normal schedules", line: `For ${normalDays} days, then Roam decides again. Some parts come due later.` };
  }
  return { title: "Use shorter schedules", line: `For ${hardDays} days, then Roam decides again. Some parts come due sooner.` };
}

export function MmHardUseDialog({
  open,
  onOpenChange,
  vehicleId,
  plate,
  carName,
  current,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  plate: string;
  /** "Toyota Roomy 2018" under the plate. */
  carName?: string;
  /** Roam's decision now (null while it loads). */
  current: VehicleHardUse | null;
  onSaved: (next: VehicleHardUse) => void;
}) {
  const choices = hardUseChoices(current);
  const [mode, setMode] = useState<HardUseMode | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(null);
      setReason("");
    }
  }, [open]);

  const problem = hardUseSaveProblem(mode, reason);
  const needsReason = mode === "keep_normal" || mode === "keep_hard";

  const save = async () => {
    if (!mode || problem) return;
    setBusy(true);
    try {
      const next = await api.patchVehicleHardUse(vehicleId, { mode, reason: needsReason ? reason.trim() : undefined });
      toast.success(mode === "auto" ? "Roam decides again" : "Saved");
      onSaved(next);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${MM_DIALOG_LAYER} sm:max-w-[520px]`} overlayClassName={MM_DIALOG_LAYER} data-testid="mm-hard-use-dialog">
        <DialogHeader>
          <DialogTitle>Change for this car</DialogTitle>
        </DialogHeader>
        <p className="flex flex-wrap items-center gap-2 text-[15px] text-slate-700">
          <span className="rounded-md bg-[#e6eeff] px-2 py-0.5 font-mono text-[13px] font-semibold text-[#0b1c30]">{plate}</span>
          {carName ? <span>{carName}</span> : null}
        </p>
        <div className="rounded-xl bg-slate-50 p-3 text-[14px] text-slate-700" data-testid="mm-hard-use-now">
          <p className="font-semibold text-slate-900">{hardUseTitle(current)}</p>
          {hardUseLine(current) ? <p className="mt-0.5">{hardUseLine(current)}</p> : null}
        </div>
        <div className="flex flex-col gap-2" role="radiogroup" aria-label="Schedules for this car">
          {choices.map((m) => {
            const t = choiceText(m, current);
            const selected = mode === m;
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setMode(m)}
                data-testid={`mm-hard-use-choice-${m}`}
                className={
                  "flex min-h-[56px] w-full flex-col items-start rounded-xl border px-4 py-3 text-left " +
                  (selected ? "border-slate-900 bg-[#eff4ff]" : "border-slate-200 bg-white hover:bg-slate-50")
                }
              >
                <span className="text-[15px] font-semibold text-slate-900">{t.title}</span>
                <span className="text-[13px] text-slate-600">{t.line}</span>
              </button>
            );
          })}
        </div>
        {needsReason ? (
          <label className="block">
            <span className="text-[14px] font-medium">Why?</span>
            <textarea
              className="mt-1 min-h-[88px] w-full rounded-lg border border-slate-300 p-3 text-[15px]"
              placeholder={mode === "keep_normal" ? "For example: car moved to private use" : "For example: tows a trailer every day"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="mm-hard-use-reason"
            />
            <span className={`text-[13px] ${reason && problem ? "text-red-700" : "text-slate-500"}`}>
              At least {HARD_USE_REASON_MIN} characters
            </span>
          </label>
        ) : null}
        <p className="text-[13px] text-slate-500">Saved with your name and today's date.</p>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            className="h-11 bg-black text-white hover:bg-black/90"
            disabled={busy || !!problem}
            onClick={() => void save()}
            data-testid="mm-hard-use-save"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
