// Read-only side drawer that lists every open vehicle-catalog pending request
// for the current organization. Triggered from the fleet banner, the fleet
// status-filter pill, the VehicleDetail banners, and the driver-portal
// catalog-gate toast. Drivers can't approve requests, but they can see why
// they're blocked and on which vehicle.
//
// Drawer (not a route) so we don't have to touch routing and so it can be
// opened from anywhere with the same trigger.

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, MessageSquare } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { useMyPendingCatalogRequests } from "../../hooks/useMyPendingCatalogRequests";
import type { Vehicle } from "../../types/vehicle";
import type { VehicleCatalogPendingRequest } from "../../types/vehicleCatalogPending";

export interface PendingCatalogRequestsDrawerProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /**
   * Optional click-through into the fleet vehicle. When omitted (e.g. driver
   * portal where the route doesn't exist), the per-row "Open vehicle" button
   * is hidden.
   */
  onOpenVehicle?: (fleetVehicleId: string) => void;
}

function statusVariant(status: VehicleCatalogPendingRequest["status"]): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className?: string;
} {
  switch (status) {
    case "pending":
      return {
        label: "Pending",
        variant: "outline",
        className: "border-amber-300 bg-amber-50 text-amber-900",
      };
    case "needs_info":
      return {
        label: "Needs info",
        variant: "outline",
        className: "border-rose-300 bg-rose-50 text-rose-900",
      };
    case "approved":
      return { label: "Approved", variant: "outline", className: "border-emerald-300 bg-emerald-50 text-emerald-900" };
    case "rejected":
      return { label: "Rejected", variant: "destructive" };
    case "superseded":
      return { label: "Superseded", variant: "secondary" };
    default:
      return { label: status, variant: "outline" };
  }
}

function formatProposedVehicleLine(req: VehicleCatalogPendingRequest): string {
  const year = req.proposed_production_start_year || "";
  return [year, req.proposed_make, req.proposed_model]
    .filter((s) => String(s ?? "").trim() !== "")
    .join(" ");
}

function PendingRow({
  req,
  vehicleByFleetId,
  onOpenVehicle,
  onClose,
}: {
  req: VehicleCatalogPendingRequest;
  vehicleByFleetId: Map<string, Vehicle>;
  onOpenVehicle?: (fleetVehicleId: string) => void;
  onClose: () => void;
}) {
  const status = statusVariant(req.status);
  const [showInfoMessage, setShowInfoMessage] = useState(false);
  const linkedVehicle = vehicleByFleetId.get(req.fleet_vehicle_id);
  const plate = linkedVehicle?.licensePlate?.trim() || "";

  const handleOpen = () => {
    if (!onOpenVehicle) return;
    onOpenVehicle(req.fleet_vehicle_id);
    onClose();
  };

  return (
    <li className="rounded-lg border bg-white p-3 text-sm shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900 truncate">
            {formatProposedVehicleLine(req) || "Vehicle"}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {plate ? <span className="font-mono">{plate}</span> : <span>No plate</span>}
            <span className="mx-1.5 text-slate-300">|</span>
            <span>Request #{req.id.slice(0, 8)}</span>
          </div>
        </div>
        <Badge variant={status.variant} className={status.className}>
          {status.label}
        </Badge>
      </div>

      {req.status === "needs_info" && req.info_request_message && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowInfoMessage((s) => !s)}
            className="inline-flex items-center gap-1 text-xs font-medium text-rose-800 hover:text-rose-900"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {showInfoMessage ? "Hide admin message" : "View admin message"}
            {showInfoMessage ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {showInfoMessage && (
            <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-950 whitespace-pre-wrap">
              {req.info_request_message}
            </div>
          )}
        </div>
      )}

      {onOpenVehicle && (
        <div className="mt-3 flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={handleOpen}>
            Open vehicle
          </Button>
        </div>
      )}
    </li>
  );
}

export function PendingCatalogRequestsDrawer({
  open,
  onOpenChange,
  onOpenVehicle,
}: PendingCatalogRequestsDrawerProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching } = useMyPendingCatalogRequests();

  // Pull whatever the fleet page already loaded so we can show plates without
  // an extra fetch. Read-only - never mutate this cache.
  const vehiclesCache = (queryClient.getQueryData<Vehicle[]>(["vehicles"]) ?? []);
  const vehicleByFleetId = useMemo(() => {
    const m = new Map<string, Vehicle>();
    for (const v of vehiclesCache) {
      if (v.id) m.set(v.id, v);
      if (v.licensePlate) m.set(v.licensePlate, v);
    }
    return m;
  }, [vehiclesCache]);

  const items = useMemo(() => {
    const rows = data?.items ?? [];
    // Only show open requests in the drawer; closed ones (approved/rejected/
    // superseded) belong to history, not the active queue.
    const open = rows.filter((r) => r.status === "pending" || r.status === "needs_info");
    return [...open].sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return tb - ta;
    });
  }, [data]);

  const handleClose = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col gap-0 p-0"
        aria-describedby="pending-catalog-drawer-desc"
      >
        <SheetHeader className="border-b">
          <SheetTitle>Pending motor catalog requests</SheetTitle>
          <SheetDescription id="pending-catalog-drawer-desc">
            Vehicles waiting for a platform admin to approve their motor type. Operations stay blocked until each is matched.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <ul className="space-y-2">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-20 animate-pulse rounded-lg border bg-slate-50" />
              ))}
            </ul>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-6 py-10 text-center text-sm text-emerald-900">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              <div className="font-semibold">All vehicles matched</div>
              <p className="text-emerald-800/90">
                There are no pending motor catalog requests for your organization right now.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {items.map((req) => (
                <PendingRow
                  key={req.id}
                  req={req}
                  vehicleByFleetId={vehicleByFleetId}
                  onOpenVehicle={onOpenVehicle}
                  onClose={handleClose}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t bg-slate-50/60 px-4 py-3 text-xs text-slate-500">
          <div className="flex items-center gap-1">
            {isFetching && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
            {items.length > 0
              ? `${items.length} open request${items.length === 1 ? "" : "s"}`
              : "Up to date"}
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={handleClose}>
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default PendingCatalogRequestsDrawer;
