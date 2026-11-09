import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "../../../ui/button";
import {
  Dialog,
  DialogContent,
} from "../../../ui/dialog";
import { LOG_SERVICE_COPY } from "./logServiceCopy";

export type LogServiceVehicleOption = {
  vehicleId: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: string;
  fleetStatus?: string;
  odometer?: number;
  odometerMeta?: { reading?: number; sourceLabel?: string } | null;
};

function vehicleTitle(row: LogServiceVehicleOption): string {
  const name = [row.make, row.model, row.year ? `(${row.year})` : ""].filter(Boolean).join(" ").trim();
  return name || row.licensePlate || row.vehicleId;
}

function statusChip(status?: string): { label: string; className: string } {
  const s = (status ?? "").toLowerCase();
  if (s.includes("overdue")) {
    return { label: "Overdue", className: "bg-error-container text-on-error-container" };
  }
  if (s.includes("odometer")) {
    return { label: "Odometer needed", className: "bg-surface-container-high text-on-surface-variant" };
  }
  if (s.includes("due")) {
    return { label: "Due soon", className: "bg-secondary-container text-on-secondary-container" };
  }
  return { label: "OK", className: "bg-surface-container text-on-surface-variant" };
}

export function LogServiceWhichCarDialog({
  open,
  onOpenChange,
  vehicles,
  loading,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicles: LogServiceVehicleOption[];
  loading?: boolean;
  onContinue: (vehicleId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => {
      const blob = [v.licensePlate, v.make, v.model, v.year, v.vehicleId].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [search, vehicles]);

  React.useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedId("");
      return;
    }
    if (!selectedId && vehicles[0]?.vehicleId) {
      setSelectedId(vehicles[0].vehicleId);
    }
  }, [open, vehicles, selectedId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideCloseButton className="sm:max-w-[620px] p-0 gap-0 overflow-hidden">
        <div className="px-6 pt-6 pb-3 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-on-surface tracking-tight">{LOG_SERVICE_COPY.whichCarTitle}</h1>
            <p className="text-sm text-stitch-secondary mt-0.5">{LOG_SERVICE_COPY.whichCarSubtitle}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-6 pb-4">
          <div className="relative flex items-center rounded-xl shadow-sm focus-within:shadow-md transition-shadow">
            <span className="material-symbols-outlined absolute left-3 text-stitch-secondary text-[20px] pointer-events-none">
              search
            </span>
            <input
              className="w-full h-11 pl-11 pr-3 bg-surface-container-low hover:bg-surface-container/60 rounded-xl text-sm text-on-surface placeholder:text-stitch-secondary outline-none"
              placeholder={LOG_SERVICE_COPY.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="px-6 space-y-3 max-h-[380px] overflow-y-auto pb-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-stitch-secondary py-6 text-center">No vehicles match your search.</p>
          ) : (
            filtered.map((row) => {
              const selected = selectedId === row.vehicleId;
              const chip = statusChip(row.fleetStatus);
              const odo = row.odometerMeta?.reading ?? row.odometer ?? 0;
              return (
                <label
                  key={row.vehicleId}
                  className={`relative flex items-center justify-between p-4 rounded-xl cursor-pointer transition-all ${
                    selected
                      ? "bg-surface-container-lowest shadow-md ring-2 ring-primary"
                      : "bg-surface-container-low hover:shadow-sm"
                  }`}
                >
                  <input
                    type="radio"
                    name="log-service-vehicle"
                    className="sr-only"
                    checked={selected}
                    onChange={() => setSelectedId(row.vehicleId)}
                  />
                  <div className="flex items-center gap-4 min-w-0">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                        selected ? "bg-primary text-on-primary" : "border-2 border-outline"
                      }`}
                    >
                      {selected ? (
                        <span className="material-symbols-outlined text-[14px] font-bold">check</span>
                      ) : null}
                    </div>
                    <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[20px]">directions_car</span>
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-on-surface truncate">{vehicleTitle(row)}</div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {row.licensePlate ? (
                          <span className="font-mono text-xs font-bold tracking-wider bg-surface-container px-1.5 py-0.5 rounded">
                            {row.licensePlate}
                          </span>
                        ) : null}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${chip.className}`}>
                          {chip.label}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <div className="font-mono text-sm font-bold text-on-surface">
                      {odo > 0 ? `${odo.toLocaleString()} km` : "—"}
                    </div>
                    {row.odometerMeta?.sourceLabel ? (
                      <div className="text-[10px] text-stitch-secondary">{row.odometerMeta.sourceLabel}</div>
                    ) : null}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-surface-container flex justify-end gap-2 bg-surface-container-lowest">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!selectedId || loading}
            onClick={() => {
              if (!selectedId) return;
              onContinue(selectedId);
            }}
          >
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
