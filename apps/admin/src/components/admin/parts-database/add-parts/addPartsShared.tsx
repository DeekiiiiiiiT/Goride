import { MaterialIcon } from "../import/MaterialIcon";
import type { AddPartsDraft, FitMode } from "./addPartsTypes";

export function step1DetailsCanAdvance(
  draft: AddPartsDraft,
  lookup: Record<string, unknown> | null,
): boolean {
  if (lookup?.found) return false;
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

export function AddPartsBreadcrumb({ tail, ap }: { tail: string; ap?: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 font-mono-sm text-mono-sm text-on-surface-variant mb-2" aria-label="Breadcrumb">
      <span>Parts database</span>
      <span className="text-outline">/</span>
      <span className="text-on-surface font-medium">Add parts</span>
      {ap ? (
        <span className="px-1.5 py-0.5 rounded bg-surface-container font-mono-sm text-mono-sm text-on-secondary-container">{ap}</span>
      ) : null}
      <span className="text-outline hidden sm:inline">·</span>
      <span className="text-on-surface font-semibold hidden sm:inline">{tail}</span>
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
