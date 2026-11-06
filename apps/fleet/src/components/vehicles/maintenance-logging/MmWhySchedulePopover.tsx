import React, { useEffect, useState } from "react";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../ui/dialog";
import { mmSourceLabel, type MmDueRow } from "./maintenanceMasterFleetUi";

const MM_DIALOG_LAYER = "z-[60]";

export function MmWhySchedulePopover({
  open,
  onOpenChange,
  vehicleId,
  plate,
  row,
  onSetCustom,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  plate: string;
  row: MmDueRow;
  onSetCustom: () => void;
}) {
  const [explain, setExplain] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!open || !row.category_id) return;
    void api
      .getMaintenanceScheduleExplain(vehicleId, String(row.category_id), row.position ?? null)
      .then(setExplain)
      .catch(() => setExplain(null));
  }, [open, vehicleId, row.category_id, row.position]);

  const title = `${row.category_name || row.category_code} · ${plate}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-md ${MM_DIALOG_LAYER}`} overlayClassName={MM_DIALOG_LAYER} data-testid="mm-why-schedule">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-700">
          Roam&apos;s schedule for everyone: {String(explain?.interval_sentence ?? row.interval_sentence ?? "—")}, whichever comes first.
        </p>
        <dl className="text-sm space-y-2 mt-4">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Comes from</dt>
            <dd>{String(explain?.scope_label ?? "Everyone")}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Source</dt>
            <dd>{mmSourceLabel(String(explain?.source_type ?? row.source_type))}</dd>
          </div>
        </dl>
        <Button type="button" variant="link" className="px-0" onClick={onSetCustom}>
          Set custom schedule
        </Button>
      </DialogContent>
    </Dialog>
  );
}
