import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { api } from "../../services/api";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export function FleetMaintenanceAlertsMenu({
  onOpenVehicle,
}: {
  onOpenVehicle?: (vehicleId: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["maintenance-alerts"],
    queryFn: () => api.getMaintenanceAlerts(),
    refetchInterval: 120_000,
  });

  const items = (data?.items || []) as Array<Record<string, unknown>>;
  const count = items.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Maintenance alerts">
          <Bell className="h-5 w-5" />
          {count > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-on-error">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[360px] overflow-y-auto">
        <DropdownMenuLabel>Maintenance alerts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        ) : items.length === 0 ? (
          <DropdownMenuItem disabled>No overdue or due-soon alerts</DropdownMenuItem>
        ) : (
          items.map((row) => {
            const vehicleId = String(row.vehicle_id ?? "");
            const payload = (row.payload || {}) as Record<string, unknown>;
            const label = String(payload.categoryName ?? row.category_id ?? "Service");
            const severity = String(row.severity ?? "due_soon");
            return (
              <DropdownMenuItem
                key={String(row.alert_key ?? row.id ?? vehicleId + label)}
                onClick={() => {
                  if (vehicleId && onOpenVehicle) onOpenVehicle(vehicleId);
                  else if (vehicleId) {
                    window.location.hash = "";
                    sessionStorage.setItem("fleet-maintenance-focus-vehicle", vehicleId);
                    window.dispatchEvent(new CustomEvent("fleet-navigate", { detail: "maintenance" }));
                  }
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium truncate">{label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {severity === "overdue" ? "Overdue" : "Due soon"} · {vehicleId.slice(0, 8)}
                  </span>
                </div>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
