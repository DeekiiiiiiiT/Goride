import { confidenceLabel, sourceLabel, statusLabel } from "./maintenanceMasterFormat";

export function MmSourceChip({ source }: { source?: string | null }) {
  const label = sourceLabel(source);
  const maker = source === "maker_manual";
  const part = source === "part_maker";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${
        maker
          ? "bg-emerald-50 text-emerald-800"
          : part
            ? "border border-emerald-200 text-emerald-800"
            : "bg-secondary-container text-on-secondary-container"
      }`}
    >
      <span className="material-symbols-outlined text-[14px]">
        {maker ? "verified" : part ? "inventory_2" : "policy"}
      </span>
      {label}
    </span>
  );
}

export function MmStatusChip({ status }: { status?: string | null }) {
  const label = statusLabel(status ?? undefined);
  const s = String(status ?? "");
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        s === "active"
          ? "bg-[#dcfce7] text-[#166534]"
          : s === "needs_checking"
            ? "border border-amber-300 text-amber-900"
            : s === "draft"
              ? "border border-outline-variant/50 text-on-surface-variant"
              : s === "retired"
                ? "bg-surface-container text-on-surface-variant line-through"
                : "text-on-surface-variant"
      }`}
    >
      {s === "needs_checking" ? (
        <span className="material-symbols-outlined text-[14px]">schedule</span>
      ) : s === "draft" ? (
        <span className="material-symbols-outlined text-[14px]">edit</span>
      ) : s === "retired" ? (
        <span className="material-symbols-outlined text-[14px]">inventory_2</span>
      ) : s === "active" ? (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-700" />
      ) : null}
      {label}
    </span>
  );
}

export function MmConfidenceLabel({ confidence }: { confidence?: string | null }) {
  return (
    <span className="text-[11px] text-on-surface-variant">{confidenceLabel(confidence)}</span>
  );
}

export function MmScopeChip({ scope, code }: { scope: string; code?: string | null }) {
  const s = scope.toLowerCase();
  let label = scope;
  let icon = "public";
  if (s === "variant" || s.includes("car")) {
    label = "One car";
    icon = "directions_car";
  } else if (s === "platform") {
    label = code ? `Platform · ${code}` : "Platform";
    icon = "view_in_ar";
  } else if (s === "platform_family") {
    label = "Platform family";
    icon = "account_tree";
  } else if (s === "engine_family") {
    label = code ? `Engine · ${code}` : "Engine";
    icon = "settings_suggest";
  } else if (s === "global") {
    label = "Everyone";
    icon = "public";
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant/40 px-2 py-0.5 text-[10px] text-on-surface-variant">
      <span className="material-symbols-outlined text-[14px]">{icon}</span>
      <span className="font-code">{label}</span>
    </span>
  );
}

const PART_ICON_MAP: Record<string, string> = {
  belt: "cable",
  brakes: "album",
  brake: "album",
  droplet: "water_drop",
  gauge: "speed",
  gears: "settings",
  hub: "radio_button_unchecked",
  lightbulb: "lightbulb",
  oil: "water_drop",
  oil_barrel: "oil_barrel",
  rotate: "360",
  spark: "bolt",
  straighten: "straighten",
  suspension: "swap_driving_apps",
  thermometer: "thermometer",
  tires: "tire_repair",
  tire: "tire_repair",
  wind: "air",
  wipers: "water_drop",
  wiper: "water_drop",
  upload: "upload",
  share: "share",
  filter: "filter_alt",
  wrench: "build",
};

export function partIconKey(iconKey?: string | null): string {
  const k = String(iconKey ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
  if (!k) return "build";
  return PART_ICON_MAP[k] ?? "build";
}
