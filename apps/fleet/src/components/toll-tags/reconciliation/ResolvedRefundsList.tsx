import React, { useMemo, useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { cn } from "../../ui/utils";
import { RefundResolutionType, REFUND_RESOLUTION_META, RefundTripLike } from "./refundResolutionShell";
import { groupByWeek } from "../../../utils/tollWeekPeriod";
import { useFleetTimezone } from "../../../utils/timezoneDisplay";

export interface ResolvedRefundRow extends RefundTripLike {
  resolution: RefundResolutionType;
  resolvedBy?: string;
  resolvedAt?: string;
  auto?: boolean;
}

interface ResolvedRefundsListProps {
  rows: ResolvedRefundRow[];
  onUndo: (tripId: string) => void;
  busyTripId?: string | null;
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Resolved Refunds history (Phase 1 shell). Every resolution is reversible via
 * Undo, which (Phase 3) re-opens the refund by setting it back to `pending`.
 * Grouped by Monday–Sunday week (same convention as Unmatched Tolls / Unclaimed
 * Refunds / Dispute Refunds) so a period can be reviewed at a glance.
 */
export function ResolvedRefundsList({ rows, onUndo, busyTripId }: ResolvedRefundsListProps) {
  const fleetTz = useFleetTimezone();
  const total = rows.reduce((sum, r) => sum + Math.abs(r.tollCharges ?? 0), 0);
  const weekGroups = useMemo(() => groupByWeek(rows, fleetTz), [rows, fleetTz]);
  // Opt-in set: a week is expanded only once its key is added here, so every
  // week starts collapsed by default (an empty set means "nothing expanded").
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());

  const toggleWeek = (key: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          <span className="text-xl">🗂️</span>
        </div>
        <h3 className="text-lg font-medium text-slate-900">No resolved refunds yet</h3>
        <p>Resolutions you apply will appear here and can be undone.</p>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Resolved Refunds</CardTitle>
          <CardDescription>Cleared refunds. Every action is audited and reversible.</CardDescription>
        </div>
        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          ${total.toFixed(2)} cleared
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {weekGroups.map((week) => {
          const isOpen = expandedWeeks.has(week.key);
          const weekTotal = week.items.reduce((sum, r) => sum + Math.abs(r.tollCharges ?? 0), 0);
          return (
            <Collapsible
              key={week.key}
              open={isOpen}
              onOpenChange={() => toggleWeek(week.key)}
              className="rounded-xl border border-slate-200 overflow-hidden"
            >
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left bg-slate-50/80 hover:bg-slate-100/80 transition-colors">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <CalendarRange className="h-4 w-4 text-slate-500 shrink-0" />
                  <span className="font-semibold text-slate-800">{week.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">Mon–Sun</span>
                  <Badge variant="secondary" className="text-[11px]">
                    {week.items.length} refund{week.items.length !== 1 ? "s" : ""}
                  </Badge>
                  <span className="text-xs font-medium text-emerald-700">${weekTotal.toFixed(2)}</span>
                </div>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 text-slate-500 shrink-0 transition-transform duration-200",
                    isOpen ? "rotate-0" : "-rotate-90",
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Resolution</TableHead>
                      <TableHead>Resolved by</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {week.items.map((row) => {
                      const meta = REFUND_RESOLUTION_META[row.resolution];
                      return (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="font-medium">{timeAgo(row.date)}</div>
                            <div className="text-xs text-slate-500">{row.driverName || "—"}</div>
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                                meta.chipClass,
                              )}
                            >
                              {meta.label}
                            </span>
                            {row.auto && <span className="ml-1 text-[11px] text-slate-400">auto</span>}
                          </TableCell>
                          <TableCell className="text-slate-600">
                            {row.resolvedBy || "—"}
                            {row.resolvedAt && <span className="text-slate-400"> · {timeAgo(row.resolvedAt)}</span>}
                          </TableCell>
                          <TableCell className="font-medium">${Math.abs(row.tollCharges ?? 0).toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onUndo(row.id)}
                              disabled={busyTripId === row.id}
                            >
                              Undo
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}
