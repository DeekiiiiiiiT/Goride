import React from "react";
import { cn } from "../../ui/utils";
import { normalizePlatform } from "../../../utils/normalizePlatform";

type BadgeSize = "sm" | "md";

const PLATFORM_CHIP: Record<string, { short: string; className: string }> = {
  Uber: { short: "UB", className: "bg-slate-900 text-white border-slate-900" },
  Roam: { short: "RM", className: "bg-indigo-600 text-white border-indigo-600" },
  InDrive: { short: "ID", className: "bg-emerald-600 text-white border-emerald-600" },
  Other: { short: "?", className: "bg-slate-200 text-slate-700 border-slate-300" },
};

function chipMeta(platform?: string | null) {
  const label = normalizePlatform(platform || undefined);
  return { label, ...(PLATFORM_CHIP[label] || PLATFORM_CHIP.Other) };
}

/**
 * Compact platform chip for ops history. When tollPlatform ≠ refundPlatform,
 * renders both: "Uber toll / Roam refund".
 */
export function PlatformSourceBadge({
  platform,
  tollPlatform,
  refundPlatform,
  size = "sm",
  className,
}: {
  /** Single platform (simple chip). */
  platform?: string | null;
  /** Toll-side platform when showing a pair. */
  tollPlatform?: string | null;
  /** Refund-side platform when showing a pair. */
  refundPlatform?: string | null;
  size?: BadgeSize;
  className?: string;
}) {
  const sizeCls = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";

  const renderChip = (p?: string | null, suffix?: string) => {
    const meta = chipMeta(p);
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded border font-semibold tracking-wide",
          sizeCls,
          meta.className,
        )}
        title={suffix ? `${meta.label} ${suffix}` : meta.label}
      >
        <span className="opacity-90">{meta.short}</span>
        <span className="font-medium">{meta.label}</span>
        {suffix ? <span className="opacity-80 font-normal">{suffix}</span> : null}
      </span>
    );
  };

  if (tollPlatform || refundPlatform) {
    const toll = normalizePlatform(tollPlatform || undefined);
    const refund = normalizePlatform(refundPlatform || undefined);
    if (toll !== refund && tollPlatform && refundPlatform) {
      return (
        <span className={cn("inline-flex items-center gap-1 flex-wrap", className)}>
          {renderChip(tollPlatform, "toll")}
          <span className="text-[10px] text-slate-400">/</span>
          {renderChip(refundPlatform, "refund")}
        </span>
      );
    }
    return <span className={className}>{renderChip(refundPlatform || tollPlatform)}</span>;
  }

  if (!platform) return null;
  return <span className={className}>{renderChip(platform)}</span>;
}
