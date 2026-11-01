import { formatPartsVersionTag, readPartsVehicleSpecs } from "@roam/types/partsVehicleContext";
import type { ComponentFitHints } from "./findPartsFitHints";
import type { Fp4AxleRow, Fp4OptionRow, Fp4SideOption, Fp4ViewModel } from "./findPartsViewModels";
import { formatKm, orDash, orNoneYet } from "./findPartsFormat";

function formatLabourMinutes(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return "None yet";
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded} mins`;
  const h = Math.floor(rounded / 60);
  const m = rounded % 60;
  return m > 0 ? `${h} hr ${m} mins` : `${h} hr`;
}

function fp4Heading(id: string): string {
  if (id === "rear") return "Back (rear)";
  if (id === "both") return "Both (front & back)";
  return "Front";
}

function brakeTypeTag(specs: Record<string, unknown>, axle: "front" | "rear"): string {
  const key = axle === "front" ? "brake_front_type" : "brake_rear_type";
  const raw = String(specs[key] ?? "").trim();
  if (!raw) return "—";
  if (/disc/i.test(raw)) return "DISC";
  if (/drum/i.test(raw)) return "DRUM";
  return raw.toUpperCase().slice(0, 12);
}

function specOrNone(value: unknown): string {
  const text = String(value ?? "").trim();
  return text ? text : "None yet";
}

function fp4OnFileLabel(count: number): string {
  if (count <= 0) return "None on file yet";
  return count === 1 ? "1 on file" : `${count} on file`;
}

function diagramBadgeLabel(selectedAxle: string, selectedSide: string, frontSide?: string, rearSide?: string): string {
  const sideLabel = (side: string) => (side === "both" ? "BOTH SIDES" : side.toUpperCase());
  if (selectedAxle === "both") {
    const f = frontSide || selectedSide;
    const r = rearSide || selectedSide;
    return `FRONT · ${sideLabel(f)} / REAR · ${sideLabel(r)}`;
  }
  const axle = selectedAxle === "rear" ? "REAR" : "FRONT";
  return `${axle} AXLE · ${sideLabel(selectedSide)}`;
}

export function buildFp4ViewModel(input: {
  ctx?: Record<string, unknown> | null;
  partName?: string;
  fitHints?: ComponentFitHints | null;
  selectedAxle?: string;
  selectedSide?: string;
  selectedFrontSide?: string;
  selectedRearSide?: string;
}): Fp4ViewModel {
  const ctx = input.ctx || {};
  const specs = readPartsVehicleSpecs(ctx);
  const hints = input.fitHints;
  const partLabel = orNoneYet(input.partName || String(ctx.part_label || ctx.partName || "parts"));
  const versionTag = formatPartsVersionTag(ctx);
  const selectedAxle = input.selectedAxle || "front";
  const selectedSide = input.selectedSide || "both";
  const frontSide = input.selectedFrontSide || selectedSide;
  const rearSide = input.selectedRearSide || selectedSide;
  const counts = hints?.countsByPosition ?? { front: 0, rear: 0 };
  const totalOnFile = counts.front + counts.rear;
  const showSideStep = Boolean(hints?.hasSideSpecificListings);
  const axleRows: Fp4AxleRow[] = [
    {
      id: "front",
      title: "Front",
      typeTag: brakeTypeTag(specs as Record<string, unknown>, "front"),
      partTitle: partLabel,
      onFileLabel: fp4OnFileLabel(counts.front),
      selected: selectedAxle === "front",
    },
    {
      id: "rear",
      title: "Back (rear)",
      typeTag: brakeTypeTag(specs as Record<string, unknown>, "rear"),
      partTitle: partLabel,
      onFileLabel: fp4OnFileLabel(counts.rear),
      selected: selectedAxle === "rear",
    },
    {
      id: "both",
      title: "Both (front & back)",
      typeTag: totalOnFile > 0 ? "FULL SET" : "—",
      partTitle: partLabel,
      onFileLabel: fp4OnFileLabel(totalOnFile),
      selected: selectedAxle === "both",
    },
  ];
  const sideOptions: Fp4SideOption[] = [
    { id: "left", label: "Left", selected: selectedSide === "left" },
    { id: "right", label: "Right", selected: selectedSide === "right" },
    { id: "both", label: "Both sides", selected: selectedSide === "both" },
  ];
  const labourDefault = Number(ctx.labour_minutes ?? ctx.labourMinutes);
  const options: Fp4OptionRow[] = ["front", "rear", "both"].map((id) => ({
    id,
    heading: fp4Heading(id),
    title: partLabel,
    subtitle: "None yet",
    replacementTimeLabel: formatLabourMinutes(labourDefault || undefined),
    offerLabel: id === "both" ? "Full set" : "—",
    infoLine: "None yet",
  }));
  const chassisRaw = String(specs.chassis_code || ctx.chassis_code || ctx.chassis || "").trim();
  return {
    plate: orDash(String(ctx.plate || "")),
    vehicleLabel: orNoneYet(String(ctx.label || "")),
    odometerLabel: formatKm(Number(ctx.odometer)),
    lastServiceLabel: orNoneYet(String(ctx.lastService || ctx.last_service || "")),
    healthPercent: orNoneYet(String(ctx.health_pct ?? "")),
    hubLabel: orNoneYet(String(ctx.hub_label || ctx.hubLabel || "Fleet hub")),
    fleetTip: orNoneYet(String(ctx.fleet_tip || ctx.fleetTip || "")),
    trimLabel: versionTag,
    versionTag,
    partLabel,
    fitmentEyebrow: `${partLabel.toUpperCase()} FITMENT`,
    diagramBadge: diagramBadgeLabel(selectedAxle, selectedSide, frontSide, rearSide),
    scaleLabel: "SCALE 1:32",
    frontSpec: {
      title: "FRONT · Disc brakes",
      tag: brakeTypeTag(specs as Record<string, unknown>, "front"),
      description: "None yet",
      rotor: specOrNone(specs.brake_front_rotor_mm),
      piston: specOrNone(specs.brake_front_piston),
    },
    rearSpec: {
      title: "REAR · Drum brakes",
      tag: brakeTypeTag(specs as Record<string, unknown>, "rear"),
      description: "None yet",
      drum: specOrNone(specs.brake_rear_drum_mm),
      cylinder: specOrNone(specs.brake_rear_cylinder_mm),
    },
    chassisProfile: {
      code: chassisRaw ? orDash(chassisRaw) : "—",
      drive: specOrNone(specs.drivetrain),
      abs: specOrNone(specs.abs_channels),
      handbrake: specOrNone(specs.handbrake_type),
      pattern: specOrNone(specs.hub_bolt_pattern),
    },
    axleRows,
    sideOptions,
    options,
    showSideStep,
    axleSetAdvisory: showSideStep
      ? null
      : "These come as an axle set (left and right together).",
    frontSideOptions: sideOptions.map((o) => ({ ...o, selected: frontSide === o.id })),
    rearSideOptions: sideOptions.map((o) => ({ ...o, selected: rearSide === o.id })),
  };
}
