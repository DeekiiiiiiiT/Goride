import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "../../ui/responsive-dialog";

export function LogOdometerDialog({
  open,
  onOpenChange,
  vehicleId,
  vehicleLabel,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  vehicleLabel: string;
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
      onSaved?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save reading");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Log odometer</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <p className="text-sm text-muted-foreground">{vehicleLabel}</p>
        <div className="space-y-4 py-2">
          <div>
            <Label htmlFor="odo-date">Date</Label>
            <Input id="odo-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="odo-km">Odometer (km) *</Label>
            <Input
              id="odo-km"
              type="number"
              min={1}
              value={reading}
              onChange={(e) => setReading(e.target.value)}
            />
          </div>
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save reading
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
