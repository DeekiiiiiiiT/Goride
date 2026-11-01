import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../services/api";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Sheet, SheetContent } from "../../ui/sheet";

type OdometerHistoryRow = {
  id: string;
  reading?: number;
  recorded_at?: string;
  source?: string;
  is_anomaly?: boolean;
  is_verified?: boolean;
  reference_type?: string | null;
  reference_label?: string | null;
  anomaly_note?: string | null;
};

function vehicleTitle(row: {
  make?: string;
  model?: string;
  year?: string;
  licensePlate?: string;
  vehicleId: string;
}): string {
  const name = [row.make, row.model, row.year ? `(${row.year})` : ""].filter(Boolean).join(" ").trim();
  return name || row.licensePlate || row.vehicleId;
}

function formatReadingDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function OdometerHistoryDrawer({
  open,
  onOpenChange,
  vehicle,
  onChanged,
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
    odometerMeta?: {
      reading?: number;
      recordedAt?: string;
      source?: string;
      sourceLabel?: string;
    } | null;
  } | null;
  onChanged?: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<OdometerHistoryRow[]>([]);
  const [sourceFilter, setSourceFilter] = useState<"all" | "flagged" | string>("all");
  const [voidId, setVoidId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!vehicle?.vehicleId) return;
    setLoading(true);
    try {
      const filters =
        sourceFilter === "flagged"
          ? { flagged: true }
          : sourceFilter !== "all"
            ? { source: sourceFilter }
            : undefined;
      const res = await api.getMaintenanceOdometerHistory(vehicle.vehicleId, filters);
      setItems((res.items || []) as OdometerHistoryRow[]);
    } catch {
      setItems([]);
      toast.error("Failed to load odometer history");
    } finally {
      setLoading(false);
    }
  }, [vehicle?.vehicleId, sourceFilter]);

  useEffect(() => {
    if (open && vehicle?.vehicleId) void load();
    if (!open) {
      setVoidId(null);
      setVoidReason("");
    }
  }, [open, vehicle?.vehicleId, load]);

  const currentReading = vehicle?.odometerMeta?.reading ?? vehicle?.odometer ?? 0;
  const flaggedCount = useMemo(() => items.filter((i) => i.is_anomaly).length, [items]);

  const handleAccept = async (id: string) => {
    setActing(true);
    try {
      await api.acceptMaintenanceOdometerReading(id);
      toast.success("Reading accepted");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to accept reading");
    } finally {
      setActing(false);
    }
  };

  const handleVoid = async (id: string) => {
    const reason = voidReason.trim();
    if (!reason) {
      toast.error("Enter a reason for voiding");
      return;
    }
    setActing(true);
    try {
      await api.voidMaintenanceOdometerReading(id, reason);
      toast.success("Reading voided");
      setVoidId(null);
      setVoidReason("");
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to void reading");
    } finally {
      setActing(false);
    }
  };

  if (!vehicle) return null;

  const sourcePills: Array<{ key: "all" | "flagged" | string; label: string; count?: number }> = [
    { key: "all", label: "All", count: items.length },
    { key: "flagged", label: "Check reading", count: flaggedCount },
    { key: "fuel", label: "Fuel" },
    { key: "check-in", label: "Check-in" },
    { key: "service", label: "Service" },
    { key: "manual", label: "Manual" },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[600px] p-0 flex flex-col overflow-hidden">
        <div className="h-1 bg-primary w-full shrink-0" />
        <div className="px-6 py-4 flex items-start justify-between shrink-0">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-surface-container-high flex items-center justify-center">
                <span className="material-symbols-outlined text-[18px]">directions_car</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold text-on-surface">{vehicleTitle(vehicle)}</h2>
                {vehicle.licensePlate ? (
                  <span className="font-mono text-xs font-bold bg-surface-container px-2 py-0.5 rounded tracking-wider">
                    {vehicle.licensePlate}
                  </span>
                ) : null}
              </div>
            </div>
            <p className="text-sm text-stitch-secondary pl-10">Odometer history & verified readings log</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close drawer">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-4">
          <div className="bg-surface-container-low rounded-xl p-4 shadow-sm flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-primary" />
                <span className="text-[11px] uppercase tracking-wider font-semibold text-stitch-secondary">
                  Current Odometer
                </span>
              </div>
              <span className="font-mono text-[11px] bg-surface-container-highest px-2 py-0.5 rounded text-on-surface-variant">
                Trusted reading
              </span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-2xl font-bold text-on-surface">
                {currentReading > 0 ? currentReading.toLocaleString() : "—"}
              </span>
              <span className="font-mono text-sm text-stitch-secondary">km</span>
            </div>
            {vehicle.odometerMeta?.recordedAt ? (
              <p className="text-sm text-stitch-secondary flex items-center gap-1 flex-wrap">
                <span className="material-symbols-outlined text-[15px]">verified</span>
                Latest trusted reading ·{" "}
                <span className="font-mono text-on-surface font-medium">
                  {formatReadingDate(vehicle.odometerMeta.recordedAt)}
                </span>
                {vehicle.odometerMeta.source ? (
                  <>
                    ·{" "}
                    <span className="font-mono text-[10px] uppercase bg-surface-container px-1.5 py-0.5 rounded">
                      {vehicle.odometerMeta.source}
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-stitch-secondary">
                Audit Stream Filter
              </span>
              <span className="font-mono text-[11px] text-stitch-secondary">Total: {items.length} logs</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sourcePills.map((pill) => {
                const active = sourceFilter === pill.key;
                return (
                  <button
                    key={pill.key}
                    type="button"
                    className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-1 transition-all ${
                      active
                        ? "bg-primary text-on-primary font-semibold shadow-sm"
                        : pill.key === "flagged"
                          ? "bg-amber-100 text-amber-950 font-semibold"
                          : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                    }`}
                    onClick={() => setSourceFilter(pill.key)}
                  >
                    {pill.key === "flagged" ? (
                      <span className="material-symbols-outlined text-[15px]">warning</span>
                    ) : null}
                    {pill.label}
                    {pill.count != null ? (
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-black/10">
                        {pill.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-stitch-secondary" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-stitch-secondary text-center py-8">No readings for this filter.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-stitch-secondary">
                  Sequential Mileage Record
                </span>
                <span className="text-[11px] text-stitch-secondary">Order: Descending</span>
              </div>
              {items.map((row) => {
                const km = Number(row.reading ?? 0);
                const anomaly = Boolean(row.is_anomaly);
                return (
                  <div
                    key={row.id}
                    className={`rounded-xl p-3 shadow-sm flex flex-col gap-2 ${
                      anomaly ? "bg-amber-50 dark:bg-amber-950/20" : "bg-surface-container-lowest hover:bg-surface-container-low"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-stitch-secondary">
                          {formatReadingDate(row.recorded_at)}
                        </span>
                        {row.source ? (
                          <span className="font-mono text-[10px] uppercase bg-surface-container px-2 py-0.5 rounded text-stitch-secondary">
                            {row.source}
                          </span>
                        ) : null}
                      </div>
                      {anomaly ? (
                        <span className="flex items-center gap-1 bg-amber-100 text-amber-950 px-2 py-0.5 rounded text-[11px] font-semibold">
                          <span className="material-symbols-outlined text-[14px]">warning</span>
                          Check reading
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 font-mono text-[11px] font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          Trusted
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline gap-1">
                        <span className="font-mono text-lg font-bold">{km.toLocaleString()}</span>
                        <span className="font-mono text-[11px] text-stitch-secondary">km</span>
                      </div>
                      {row.reference_label || row.reference_type ? (
                        <span className="text-[11px] text-stitch-secondary truncate max-w-[45%]">
                          {row.reference_label ?? row.reference_type}
                        </span>
                      ) : null}
                    </div>
                    {anomaly ? (
                      <div className="flex flex-col gap-2 pt-1">
                        <div className="flex items-center justify-between bg-surface-container-lowest/60 p-2 rounded-lg gap-2">
                          <span className="text-[11px] text-stitch-secondary flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">psychology_alt</span>
                            {row.anomaly_note || "Reading flagged for review"}
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              className="px-2.5 py-1 rounded bg-surface-container-lowest hover:bg-surface-container text-on-surface text-[11px] font-semibold shadow-sm flex items-center gap-1"
                              disabled={acting}
                              onClick={() => void handleAccept(row.id)}
                            >
                              <span className="material-symbols-outlined text-[13px]">check</span>
                              It&apos;s correct
                            </button>
                            <button
                              type="button"
                              className="px-2.5 py-1 rounded text-error hover:bg-error-container text-[11px] font-semibold flex items-center gap-1"
                              disabled={acting}
                              onClick={() => {
                                setVoidId(row.id);
                                setVoidReason("");
                              }}
                            >
                              <span className="material-symbols-outlined text-[13px]">block</span>
                              Void
                            </button>
                          </div>
                        </div>
                        {voidId === row.id ? (
                          <div className="flex flex-col gap-1">
                            <label className="text-[11px] text-stitch-secondary">
                              Select reason for voiding reading:
                            </label>
                            <div className="flex items-center gap-2">
                              <Input
                                className="flex-1 h-8 text-sm"
                                value={voidReason}
                                onChange={(e) => setVoidReason(e.target.value)}
                                placeholder="e.g. Inverted digits entered by driver"
                              />
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={acting}
                                onClick={() => void handleVoid(row.id)}
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setVoidId(null);
                                  setVoidReason("");
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
