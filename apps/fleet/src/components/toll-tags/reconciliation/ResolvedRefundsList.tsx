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
import { isUnlinkedApplyResolution } from "../../../utils/unlinkedShortfallEligibility";
import { UndoApplyToUnderpaidDialog } from "./UndoApplyToUnderpaidDialog";
import { UnifiedResolutionAuditCard } from "./UnifiedResolutionAuditCard";
import { PlatformSourceBadge } from "./PlatformSourceBadge";

export interface ResolvedRefundRow extends RefundTripLike {
  resolution: RefundResolutionType;
  resolvedBy?: string;
  resolvedAt?: string;
  auto?: boolean;
  appliedToClaimId?: string | null;
  appliedToTollId?: string | null;
  resolutionSource?: string | null;
  resolutionNotes?: string | null;
  /** Prior claim status for undo dialog (when available). */
  preUnlinkedStatus?: string | null;
  preUnlinkedResolutionReason?: string | null;
  targetTollAmount?: number | null;
  targetLocation?: string | null;
}

interface ResolvedRefundsListProps {
  rows: ResolvedRefundRow[];
  /** Leftover resolutions (cash wash / phantom / pending / plain expense). */
  onUndo: (tripId: string) => void;
  /** Apply-to-Underpaid undos — restores claim + toll provenance. */
  onUndoApply?: (tripId: string) => Promise<void> | void;
  busyTripId?: string | null;
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isApplyRow(row: ResolvedRefundRow): boolean {
  return isUnlinkedApplyResolution({
    tollRefundResolution: {
      status: row.resolution,
      appliedToClaimId: row.appliedToClaimId,
      source: row.resolutionSource,
    },
  });
}

/**
 * Resolved Refunds history. Every resolution is reversible via Undo.
 * Apply-to-Underpaid rows use the dedicated undo dialog when onUndoApply is provided.
 */
export function ResolvedRefundsList({
  rows,
  onUndo,
  onUndoApply,
  busyTripId,
}: ResolvedRefundsListProps) {
  const fleetTz = useFleetTimezone();
  const total = rows.reduce((sum, r) => sum + Math.abs(r.tollCharges ?? 0), 0);
  const weekGroups = useMemo(() => groupByWeek(rows, fleetTz), [rows, fleetTz]);
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
                      const applyRow = isApplyRow(row);
                      const willCharge =
                        row.preUnlinkedResolutionReason === "Charge Driver" ||
                        row.preUnlinkedStatus === "Resolved";

                      return (
                        <React.Fragment key={row.id}>
                          <TableRow>
                            <TableCell>
                              <div className="font-medium">{timeAgo(row.date)}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <PlatformSourceBadge platform={row.platform} size="sm" />
                                <span className="text-xs text-slate-500">{row.driverName || "—"}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                                  applyRow
                                    ? "border-orange-200 bg-orange-50 text-orange-800"
                                    : meta.chipClass,
                                )}
                              >
                                {applyRow ? "Applied to underpaid" : meta.label}
                              </span>
                              {row.auto && <span className="ml-1 text-[11px] text-slate-400">auto</span>}
                            </TableCell>
                            <TableCell className="text-slate-600">
                              {row.resolvedBy || "—"}
                              {row.resolvedAt && (
                                <span className="text-slate-400"> · {timeAgo(row.resolvedAt)}</span>
                              )}
                            </TableCell>
                            <TableCell className="font-medium">
                              ${Math.abs(row.tollCharges ?? 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-right">
                              {applyRow && onUndoApply ? (
                                <UndoApplyToUnderpaidDialog
                                  summary={{
                                    tripId: row.id,
                                    tripRefund: Math.abs(row.tollCharges ?? 0),
                                    tripPlatform: row.platform,
                                    tollAmount: row.targetTollAmount,
                                    tollLocation: row.targetLocation,
                                    priorClaimStatus: row.preUnlinkedStatus,
                                    priorResolutionReason: row.preUnlinkedResolutionReason,
                                    willReinstateDriverCharge: !!willCharge,
                                  }}
                                  onConfirm={() => onUndoApply(row.id)}
                                  disabled={busyTripId === row.id}
                                />
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onUndo(row.id)}
                                  disabled={busyTripId === row.id}
                                >
                                  Undo
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                          {applyRow && (
                            <TableRow className="hover:bg-transparent">
                              <TableCell colSpan={5} className="bg-slate-50/60 py-3">
                                <UnifiedResolutionAuditCard
                                  sourcePlatform={row.platform}
                                  sourceDate={row.date}
                                  sourceDriverName={row.driverName}
                                  sourceRefundAmount={Math.abs(row.tollCharges ?? 0)}
                                  targetLocation={row.targetLocation}
                                  targetTollAmount={row.targetTollAmount}
                                  appliedAt={row.resolvedAt}
                                  appliedBy={row.resolvedBy}
                                  className="border-0 bg-transparent p-0 shadow-none"
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
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
