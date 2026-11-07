import { MaterialIcon } from "../import/MaterialIcon";
import type { AddPartsDraft, FitMode, PartTypeRow } from "./addPartsTypes";

/** Maps DB icon_key values to valid Material Symbols names (audit V1). */
const PART_TYPE_ICON_MAP: Record<string, string> = {
  wrench: "build",
  oil: "filter_alt",
  droplet: "water_drop",
  brakes: "radio_button_checked",
  disc_full: "radio_button_checked",
  suspension: "settings_b_roll",
  spark: "offline_bolt",
  gears: "settings",
  wind: "air",
  tires: "tire_repair",
  belt: "sync",
  wipers: "straighten",
  straighten: "straighten",
  filter_alt: "filter_alt",
  lightbulb: "lightbulb",
  bolt: "offline_bolt",
  inventory_2: "inventory_2",
  battery: "battery_charging_full",
};

export function partTypeIconMaterialName(iconKey: string | null | undefined): string {
  if (!iconKey) return "inventory_2";
  const key = iconKey.trim().toLowerCase();
  if (PART_TYPE_ICON_MAP[key]) return PART_TYPE_ICON_MAP[key];
  if (/^[a-z0-9_]+$/.test(key) && key.length > 2) return key;
  return "inventory_2";
}

export function PartTypeIcon({ iconKey, className, filled }: { iconKey: string | null | undefined; className?: string; filled?: boolean }) {
  return <MaterialIcon name={partTypeIconMaterialName(iconKey)} className={className} filled={filled} />;
}

export type PartTypeAreaGroup = {
  areaIds: string[];
  label: string;
  num: number;
  sectionIcon: string;
};

/** Stitch AP2 area order and labels (maps to maintenance_service_categories parent area ids). */
export const PART_TYPE_AREA_ORDER: PartTypeAreaGroup[] = [
  { areaIds: ["b1000000-0000-4000-8000-000000000004"], label: "Brakes", num: 1, sectionIcon: "trip_origin" },
  { areaIds: ["b1000000-0000-4000-8000-000000000001"], label: "Engine", num: 2, sectionIcon: "engineering" },
  {
    areaIds: ["b1000000-0000-4000-8000-000000000002", "b1000000-0000-4000-8000-00000000000a"],
    label: "Filters & HVAC",
    num: 3,
    sectionIcon: "air",
  },
  {
    areaIds: ["b1000000-0000-4000-8000-000000000005", "b1000000-0000-4000-8000-000000000009"],
    label: "Fluids & transmission",
    num: 4,
    sectionIcon: "water_drop",
  },
  { areaIds: ["b1000000-0000-4000-8000-000000000006"], label: "Belts & hoses", num: 5, sectionIcon: "sync" },
  { areaIds: ["b1000000-0000-4000-8000-00000000000b"], label: "Battery & electrical", num: 6, sectionIcon: "bolt" },
  { areaIds: ["b1000000-0000-4000-8000-000000000007"], label: "Lighting & visibility", num: 7, sectionIcon: "lightbulb" },
  { areaIds: ["b1000000-0000-4000-8000-000000000008"], label: "Suspension & steering", num: 8, sectionIcon: "settings_b_roll" },
  { areaIds: ["b1000000-0000-4000-8000-000000000003"], label: "Tires & wheels", num: 9, sectionIcon: "tire_repair" },
];

export function groupPartTypesByArea(types: PartTypeRow[]): Array<{ area: PartTypeAreaGroup | null; types: PartTypeRow[] }> {
  const byArea = new Map<string, PartTypeRow[]>();
  const other: PartTypeRow[] = [];
  for (const t of types) {
    if (t.areaId && byArea.has(t.areaId)) byArea.get(t.areaId)!.push(t);
    else if (t.areaId) byArea.set(t.areaId, [t]);
    else other.push(t);
  }
  const groups: Array<{ area: PartTypeAreaGroup | null; types: PartTypeRow[] }> = [];
  for (const area of PART_TYPE_AREA_ORDER) {
    const list: PartTypeRow[] = [];
    for (const id of area.areaIds) {
      const chunk = byArea.get(id);
      if (chunk?.length) list.push(...chunk);
    }
    if (list.length) groups.push({ area, types: list });
  }
  if (other.length) groups.push({ area: null, types: other });
  return groups;
}

export function fitModeLabel(mode: string | undefined): string {
  if (mode === "engine") return "By engine";
  if (mode === "spec") return "By size or spec";
  return "Specific cars";
}

export function positionSchemeLabel(scheme: string | undefined | null): string {
  if (!scheme || scheme === "none") return "No position";
  if (scheme === "axle" || scheme === "axle_inner_outer") return "Front · Rear";
  if (scheme === "four_corners" || scheme === "axle_left_right") return "Four corners";
  if (scheme === "driver_passenger_rear") return "Driver · Passenger · Rear";
  if (scheme === "low_high_beam") return "Low · High beam";
  if (scheme === "front_rear_side") return "Front · Rear · Side";
  if (scheme === "before_after_catalyst") return "Before · After cat";
  return scheme.replace(/_/g, " ");
}

/** Client-side part number normalize (matches DB part_import_norm_number intent). */
export function normalizePartNumberKey(raw: string): string {
  return raw.replace(/[\s\-./]/g, "").toUpperCase();
}

/** Single reach number for AP8 badge, plain-words sentence, and save footer. */
export function reviewReachCount(
  draft: AddPartsDraft,
  preview: { carCount?: number; totalReach?: number } | null,
): number | null {
  if (preview != null) {
    const fromPreview = preview.carCount ?? preview.totalReach;
    if (fromPreview != null) return fromPreview;
  }
  if (draft.listings.length > 0) return draft.listings.length;
  return null;
}

function positionAdjectiveForReview(draft: AddPartsDraft, structuredPositionLabel?: string | null): string | null {
  const pos = draft.position || draft.listings[0]?.position;
  const scheme = draft.partType?.positionScheme;
  if (structuredPositionLabel) {
    const lower = structuredPositionLabel.toLowerCase();
    if (lower.startsWith("front")) return "front";
    if (lower.startsWith("rear")) return "rear";
  }
  if (pos === "front" && (scheme === "axle" || scheme === "axle_inner_outer")) return "front";
  if (pos === "rear" && (scheme === "axle" || scheme === "axle_inner_outer")) return "rear";
  if (pos === "before_cat") return "before-cat";
  if (pos === "after_cat") return "after-cat";
  if (pos && !pos.includes("_")) return pos;
  return pos ? pos.replace(/_/g, " ") : null;
}

/** Stitch AP8: "a front brake pad set" */
export function reviewTradeTermPhrase(
  draft: AddPartsDraft,
  preview: { fitSummaryStructured?: { positionLabel?: string } } | null,
): string {
  const trade = draft.partType?.tradeTerm;
  const base = trade ?? draft.partType?.name?.toLowerCase() ?? "part";
  const adj = positionAdjectiveForReview(draft, preview?.fitSummaryStructured?.positionLabel);
  if (adj && !base.toLowerCase().startsWith(adj.split(" ")[0] ?? "")) {
    return `${adj} ${base}`;
  }
  return base;
}

export type Step1Phase = "picker" | "details";

export function wizardFooterLabels(opts: {
  wizardStep: 1 | 2 | 3 | 4;
  step1Phase: Step1Phase;
  fitMode: FitMode;
  commitCount?: number | null;
  saving?: boolean;
  specificListings?: Array<{ listingTrust?: "confirmed" | "needs_checking" }>;
}): { backLabel?: string; nextLabel?: string; centerNote?: string; skipLabel?: string } {
  const { wizardStep, step1Phase, fitMode, commitCount, saving, specificListings } = opts;
  if (wizardStep === 1 && step1Phase === "picker") {
    return { nextLabel: "Next: How it fits" };
  }
  if (wizardStep === 1 && step1Phase === "details") {
    return { backLabel: "Back to part type", nextLabel: "Next: How it fits" };
  }
  if (wizardStep === 2) {
    let specificNote: string | undefined;
    if (fitMode === "specific" && specificListings?.length) {
      const n = specificListings.length;
      const nc = specificListings.filter((l) => l.listingTrust === "confirmed").length;
      const nn = specificListings.filter((l) => l.listingTrust === "needs_checking").length;
      specificNote = `${n} car${n === 1 ? "" : "s"} · ${nc} Confirmed · ${nn} Needs checking`;
    }
    return {
      backLabel: "Back to part details",
      nextLabel: fitMode === "spec" ? "Next: Review in plain words" : "Next: replaces (optional)",
      centerNote: fitMode === "spec"
        ? "Step 3 skipped · Replaces optional"
        : fitMode === "specific"
        ? specificNote
        : undefined,
    };
  }
  if (wizardStep === 3) {
    return { backLabel: "Back to how it fits", nextLabel: "Next: Review in plain words", skipLabel: "Skip →" };
  }
  if (wizardStep === 4) {
    const n = commitCount != null ? commitCount : null;
    return {
      backLabel: "Back to replaces",
      nextLabel: saving ? "Saving…" : "Save part ✓",
      centerNote: n != null ? `will commit ${n} fitment record${n === 1 ? "" : "s"}` : undefined,
    };
  }
  return {};
}

export const WIZARD_FOOTER_HEIGHT_PX = 72;

export function step2SpecificCanAdvance(draft: AddPartsDraft): boolean {
  if (draft.fitMode !== "specific" || !draft.partType) return true;
  if (!draft.listings.length) return false;
  const scheme = draft.partType.positionScheme;
  if (scheme && scheme !== "none") {
    const pos = draft.position || draft.listings[0]?.position;
    if (!pos) return false;
    if (scheme === "four_corners" || scheme === "axle_left_right") {
      const side = draft.side || draft.listings[0]?.side;
      if (!side) return false;
    }
  }
  for (const l of draft.listings) {
    if (l.listingTrust === "needs_checking" && !String(l.reason ?? "").trim()) return false;
  }
  return true;
}

export function step1DetailsCanAdvance(
  draft: AddPartsDraft,
  lookup: Record<string, unknown> | null,
): boolean {
  // A part already on file blocks Next until the owner picks "Add more cars to it" for that exact part.
  if (lookup?.found && draft.existingPartId !== String(lookup.partId)) return false;
  const hasCore = Boolean(
    draft.brand.trim()
    && draft.partNumber.trim()
    && draft.evidenceUrl.trim(),
  );
  if (!hasCore) return false;
  if (draft.sourceType === "car_maker_catalogue" && !draft.catalogCarMaker.trim()) return false;
  return true;
}

export function stepFooter(step: number) {
  return `Step ${step} of 4 · Not saved yet`;
}

export function AddPartsBreadcrumb({ ap }: { ap?: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 font-mono-sm text-mono-sm text-on-surface-variant" aria-label="Breadcrumb">
      <span>Parts database</span>
      <span className="text-outline">/</span>
      <span className="text-on-surface font-semibold">Add parts</span>
      {ap ? (
        <span className="px-1.5 py-0.5 rounded bg-surface-container font-mono-sm text-mono-sm text-on-secondary-container">{ap}</span>
      ) : null}
    </nav>
  );
}

export function FitModeSwitch({ value, onChange }: { value: FitMode; onChange: (m: FitMode) => void }) {
  const modes: Array<{ id: FitMode; label: string; icon: string }> = [
    { id: "specific", label: "Specific cars", icon: "directions_car" },
    { id: "engine", label: "By engine", icon: "settings_suggest" },
    { id: "spec", label: "By size or spec", icon: "straighten" },
  ];
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="How it fits">
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          className={value === m.id
            ? "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary text-primary font-body-sm font-semibold"
            : "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-outline-variant/50 text-on-surface-variant font-body-sm"}
          onClick={() => onChange(m.id)}
        >
          <MaterialIcon name={m.icon} className="text-[18px]" />
          {m.label}
        </button>
      ))}
    </div>
  );
}

export function trustLabelFromSource(sourceType: string) {
  if (sourceType === "car_maker_catalogue") return "Verified · car maker's catalogue";
  if (sourceType === "part_maker_catalogue") return "Verified · part maker's catalogue";
  return "Needs checking · other source";
}

export function effectiveTrustLabel(trustLabel: string | null | undefined, sourceType: string) {
  return (trustLabel?.trim() || trustLabelFromSource(sourceType));
}

export function isVerifiedTrustLabel(trustLabel: string | null | undefined, sourceType: string) {
  return effectiveTrustLabel(trustLabel, sourceType).startsWith("Verified");
}

/** AP8 verified / trust chips — readable in light and dark. */
export const ADD_PARTS_VERIFIED_CHIP =
  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-600/10 text-emerald-800 dark:bg-emerald-400/15 dark:text-emerald-200 font-mono-sm text-[11px] font-semibold";

export const ADD_PARTS_VERIFIED_CHIP_COMPACT =
  "text-emerald-800 dark:text-emerald-200 font-semibold";

export type RecentSelfServeRow = Record<string, unknown>;

export function pickLatestAdaptationExamples(items: RecentSelfServeRow[]): {
  engine: RecentSelfServeRow | null;
  spec: RecentSelfServeRow | null;
} {
  let engine: RecentSelfServeRow | null = null;
  let spec: RecentSelfServeRow | null = null;
  for (const row of items) {
    const mode = String(row.fitMode ?? "");
    if (mode === "engine" && !engine) engine = row;
    if (mode === "spec" && !spec) spec = row;
    if (engine && spec) break;
  }
  return { engine, spec };
}

export function technicalProfileLines(draft: AddPartsDraft): string[] {
  const lines: string[] = [];
  const typeName = draft.partType?.name;
  if (typeName) lines.push(`Part type: ${typeName}`);
  const pos = draft.position || draft.listings[0]?.position;
  if (pos) {
    const scheme = draft.partType?.positionScheme;
    let label = pos;
    if (pos === "front" && (scheme === "axle" || scheme === "axle_inner_outer")) label = "Front Axle";
    else if (pos === "rear" && (scheme === "axle" || scheme === "axle_inner_outer")) label = "Rear Axle";
    else if (pos === "before_cat") label = "Before catalytic converter";
    else if (pos === "after_cat") label = "After catalytic converter";
    lines.push(`Position: ${label}`);
  }
  for (const f of draft.partType?.specFields ?? []) {
    const val = draft.specValues[f.specKey] ?? (draft.specKey === f.specKey ? draft.specValue : "");
    if (val) lines.push(`${f.label}: ${val}${f.unit ? ` ${f.unit}` : ""}`);
  }
  if (draft.fitMode === "engine" && draft.engineCode) lines.push(`Engine: ${draft.engineCode}`);
  if (!lines.length) return ["No spec values entered on step 2."];
  return lines;
}

export const CAR_MAKER_CATALOGUE_OPTIONS = [
  "Toyota",
  "Daihatsu",
  "Honda",
  "Nissan",
  "Mazda",
  "Subaru",
  "Suzuki",
  "Mitsubishi",
  "Isuzu",
  "Lexus",
  "FxTrustMaker6",
] as const;

export function fitModeDisplay(mode: string | undefined): { label: string; icon: string } {
  if (mode === "engine") return { label: "By engine", icon: "manufacturing" };
  if (mode === "spec") return { label: "By size or spec", icon: "square_foot" };
  return { label: "Specific cars", icon: "directions_car" };
}

export function plainWordsSentence(draft: {
  brand: string;
  partNumber: string;
  partTypeName?: string;
  fitMode: FitMode;
  previewReach?: number;
  sourceType: string;
}) {
  const trust = trustLabelFromSource(draft.sourceType);
  const reach = draft.previewReach != null ? ` · about ${draft.previewReach} car version(s)` : "";
  return `${draft.brand} ${draft.partNumber} (${draft.partTypeName ?? "part"}) · ${draft.fitMode}${reach} · ${trust}`;
}
