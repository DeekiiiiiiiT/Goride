import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { api } from "../../services/api";
import { pathForPageId } from "../../navigation/pageRegistry";
import type { PartsNotice } from "../../types/maintenance";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

/** "Toyota Roomy 2019" → "Toyota Roomy". */
function carName(label: string | null): string {
  return (label ?? "").replace(/\s+\d{4}$/, "").trim();
}

/** Slice C (LC-03 / LC-08, Stitch screen 8): "Roam added the oxygen sensor for your Toyota Roomy". */
export function partsNoticeTitle(n: Pick<PartsNotice, "title" | "jobName" | "carLabel">): string {
  const car = carName(n.carLabel);
  if (n.jobName && car) return `Roam added the ${n.jobName.toLowerCase()} for your ${car}`;
  return n.title || "Roam added a part";
}

/** Find parts for that car and job (same page and links the Find parts tab reads). */
function openFindParts(n: PartsNotice) {
  const params = new URLSearchParams({ tab: "find-parts" });
  if (n.vehicleId) params.set("vehicle", n.vehicleId);
  if (n.jobId) params.set("part", n.jobId);
  window.location.assign(`${pathForPageId("maintenance")}?${params.toString()}`);
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function FleetMaintenanceAlertsMenu({
  onOpenVehicle,
}: {
  onOpenVehicle?: (vehicleId: string) => void;
}) {
  const [tab, setTab] = useState<"open" | "closed">("open");
  const queryClient = useQueryClient();
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

  // Slice C: "Part on file" messages (switch off → the server says 404 and nothing shows).
  const noticesQuery = useQuery({
    queryKey: ["parts-notices"],
    queryFn: () => api.partsNotices(),
    refetchInterval: 120_000,
  });
  const allNotices = noticesQuery.data?.items ?? [];
  const unreadNotices = allNotices.filter((n) => !n.read);
  const unreadKey = unreadNotices.map((n) => n.id).join(",");
  const [menuOpen, setMenuOpen] = useState(false);
  /** Messages that were unread while the menu was open: they stay listed (without a new badge) until it closes. */
  const [shownIds, setShownIds] = useState<Set<string>>(new Set());

  // While open, every unread message (also one that arrives after opening) is listed and marked read once.
  useEffect(() => {
    if (!menuOpen || !unreadKey) return;
    const fresh = unreadKey.split(",").filter((id) => !shownIds.has(id));
    if (!fresh.length) return;
    setShownIds((prev) => new Set([...prev, ...fresh]));
    void api
      .markPartsNoticesRead(fresh)
      .then(() => queryClient.invalidateQueries({ queryKey: ["parts-notices"] }))
      .catch(() => undefined);
  }, [menuOpen, unreadKey, shownIds, queryClient]);

  const shown: PartsNotice[] = allNotices.filter((n) => shownIds.has(n.id) || (menuOpen && !n.read));
  const badgeCount = openCount + unreadNotices.filter((n) => !shownIds.has(n.id)).length;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (!open) setShownIds(new Set());
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Maintenance alerts">
          <Bell className="h-5 w-5" />
          {badgeCount > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-on-error">
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[360px] overflow-y-auto" data-testid="mm-alerts-menu">
        {shown.length ? (
          <>
            {shown.map((n) => (
              <DropdownMenuItem
                key={n.id}
                data-testid="parts-notice-row"
                onClick={() => openFindParts(n)}
                className="relative items-start gap-2.5 p-3 bg-[#f8f9ff] dark:bg-[#1c1d26] focus:bg-[#eff4ff] dark:focus:bg-[#23242e]"
              >
                <span className="absolute top-3.5 right-3 w-2 h-2 rounded-full bg-[#4b41e1] dark:bg-[#c3c0ff]" aria-hidden />
                <span className="w-8 h-8 rounded-full bg-[#85f8c4]/30 text-[#069669] dark:bg-[#064e3b] dark:text-[#34d399] flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-[18px]" aria-hidden>verified</span>
                </span>
                <span className="flex-1 min-w-0 pr-4 flex flex-col">
                  <span className="text-[13px] font-semibold leading-snug text-[#0b1c30] dark:text-[#e4e1ec]">
                    {partsNoticeTitle(n)}
                  </span>
                  <span className="text-[12px] text-[#47464c] dark:text-[#c9c5cd] mt-0.5">Tap to see the parts that fit.</span>
                  <span className="text-[11px] text-[#78767d] dark:text-[#938f99] mt-1.5">{timeAgo(n.createdAt)}</span>
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : null}
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
                    {severity === "overdue" ? "Overdue" : severity === "odometer_needed" ? "Log a reading so due dates can be worked out" : "Due soon"}
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
