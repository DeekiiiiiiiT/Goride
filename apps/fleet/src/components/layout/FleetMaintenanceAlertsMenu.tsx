import React, { useState } from "react";
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
  const [tab, setTab] = useState<"open" | "closed">("open");
  const { data, isLoading } = useQuery({
    queryKey: ["maintenance-alerts", tab],
    queryFn: () => api.getMaintenanceAlerts(tab),
    refetchInterval: 120_000,
  });

  const items = (data?.items || []) as Array<Record<string, unknown>>;
  const openQuery = useQuery({
    queryKey: ["maintenance-alerts", "open"],
    queryFn: () => api.getMaintenanceAlerts("open"),
    refetchInterval: 120_000,
  });
  const openCount = (openQuery.data?.items || []).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Maintenance alerts">
          <Bell className="h-5 w-5" />
          {openCount > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-on-error">
              {openCount > 99 ? "99+" : openCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[360px] overflow-y-auto" data-testid="mm-alerts-menu">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>Maintenance</span>
          <span className="flex gap-1 text-[11px] font-normal">
            <button
              type="button"
              className={tab === "open" ? "font-semibold underline" : "text-muted-foreground"}
              onClick={() => setTab("open")}
            >
              Open ({openCount})
            </button>
            <button
              type="button"
              className={tab === "closed" ? "font-semibold underline" : "text-muted-foreground"}
              onClick={() => setTab("closed")}
            >
              Closed
            </button>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <DropdownMenuItem disabled>Loading…</DropdownMenuItem>
        ) : items.length === 0 ? (
          <DropdownMenuItem disabled>No {tab} alerts</DropdownMenuItem>
        ) : (
          items.map((row) => {
            const vehicleId = String(row.vehicle_id ?? "");
            const label = String(row.category_name ?? row.category_id ?? "Service");
            const severity = String(row.severity ?? "due_soon");
            const closedReason =
              tab === "closed"
                ? String(row.resolution_reason ?? "Done")
                : null;
            return (
              <DropdownMenuItem
                key={String(row.id ?? row.alert_key ?? vehicleId + label)}
                data-testid="mm-alert-row"
                onClick={() => {
                  if (vehicleId && onOpenVehicle) onOpenVehicle(vehicleId);
                }}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-xs">{String(row.license_plate ?? vehicleId.slice(0, 8))}</span>
                  <span className="font-medium truncate">{label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {severity === "overdue" ? "Overdue" : "Due soon"}
                    {closedReason ? ` · ${closedReason}` : ""}
                  </span>
                </div>
              </DropdownMenuItem>
            );
          })
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => window.dispatchEvent(new CustomEvent("fleet-navigate", { detail: "maintenance" }))}>
          Open Maintenance
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
