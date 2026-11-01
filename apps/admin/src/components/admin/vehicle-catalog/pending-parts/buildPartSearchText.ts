import type {
  PendingPartsGroupNote,
  PendingPartsQueueGroup,
  VehicleCatalogBrief,
} from "../../../../services/pendingPartsCatalogService";

function vehicleYearRange(v: VehicleCatalogBrief | undefined): string {
  if (!v) return "";
  const start = v.production_start_year;
  const end = v.production_end_year;
  if (start && end) return `${start}–${end}`;
  if (start) return `${start}–`;
  if (end) return `–${end}`;
  return "";
}

function vehicleTitleLine(partPlainName: string, v: VehicleCatalogBrief | undefined): string {
  const years = vehicleYearRange(v);
  const makeModel = v ? [v.make, v.model, years].filter(Boolean).join(" ") : "Vehicle";
  return `${partPlainName} — ${makeModel}`.trim();
}

function versionLine(v: VehicleCatalogBrief | undefined): string | null {
  if (!v) return null;
  const version = [v.trim_series, v.catalog_trim].filter(Boolean).join(" · ");
  return version ? `Version: ${version}` : null;
}

function drivetrainLine(v: VehicleCatalogBrief | undefined): string | null {
  if (!v) return null;
  const combo = [v.drivetrain, v.transmission].filter(Boolean).join(" · ");
  return combo ? `Drivetrain / gearbox: ${combo}` : null;
}

/** Human position for clipboard (Dominion staff). */
export function formatPendingRequestPosition(
  group: PendingPartsQueueGroup,
  positionAware: boolean,
): string | null {
  if (!positionAware) return null;
  const side = String(group.side || "").trim().toLowerCase();
  const fit = String(group.fitDescriptor || "").trim();
  if (!side && !fit) return null;

  const parts: string[] = [];
  if (fit) {
    const segments = fit.split(",").map((s) => s.trim()).filter(Boolean);
    for (const seg of segments) {
      const [axle, segSide] = seg.split(":");
      const axleLabel = axle === "rear" ? "Rear" : axle === "front" ? "Front" : axle ? axle.charAt(0).toUpperCase() + axle.slice(1) : "";
      const sideLabel = segSide === "left" ? "Left" : segSide === "right" ? "Right" : segSide === "both" ? "Both" : "";
      if (axleLabel && sideLabel) parts.push(`${axleLabel} · ${sideLabel}`);
      else if (axleLabel) parts.push(axleLabel);
    }
  }
  if (!parts.length && side) {
    const sideLabel = side === "left" ? "Left" : side === "right" ? "Right" : side === "both" ? "Both" : side.charAt(0).toUpperCase() + side.slice(1);
    parts.push(sideLabel);
  }
  if (!parts.length) return null;
  return `Position: ${parts.join("; ")}`;
}

function noteLines(notes: PendingPartsGroupNote[]): string[] {
  const lines: string[] = [];
  for (const note of notes) {
    const text = String(note.text || "").trim();
    if (text) lines.push(`Old part number / notes: "${text}"`);
  }
  return lines;
}

function searchLine(partPlainName: string, v: VehicleCatalogBrief | undefined): string {
  const tokens = [
    v?.make,
    v?.model,
    v?.chassis_code,
    v?.engine_code,
    partPlainName.toLowerCase(),
    "part number",
  ].filter(Boolean);
  return `Search: ${tokens.join(" ")}`;
}

/** Plain text for Google / parts-shop lookup. No fleet or customer details. */
export function buildPartSearchText(
  group: PendingPartsQueueGroup,
  vehicle: VehicleCatalogBrief | undefined,
  partPlainName: string,
  notes: PendingPartsGroupNote[],
  positionAware: boolean,
): string {
  const lines: string[] = [
    vehicleTitleLine(partPlainName, vehicle),
    versionLine(vehicle),
    vehicle?.chassis_code ? `Chassis: ${vehicle.chassis_code}` : null,
    vehicle?.engine_code ? `Engine: ${vehicle.engine_code}` : null,
    drivetrainLine(vehicle),
    formatPendingRequestPosition(group, positionAware),
    ...noteLines(notes),
    searchLine(partPlainName, vehicle),
  ].filter((line): line is string => Boolean(line && line.trim()));
  return lines.join("\n");
}
