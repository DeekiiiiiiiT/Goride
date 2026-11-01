import React, { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../../ui/sheet";

type DueRow = {
  category_name?: string;
  category_code?: string;
  position?: string | null;
  due_status?: string;
  km_overdue?: number | null;
  days_overdue?: number | null;
};

function vehicleLabel(row: {
  make?: string;
  model?: string;
  year?: string;
  licensePlate?: string;
  vehicleId: string;
}): string {
  const name = [row.make, row.model, row.year ? `(${row.year})` : ""].filter(Boolean).join(" ");
  const plate = row.licensePlate?.trim();
  if (name && plate) return `${name} · ${plate}`;
  return plate || name || row.vehicleId;
}

export function MaintenanceDueItemsDrawer({
  open,
  onOpenChange,
  vehicle,
  onLogService,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: {
    vehicleId: string;
    licensePlate?: string;
    make?: string;
    model?: string;
    year?: string;
    odometer?: number;
    odometerMeta?: { sourceLabel?: string; recordedAt?: string } | null;
  } | null;
  onLogService?: (vehicleId: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<DueRow[]>([]);

  useEffect(() => {
    if (!open || !vehicle?.vehicleId) {
      setItems([]);
      return;
    }
    setLoading(true);
    api
      .getMaintenanceDueItems(vehicle.vehicleId)
      .then((res) => setItems((res.items || []) as DueRow[]))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [open, vehicle?.vehicleId]);

  if (!vehicle) return null;

  const overdue = items.filter((i) => i.due_status === "overdue");
  const dueSoon = items.filter((i) => i.due_status === "due_soon");
  const ok = items.filter((i) => i.due_status === "ok");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-start justify-between gap-2">
            <span>{vehicleLabel(vehicle)}</span>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-4 w-4" />
            </Button>
          </SheetTitle>
          <p className="text-sm text-muted-foreground">
            {vehicle.odometer ? `${vehicle.odometer.toLocaleString()} km` : "—"}
            {vehicle.odometerMeta?.recordedAt
              ? ` · ${vehicle.odometerMeta.recordedAt.slice(0, 10)}`
              : ""}
            {vehicle.odometerMeta?.sourceLabel ? ` · ${vehicle.odometerMeta.sourceLabel}` : ""}
          </p>
        </SheetHeader>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border p-2">
                <div className="font-semibold text-red-600">{overdue.length}</div>
                CRITICAL
              </div>
              <div className="rounded-lg border p-2">
                <div className="font-semibold text-amber-600">{dueSoon.length}</div>
                IMPENDING
              </div>
              <div className="rounded-lg border p-2">
                <div className="font-semibold">{ok.length}</div>
                COMPLIANT
              </div>
            </div>

            {overdue.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Overdue · Immediate maintenance required</h3>
                <ul className="space-y-3">
                  {overdue.map((row, idx) => (
                    <li
                      key={`o-${idx}`}
                      className="border rounded-lg p-3 border-red-200 bg-red-50/50 dark:bg-red-950/20"
                    >
                      <div className="font-medium">{row.category_name || row.category_code}</div>
                      {row.km_overdue != null ? (
                        <div className="text-xs text-red-700 mt-1">
                          Overdue {Number(row.km_overdue).toLocaleString()} km
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {onLogService ? (
              <Button className="w-full" onClick={() => onLogService(vehicle.vehicleId)}>
                Log service for this car
              </Button>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
