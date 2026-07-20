import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../../ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "../../ui/table";
import { Button } from "../../ui/button";
import { cn } from "../../ui/utils";
import { RefundResolutionType, REFUND_RESOLUTION_META, RefundTripLike } from "./refundResolutionShell";
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
  /** Toll/claim date for cross-period badge. */
  targetTollDate?: string | null;
  /** When set, this refund covered a shortfall in a different recon week. */
  crossPeriodTargetWeekLabel?: string | null;
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
 * Flat list — period is already known from the wizard context.
 */
export function ResolvedRefundsList({
  rows,
  onUndo,
  onUndoApply,
  busyTripId,
}: ResolvedRefundsListProps) {
  const total = rows.reduce((sum, r) => sum + Math.abs(r.tollCharges ?? 0), 0);
  const crossPeriodRows = useMemo(
    () => rows.filter((r) => !!r.crossPeriodTargetWeekLabel && isApplyRow(r)),
    [rows],
  );

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
        {crossPeriodRows.length > 0 && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-950">
            <span className="font-semibold">{crossPeriodRows.length}</span> applied credit
            {crossPeriodRows.length === 1 ? '' : 's'} covered underpaid tolls in{' '}
            <span className="font-semibold">another period</span>
            {' — '}
            {[...new Set(crossPeriodRows.map((r) => r.crossPeriodTargetWeekLabel).filter(Boolean))].join(', ')}.
            Those shortfalls will not appear on this week’s Partially Covered tab.
          </div>
        )}
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
            {rows.map((row) => {
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
                      {row.crossPeriodTargetWeekLabel && (
                        <div className="mt-1">
                          <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                            Covered {row.crossPeriodTargetWeekLabel}
                          </span>
                        </div>
                      )}
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
                          targetTollDate={row.targetTollDate}
                          crossPeriodWeekLabel={row.crossPeriodTargetWeekLabel}
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
      </CardContent>
    </Card>
  );
}
