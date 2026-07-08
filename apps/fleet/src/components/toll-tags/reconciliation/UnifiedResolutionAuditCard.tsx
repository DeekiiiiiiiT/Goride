import React from "react";
import { ArrowDown, Undo2 } from "lucide-react";
import { Button } from "../../ui/button";
import { PlatformSourceBadge } from "./PlatformSourceBadge";
import { cn } from "../../ui/utils";
import { normalizePlatform } from "../../../utils/normalizePlatform";

export interface UnifiedResolutionAuditCardProps {
  sourcePlatform?: string | null;
  sourceDate?: string | null;
  sourceDriverName?: string | null;
  sourceRefundAmount: number;
  targetLocation?: string | null;
  targetTollAmount?: number | null;
  targetClaimStatus?: string | null;
  appliedAmount?: number | null;
  leftoverShortfall?: number | null;
  appliedAt?: string | null;
  appliedBy?: string | null;
  onUndo?: () => void;
  undoDisabled?: boolean;
  className?: string;
}

function fmtMoney(n?: number | null): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return `$${Math.abs(n).toFixed(2)}`;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Cross-link card: Source Trip → Target Toll/Claim with apply amounts + optional Undo.
 * Used in Resolved Refunds and Claims History when an unlinked apply is present.
 */
export function UnifiedResolutionAuditCard({
  sourcePlatform,
  sourceDate,
  sourceDriverName,
  sourceRefundAmount,
  targetLocation,
  targetTollAmount,
  targetClaimStatus,
  appliedAmount,
  leftoverShortfall,
  appliedAt,
  appliedBy,
  onUndo,
  undoDisabled,
  className,
}: UnifiedResolutionAuditCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white p-4 space-y-3",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Source trip
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <PlatformSourceBadge platform={sourcePlatform} />
            <span className="text-sm font-semibold text-emerald-700">
              +{fmtMoney(sourceRefundAmount)}
            </span>
          </div>
          <div className="text-xs text-slate-600">
            {fmtDate(sourceDate)}
            {sourceDriverName ? ` · ${sourceDriverName}` : ""}
            {sourcePlatform ? ` · ${normalizePlatform(sourcePlatform)}` : ""}
          </div>
        </div>
        {onUndo && (
          <Button
            variant="outline"
            size="sm"
            onClick={onUndo}
            disabled={undoDisabled}
            className="shrink-0"
          >
            <Undo2 className="h-3.5 w-3.5 mr-1.5" />
            Undo
          </Button>
        )}
      </div>

      <div className="flex justify-center text-slate-400">
        <ArrowDown className="h-4 w-4" />
      </div>

      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Target toll / claim
        </div>
        <div className="text-sm font-medium text-slate-900 truncate">
          {targetLocation || "Underpaid toll"}
        </div>
        <div className="text-xs text-slate-600">
          Cost {fmtMoney(targetTollAmount)}
          {targetClaimStatus ? ` · ${targetClaimStatus}` : ""}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
        <span>
          Applied <span className="font-semibold text-slate-800">{fmtMoney(appliedAmount)}</span>
        </span>
        {typeof leftoverShortfall === "number" && leftoverShortfall > 0.05 && (
          <span>
            Leftover{" "}
            <span className="font-semibold text-amber-700">{fmtMoney(leftoverShortfall)}</span>
          </span>
        )}
        {appliedAt && <span>{fmtDate(appliedAt)}</span>}
        {appliedBy && <span>{appliedBy}</span>}
      </div>
    </div>
  );
}
