import React from "react";
import { AlertTriangle } from "lucide-react";
import { Checkbox } from "../../ui/checkbox";
import { cn } from "../../ui/utils";
import { normalizePlatform } from "../../../utils/normalizePlatform";

/**
 * Inline amber banner in Apply drawer when trip refund platform ≠ target toll platform.
 * Apply stays disabled until the operator checks "Proceed anyway".
 */
export function PlatformMismatchWarning({
  sourcePlatform,
  targetPlatform,
  acknowledged,
  onAcknowledge,
  className,
}: {
  sourcePlatform?: string | null;
  targetPlatform?: string | null;
  acknowledged: boolean;
  onAcknowledge: (ack: boolean) => void;
  className?: string;
}) {
  const source = normalizePlatform(sourcePlatform || undefined);
  const target = normalizePlatform(targetPlatform || undefined);

  return (
    <div
      role="alert"
      className={cn(
        "rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900",
        className,
      )}
    >
      <div className="flex gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
        <div className="space-y-2 min-w-0">
          <p>
            Platform mismatch: This <span className="font-semibold">{source}</span> refund
            will be applied to a toll from a{" "}
            <span className="font-semibold">{target}</span> trip. This may indicate an
            incorrect match.
          </p>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(v) => onAcknowledge(v === true)}
            />
            <span className="text-xs font-medium text-amber-900">Proceed anyway</span>
          </label>
        </div>
      </div>
    </div>
  );
}

export function platformsMismatch(
  a?: string | null,
  b?: string | null,
): boolean {
  if (!a || !b) return false;
  return normalizePlatform(a) !== normalizePlatform(b);
}
