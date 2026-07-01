import React from "react";
import { MapPin, Tag, Banknote } from "lucide-react";
import { cn } from "../../ui/utils";

export type TollSource = "roam_geofence" | "tag_import" | "cash" | "unknown";

const SOURCE_META: Record<
  Exclude<TollSource, "unknown">,
  { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  roam_geofence: {
    label: "Roam Geofence",
    className: "border-teal-200 bg-teal-50 text-teal-700",
    Icon: MapPin,
  },
  tag_import: {
    label: "Tag Import",
    className: "border-slate-200 bg-slate-50 text-slate-700",
    Icon: Tag,
  },
  cash: {
    label: "Cash",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    Icon: Banknote,
  },
};

/**
 * Derive the source of a toll row from the data that already flows through the
 * ledger → tx shape. Bridged native-ride tolls carry `metadata.source`; other
 * rows are inferred from their payment method. Returns "unknown" (renders
 * nothing) when there is no reliable signal — legacy rows are unaffected.
 */
export function deriveTollSource(input: {
  _raw?: { metadata?: Record<string, any> | null } | null;
  paymentMethodDisplay?: string;
}): TollSource {
  const source = input._raw?.metadata?.source;
  if (source === "roam_geofence") return "roam_geofence";
  const method = input.paymentMethodDisplay;
  if (method === "Cash") return "cash";
  if (method === "E-Tag") return "tag_import";
  return "unknown";
}

/**
 * Small badge marking where a toll ledger row originated. Phase 4 populates
 * `metadata.source`; this shell renders it. Unknown sources render nothing.
 */
export function TollSourceBadge({
  source,
  className,
}: {
  source: TollSource;
  className?: string;
}) {
  if (source === "unknown") return null;
  const meta = SOURCE_META[source];
  const { Icon } = meta;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        meta.className,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}
