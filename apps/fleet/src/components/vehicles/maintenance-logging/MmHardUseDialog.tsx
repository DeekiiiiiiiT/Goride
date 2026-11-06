import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Switch } from "../../ui/switch";

const MM_DIALOG_LAYER = "z-[60]";

export function MmHardUseDialog({
  open,
  onOpenChange,
  vehicleId,
  plate,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  plate: string;
  initial: boolean;
  onSaved: (severe: boolean) => void;
}) {
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setOn(initial);
  }, [open, initial]);

  const save = async () => {
    setBusy(true);
    try {
      await api.patchVehicleSevereDuty(vehicleId, { severe_duty: on, reason: "fleet maintenance" });
      onSaved(on);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MM_DIALOG_LAYER} overlayClassName={MM_DIALOG_LAYER} data-testid="mm-hard-use-dialog">
        <DialogHeader>
          <DialogTitle>Hard use · {plate}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600 bg-slate-100 rounded-lg p-3">
          Taxi, delivery and heavy-traffic cars wear faster. Car makers give shorter severe duty schedules for them.
        </p>
        <label className="flex items-center justify-between gap-4 py-2">
          <span className="text-sm font-medium">This car is in hard use</span>
          <Switch checked={on} onCheckedChange={setOn} />
        </label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={busy} onClick={() => void save()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
