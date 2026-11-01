import React, { useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
} from "../../ui/responsive-dialog";

export function LogOdometerDialog({
  open,
  onOpenChange,
  vehicleId,
  vehicleLabel,
  licensePlate,
  vin,
  hasReading,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  vehicleLabel: string;
  licensePlate?: string;
  vin?: string;
  hasReading?: boolean;
  onSaved?: () => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reading, setReading] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const km = Number(reading);
    if (!Number.isFinite(km) || km <= 0) {
      toast.error("Enter a valid odometer reading");
      return;
    }
    setSaving(true);
    try {
      await api.addOdometerReading({
        vehicleId,
        odometer: km,
        value: km,
        date,
        source: "manual",
      });
      toast.success("Reading saved");
      onOpenChange(false);
      setReading("");
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save reading");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden">
        <div className="px-6 pt-6 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center text-primary">
              <span className="material-symbols-outlined text-[18px]">speed</span>
            </div>
            <h2 className="text-lg font-bold text-on-surface tracking-tight">Log odometer</h2>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mx-6 mb-4 p-3 bg-surface-container-low rounded-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded bg-surface-container-highest/60 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[22px]">directions_car</span>
            </div>
            <div className="min-w-0">
              <span className="font-semibold text-on-surface block truncate">{vehicleLabel}</span>
              <div className="flex items-center gap-1 flex-wrap mt-0.5">
                {licensePlate ? (
                  <span className="font-mono text-xs font-bold bg-surface-container px-1.5 py-0.5 rounded tracking-wider">
                    {licensePlate}
                  </span>
                ) : null}
                {vin ? (
                  <span className="text-[11px] text-stitch-secondary">· Chassis #{vin}</span>
                ) : null}
              </div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-variant text-on-surface-variant text-[11px] font-semibold shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-stitch-secondary" />
            {hasReading ? "Has reading" : "No reading yet"}
          </span>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="odo-date" className="text-sm font-semibold flex justify-between">
              <span>Date</span>
              <span className="text-[11px] font-normal text-stitch-secondary">Eastern Standard Time</span>
            </Label>
            <Input
              id="odo-date"
              type="date"
              className="font-mono bg-surface-container-lowest"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="odo-km" className="text-sm font-semibold">
              Odometer (km) *
            </Label>
            <Input
              id="odo-km"
              type="number"
              min={1}
              className="font-mono text-lg bg-surface-container-lowest"
              placeholder="Enter current km"
              value={reading}
              onChange={(e) => setReading(e.target.value)}
            />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-surface-container flex justify-end gap-2 bg-surface-container-lowest">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2 font-semibold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save reading
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
