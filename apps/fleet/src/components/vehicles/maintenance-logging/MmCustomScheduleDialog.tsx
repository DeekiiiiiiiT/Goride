import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import type { MmDueRow } from "./maintenanceMasterFleetUi";

const MM_DIALOG_LAYER = "z-[60]";

export function MmCustomScheduleDialog({
  open,
  onOpenChange,
  vehicleId,
  plate,
  row,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  plate: string;
  row: MmDueRow;
  onSaved: () => void;
}) {
  const [km, setKm] = useState("");
  const [months, setMonths] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setKm("");
    setMonths("");
    setReason("");
  }, [open, row.category_id, row.position]);

  const save = async () => {
    if (!row.category_id || !reason.trim()) {
      toast.error("Reason is required");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.patchMaintenanceCustomInterval(vehicleId, {
        category_id: String(row.category_id),
        position: row.position ?? null,
        custom_interval_km: km ? Number(km) : null,
        custom_interval_months: months ? Number(months) : null,
        reason: reason.trim(),
      });
      setError("");
      toast.success("Custom schedule saved");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Couldn't save the custom schedule. Nothing was changed.";
      setError(msg.includes("shorter") ? msg : msg);
      if (!msg.includes("shorter")) toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const revert = async () => {
    if (!row.category_id) return;
    setBusy(true);
    setError("");
    try {
      await api.clearMaintenanceCustomInterval(vehicleId, String(row.category_id), row.position ?? null);
      toast.success("Using Roam's schedule again");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not revert");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MM_DIALOG_LAYER} overlayClassName={MM_DIALOG_LAYER} data-testid="mm-custom-schedule">
        <DialogHeader>
          <DialogTitle>
            Custom schedule · {row.category_name} · {plate}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">Roam: every {row.interval_sentence ?? "—"}</p>
        {error ? (
          <p className="text-sm text-red-700" data-testid="mm-custom-schedule-error">
            {error}
          </p>
        ) : null}
        <div className="grid gap-3 py-2">
          <div>
            <Label htmlFor="mm-custom-km">Every (km)</Label>
            <Input id="mm-custom-km" value={km} onChange={(e) => setKm(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="mm-custom-mo">or every (months)</Label>
            <Input id="mm-custom-mo" value={months} onChange={(e) => setMonths(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="mm-custom-reason">Reason</Label>
            <Input id="mm-custom-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button type="button" disabled={busy} onClick={() => void save()}>
            Save custom schedule
          </Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => void revert()}>
            Go back to Roam&apos;s schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
