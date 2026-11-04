// Stitch AP12 — position + spec fields per part type
import { MaterialIcon } from "../import/MaterialIcon";
import type { AddPartsDraft, PartTypeRow } from "./addPartsTypes";

const AXLE_POSITIONS = [
  { id: "front", label: "Front Axle", icon: "adjust" as const },
  { id: "rear", label: "Rear Axle", icon: "radio_button_unchecked" as const },
];

const CATALYST_POSITIONS = [
  { id: "before_cat", label: "Before cat" },
  { id: "after_cat", label: "After cat" },
];

const CORNER_SIDES = [
  { pos: "front", side: "left", label: "Front left" },
  { pos: "front", side: "right", label: "Front right" },
  { pos: "rear", side: "left", label: "Rear left" },
  { pos: "rear", side: "right", label: "Rear right" },
];

export function AxlePositionButtons({
  position,
  onPick,
}: {
  position: string;
  onPick: (pos: string, side: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-space-sm">
      {AXLE_POSITIONS.map((p) => {
        const active = position === p.id;
        return (
          <button
            key={p.id}
            type="button"
            className={
              active
                ? "h-10 rounded-lg bg-primary-container text-on-primary font-body-sm font-semibold flex items-center justify-center gap-2 shadow-sm"
                : "h-10 rounded-lg bg-surface-container-low text-on-surface-variant hover:text-on-surface font-body-sm font-medium flex items-center justify-center gap-2"
            }
            onClick={() => onPick(p.id, "")}
          >
            <MaterialIcon name={p.icon} className="text-[18px]" />
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export function CatalystPositionButtons({
  position,
  onPick,
}: {
  position: string;
  onPick: (pos: string, side: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-space-sm">
      {CATALYST_POSITIONS.map((p) => {
        const active = position === p.id;
        return (
          <button
            key={p.id}
            type="button"
            className={
              active
                ? "h-10 rounded-lg bg-primary-container text-on-primary font-body-sm font-semibold flex items-center justify-center gap-2 shadow-sm"
                : "h-10 rounded-lg bg-surface-container-low text-on-surface-variant hover:text-on-surface font-body-sm font-medium flex items-center justify-center gap-2"
            }
            onClick={() => onPick(p.id, "")}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export function PositionChips({
  scheme,
  position,
  side,
  onPick,
}: {
  scheme: string;
  position: string;
  side: string;
  onPick: (pos: string, side: string) => void;
}) {
  if (scheme === "none") return null;
  if (scheme === "before_after_catalyst") {
    return <CatalystPositionButtons position={position} onPick={onPick} />;
  }
  if (scheme === "axle" || scheme === "axle_inner_outer") {
    return <AxlePositionButtons position={position} onPick={onPick} />;
  }
  if (scheme === "four_corners" || scheme === "axle_left_right") {
    return (
      <div className="flex flex-wrap gap-2">
        {CORNER_SIDES.map((c) => (
          <button
            key={`${c.pos}-${c.side}`}
            type="button"
            className={position === c.pos && side === c.side ? "px-3 py-1 rounded-full bg-primary/10 border border-primary text-primary text-body-sm" : "px-3 py-1 rounded-full border border-outline-variant/50 text-body-sm text-on-surface-variant"}
            onClick={() => onPick(c.pos, c.side)}
          >
            {c.label}
          </button>
        ))}
      </div>
    );
  }
  return null;
}

export function SpecFieldsBlock({
  partType,
  draft,
  setDraft,
}: {
  partType: PartTypeRow;
  draft: AddPartsDraft;
  setDraft: (d: AddPartsDraft) => void;
}) {
  if (!partType.specFields.length) return null;
  return (
    <div className="flex flex-col gap-3">
      {partType.specFields.map((field) => (
        <label key={field.specKey} className="flex flex-col gap-1 font-body-sm">
          {field.label}
          {field.unit ? <span className="text-on-surface-variant text-xs">{field.unit}</span> : null}
          <input
            className="h-10 px-3 rounded-xl border border-outline-variant/50 font-mono"
            placeholder={field.example ?? ""}
            value={draft.specValues[field.specKey] ?? (draft.specKey === field.specKey ? draft.specValue : "")}
            onChange={(e) => {
              const val = e.target.value;
              setDraft({
                ...draft,
                specKey: field.specKey,
                specValue: val,
                specValues: { ...draft.specValues, [field.specKey]: val },
              });
            }}
          />
        </label>
      ))}
    </div>
  );
}
