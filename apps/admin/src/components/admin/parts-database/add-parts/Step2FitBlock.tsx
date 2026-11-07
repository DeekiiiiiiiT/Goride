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

const DRIVER_PASSENGER_REAR = [
  { id: "driver", label: "Driver" },
  { id: "passenger", label: "Passenger" },
  { id: "rear", label: "Rear" },
];

const LOW_HIGH_BEAM = [
  { id: "low", label: "Low beam" },
  { id: "high", label: "High beam" },
];

const FRONT_REAR_SIDE = [
  { id: "front", label: "Front" },
  { id: "rear", label: "Rear" },
  { id: "side", label: "Side" },
];

export function TriplePositionRow({
  options,
  position,
  onPick,
}: {
  options: Array<{ id: string; label: string }>;
  position: string;
  onPick: (pos: string, side: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-space-sm">
      {options.map((p) => {
        const active = position === p.id;
        return (
          <button
            key={p.id}
            type="button"
            className={
              active
                ? "h-10 rounded-lg bg-primary-container text-on-primary font-body-sm font-semibold flex items-center justify-center shadow-sm"
                : "h-10 rounded-lg bg-surface-container-low text-on-surface-variant hover:text-on-surface font-body-sm font-medium flex items-center justify-center"
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

export function ChassisCornerDiagram({
  position,
  side,
  onPick,
}: {
  position: string;
  side: string;
  onPick: (pos: string, side: string) => void;
}) {
  return (
    <div className="relative w-full max-w-[220px] mx-auto aspect-[4/3] rounded-xl border border-dashed border-outline-variant/60 bg-surface-container-low p-4">
      <span className="absolute top-2 left-1/2 -translate-x-1/2 font-mono-sm text-mono-sm text-outline uppercase">Front</span>
      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 font-mono-sm text-mono-sm text-outline uppercase">Rear</span>
      <div className="grid grid-cols-2 gap-8 h-full items-center">
        {CORNER_SIDES.map((c) => {
          const active = position === c.pos && side === c.side;
          return (
            <button
              key={`${c.pos}-${c.side}`}
              type="button"
              className={
                active
                  ? "h-9 rounded-lg bg-primary-container text-on-primary font-mono-sm text-mono-sm font-semibold"
                  : "h-9 rounded-lg bg-surface-container-lowest border border-outline-variant/40 font-mono-sm text-mono-sm text-on-surface-variant"
              }
              onClick={() => onPick(c.pos, c.side)}
            >
              {c.label.replace(" ", "\n")}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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
            aria-pressed={active}
            onClick={() => onPick(p.id, "")}
          >
            {/* Filled only when picked, so an unpicked axle never looks chosen. */}
            <MaterialIcon name={active ? "radio_button_checked" : "radio_button_unchecked"} className="text-[18px]" />
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
  if (scheme === "driver_passenger_rear") {
    return <TriplePositionRow options={DRIVER_PASSENGER_REAR} position={position} onPick={onPick} />;
  }
  if (scheme === "low_high_beam") {
    return <TriplePositionRow options={LOW_HIGH_BEAM} position={position} onPick={onPick} />;
  }
  if (scheme === "front_rear_side") {
    return <TriplePositionRow options={FRONT_REAR_SIDE} position={position} onPick={onPick} />;
  }
  if (scheme === "four_corners" || scheme === "axle_left_right") {
    return (
      <div className="flex flex-col gap-space-md">
        <ChassisCornerDiagram position={position} side={side} onPick={onPick} />
        <div className="flex flex-wrap gap-2">
          {CORNER_SIDES.map((c) => (
            <button
              key={`${c.pos}-${c.side}`}
              type="button"
              className={position === c.pos && side === c.side ? "px-3 py-1 rounded-full bg-primary/10 border border-primary text-primary text-body-sm font-mono-sm" : "px-3 py-1 rounded-full border border-outline-variant/50 text-body-sm text-on-surface-variant font-mono-sm"}
              onClick={() => onPick(c.pos, c.side)}
            >
              {c.label}
            </button>
          ))}
        </div>
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
      {partType.specFields.map((field) => {
        const displayLabel = field.specKey === "wiper_driver_mm" ? "Length" : field.label;
        return (
        <label key={field.specKey} className="flex flex-col gap-1 font-body-sm">
          <span className="font-label-md text-label-md font-semibold text-on-surface">{displayLabel}</span>
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
        );
      })}
    </div>
  );
}
