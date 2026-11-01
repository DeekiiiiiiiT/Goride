import { formatKm, formatPercent, formatPriceJmd, orDash, orNoneYet, wearLifeBarPercent } from "./findPartsFormat";
import type { PartsMyVehicleRow, PartsVehicleOptions } from "./findPartsTypes";
import { PART_MATCH_TIERS } from "../../../../../../packages/types/src/partsResolution.ts";
import { formatPartsVersionTag, readPartsVehicleSpecs } from "@roam/types/partsVehicleContext";

function catalogPhotoUrl(raw?: string | null): string {
  const url = String(raw || "").trim();
  if (!url || /googleusercontent\.com/i.test(url)) return "";
  return url;
}

export type Fp2VersionRow = {
  id: string;
  title: string;
  subtitle: string;
  chassisHint: string;
  fleetShareLabel: string;
  selected?: boolean;
};

export type Fp2ViewModel = {
  plate: string;
  vehicleTitle: string;
  vehicleLabel: string;
  chassisExample: string;
  trimCode: string;
  versions: Fp2VersionRow[];
  fleetFitPercent: string;
  fleetSummary: string;
  hubLabel: string;
  radarTitle: string;
  vehicleHeroLabel: string;
  fitSummaryLine: string;
  fleetUnits: Array<{ unitCode: string; plateLabel: string; statusLabel: string; trimBadge: string }>;
  vehiclePhotoUrl: string;
};

export function buildFp2ViewModel(input: {
  make: string;
  model: string;
  year: number | null;
  plate?: string;
  options?: PartsVehicleOptions | null;
  fleetRows?: PartsMyVehicleRow[];
  vehiclePhotoUrl?: string | null;
}): Fp2ViewModel {
  const title = [input.year, input.make, input.model].filter(Boolean).join(" ");
  const versionsRaw = input.options?.versions || [];
  const trimCode = orDash(versionsRaw[0]?.name?.split(" ")[0] || "—");
  const notSureRow: Fp2VersionRow = {
    id: "any",
    title: "Not sure",
    subtitle: "Universal Catalog Mode",
    chassisHint: "—",
    fleetShareLabel: "Shows all matching options",
  };
  const maxFleetCount = versionsRaw.reduce((max, v) => Math.max(max, Number(v.fleetCount ?? 0)), 0);
  let versions: Fp2VersionRow[] = [];
  if (versionsRaw.length) {
    versions = versionsRaw.map((v, index) => {
      const serialFrom = String(v.chassis_serial_from ?? "").trim();
      const prefix = String(v.chassisPrefix ?? "").trim();
      const chassisHint = serialFrom || prefix || "Chassis match";
      const fleetCount = Number(v.fleetCount ?? 0);
      let fleetShareLabel = fleetCount > 0 ? `${fleetCount} in fleet` : "None yet";
      if (maxFleetCount > 0 && fleetCount === maxFleetCount) {
        fleetShareLabel = "Most common in fleet";
      }
      return {
        id: String(v.id),
        title: orNoneYet(v.name || v.description),
        subtitle: orNoneYet(v.description || v.name),
        chassisHint: orDash(chassisHint),
        fleetShareLabel,
        selected: index === 0,
      };
    });
    if (!versions.some((v) => v.id === "any")) {
      versions.push({ ...notSureRow, selected: false });
    }
  } else {
    versions = [{ ...notSureRow, selected: true }];
  }
  const fleetCount = input.fleetRows?.length ?? 0;
  const fitPct = fleetCount > 0 ? formatPercent(100) : "0%";
  const hub = orNoneYet(String((input.fleetRows?.[0] as { hub?: string })?.hub || "Fleet hub"));
  const fleetUnits = (input.fleetRows || []).slice(0, 2).map((row, index) => ({
    unitCode: `#${String(index + 1).padStart(2, "0")}`,
    plateLabel: `${orDash(row.plate)} (${orNoneYet(row.label || row.name)})`,
    statusLabel: index === 0 ? `Active Dispatch · ${hub}` : "In Depot",
    trimBadge: trimCode,
  }));
  if (!fleetUnits.length) {
    fleetUnits.push({ unitCode: "—", plateLabel: "None yet", statusLabel: "None yet", trimBadge: "—" });
  }
  const fitSummaryLine = `${fitPct} of Roam fleet fits are ${orNoneYet(versions[0]?.title)} variants.`;

  return {
    plate: orDash(input.plate),
    vehicleTitle: orNoneYet(title),
    vehicleLabel: orNoneYet(title),
    chassisExample: orDash(versions[0]?.chassisHint),
    trimCode,
    versions,
    fleetFitPercent: fitPct,
    fleetSummary: fleetCount > 0 ? `${fleetCount} in fleet` : "None yet",
    hubLabel: hub,
    radarTitle: orNoneYet(versions[0]?.title).toUpperCase(),
    vehicleHeroLabel: orNoneYet(title).toUpperCase(),
    fitSummaryLine,
    fleetUnits,
    vehiclePhotoUrl: catalogPhotoUrl(input.vehiclePhotoUrl),
  };
}

export type Fp3PartTile = {
  id: string;
  name: string;
  priceLabel: string;
  meta: string;
  statusLabel: string;
  icon: string;
  active?: boolean;
  positionAware?: boolean;
  onFileCount?: number;
};

export type Fp3SubChip = {
  id: string;
  name: string;
  metaLabel: string;
  onFileLabel: string;
  positionAware?: boolean;
  selected?: boolean;
  disabled?: boolean;
};

export type Fp3AreaRow = {
  id: string;
  name: string;
  areaIndex: string;
  partCount: number;
  onFileLabel: string;
  /** Short label for v3 area cards, e.g. "28 on file". */
  onFileShortLabel: string;
  /** First three component names in the area. */
  partTypesLine: string;
  icon: string;
  selected?: boolean;
  subChips: Fp3SubChip[];
};

export type Fp3OverlayRow = {
  id: string;
  name: string;
  opCode: string;
  descriptionLine: string;
  onFileLabel: string;
  onFile: boolean;
  iconKey: string;
  oemPartNumber: string;
  axleNote: string;
  positionAware?: boolean;
};

export type Fp3OverlayViewModel = {
  areaName: string;
  areaIcon: string;
  partsInArea: number;
  onFileForCar: number;
  rowsOnFile: Fp3OverlayRow[];
  rowsNotOnFile: Fp3OverlayRow[];
  areaEmptyNote: string;
  catalogAddAvgMinutes: number | null;
  targetEngineLine: string;
  requestRouteLine: string;
  vehicleLabel: string;
  expandedNotOnFileId: string;
};

export type Fp3SymptomPart = {
  id: string;
  name: string;
  subName: string;
  priceLabel: string;
  weightLabel: string;
  onFileLabel: string;
  matchTypeLabel: string;
  crossRefLabel: string;
  positionAware?: boolean;
};

export type Fp3SymptomRow = {
  id: string;
  name: string;
  weightLabel: string;
  answerText: string;
  parts: Fp3SymptomPart[];
};

export type Fp3SearchHit = {
  id: string;
  name: string;
  note?: string;
  tag?: string;
  positionAware?: boolean;
};

export type Fp3ServiceDueRow = {
  id: string;
  name: string;
};

function fp3ServiceDueDisplayName(name: string, position?: string | null): string {
  const base = orNoneYet(name);
  if (!position) return base;
  const pos = String(position).toLowerCase();
  const label = pos === "front" ? "Front" : pos === "rear" ? "Rear" : position;
  return `${base} · ${label}`;
}

function dedupeServiceDueRows(rows: Fp3ServiceDueRow[]): Fp3ServiceDueRow[] {
  const seen = new Set<string>();
  const out: Fp3ServiceDueRow[] = [];
  for (const row of rows) {
    const key = row.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function fp3TelematicsLine(ctx: Record<string, unknown>): string {
  const note = ctx.latestNote as { text?: string; at?: string | null } | null | undefined;
  const text = note?.text ? String(note.text).trim() : "";
  if (!text) return "None yet";
  const at = note?.at ? new Date(String(note.at)) : null;
  if (at && !Number.isNaN(at.getTime())) {
    const datePart = at.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${text} (Logged ${datePart})`;
  }
  return text;
}

export type Fp3ViewModel = {
  plate: string;
  vehicleLabel: string;
  trimLabel: string;
  odometerLabel: string;
  healthPercent: string;
  priceAltLabel: string;
  partTiles: Fp3PartTile[];
  areaLabels: string[];
  areas: Fp3AreaRow[];
  symptoms: Fp3SymptomRow[];
  categoryTotal: number;
  selectedPartName: string;
  partTotal: number;
  searchHits: Fp3SearchHit[];
  servicesDue: string[];
  serviceDueRows: Fp3ServiceDueRow[];
  hubLabel: string;
  orgShortCode: string;
  telematicsLine: string;
  chassisCode: string;
  versionTag: string;
  nextHint?: string;
  brakeFrontType: string;
  brakeRearType: string;
  locationChip: string;
  chosenOnFileCount: number;
  chosenOpCode: string;
  catalogAddAvgMinutes: number | null;
};

type Fp3BrowseInput = {
  areas?: Array<{ id?: string; name?: string; parts?: Array<{ id: string; name: string; priceJmd?: number; positionAware?: boolean; count?: number; opCode?: string | null; description?: string | null; bestOemPartNumber?: string | null; bestListingPosition?: string | null }> }>;
  systems?: Array<{ id: string; plainName?: string; name?: string; areaIndex?: string; count?: number; icon?: string | null; components?: Array<{ id: string; plainName?: string; name?: string; count?: number; positionAware?: boolean; opCode?: string | null; description?: string | null; iconKey?: string | null; bestOemPartNumber?: string | null; bestListingPosition?: string | null }> }>;
  common?: Array<{ id: string; name?: string; plainName?: string; priceJmd?: number; positionAware?: boolean; description?: string; count?: number; opCode?: string | null }>;
};

export function fp3OnFileAreaLabel(count: number): string {
  if (count <= 0) return "None on file yet";
  if (count === 1) return "1 part on file for your car";
  return `${count} parts on file for your car`;
}

export function fp3ChipOnFileLabel(count: number): string {
  if (count <= 0) return "Not on file yet";
  return `${count} on file`;
}

export function fp3CommonStatusLabel(count: number, active: boolean): string {
  if (active && count > 0) return `${count} TYPES`;
  if (active) return "Active";
  if (count > 0) return "On file";
  return "None";
}

export function fp3AreaOnFileShort(count: number): string {
  if (count <= 0) return "None on file yet";
  if (count === 1) return "1 on file";
  return `${count} on file`;
}

function fp3PartTypesLine(names: string[]): string {
  const slice = names.filter(Boolean).slice(0, 3);
  return slice.length ? slice.join(", ") : "—";
}

function fp3AxleNote(
  position: string | null | undefined,
  brakeFront: string,
  brakeRear: string,
): string {
  const pos = String(position || "").toLowerCase();
  const type = pos === "rear" ? brakeRear : pos === "front" ? brakeFront : "";
  const axle = pos === "rear" ? "Rear axle" : pos === "front" ? "Front axle" : "";
  if (axle && type && type !== "—") return `${axle} (${type})`;
  if (axle) return axle;
  return "";
}

function fp3OverlayRowFromComponent(
  row: {
    id: string;
    plainName?: string;
    name?: string;
    count?: number;
    positionAware?: boolean;
    opCode?: string | null;
    description?: string | null;
    iconKey?: string | null;
    bestOemPartNumber?: string | null;
    bestListingPosition?: string | null;
  },
  brakeFront: string,
  brakeRear: string,
): Fp3OverlayRow {
  const count = Number(row.count ?? 0);
  const onFile = count > 0;
  const name = orNoneYet(row.plainName || row.name);
  const desc = String(row.description || "").trim();
  return {
    id: row.id,
    name,
    opCode: orDash(String(row.opCode || "").trim() || "—"),
    descriptionLine: desc,
    onFileLabel: fp3ChipOnFileLabel(count),
    onFile,
    iconKey: fp3AreaIcon(name, row.iconKey),
    oemPartNumber: onFile ? orDash(String(row.bestOemPartNumber || "").trim() || "—") : "",
    axleNote: onFile ? fp3AxleNote(row.bestListingPosition, brakeFront, brakeRear) : "",
    positionAware: row.positionAware,
  };
}

export function buildFp3OverlayViewModel(input: {
  area?: Fp3AreaRow;
  browse?: Fp3BrowseInput;
  ctx?: Record<string, unknown> | null;
  catalogAddAvgMinutes?: number | null;
  expandedNotOnFileId?: string;
}): Fp3OverlayViewModel | null {
  const area = input.area;
  if (!area) return null;
  const ctx = input.ctx || {};
  const specs = (ctx.specs || {}) as Record<string, unknown>;
  const brakeFront = orDash(String(specs.brake_front_type || specs.brakeFrontType || ""));
  const brakeRear = orDash(String(specs.brake_rear_type || specs.brakeRearType || ""));
  const engineCode = orDash(String(specs.engine_code || ""));
  const disp = specs.engine_displacement_l != null ? String(specs.engine_displacement_l) : "";
  const engineLine = engineCode !== "—"
    ? `${engineCode}${disp ? ` (${disp}L)` : ""}`
    : "—";
  const system = input.browse?.systems?.find((s) => s.id === area.id);
  const components = system?.components || input.browse?.areas?.find((a) => String(a.id) === area.id)?.parts || [];
  const rows = (components as Array<Parameters<typeof fp3OverlayRowFromComponent>[0]>).map((row) =>
    fp3OverlayRowFromComponent(row, brakeFront, brakeRear)
  );
  rows.sort((a, b) => (a.onFile === b.onFile ? a.name.localeCompare(b.name) : a.onFile ? -1 : 1));
  const rowsOnFile = rows.filter((r) => r.onFile);
  const rowsNotOnFile = rows.filter((r) => !r.onFile);
  const onFileForCar = rowsOnFile.length;
  return {
    areaName: area.name,
    areaIcon: area.icon,
    partsInArea: rows.length,
    onFileForCar,
    rowsOnFile,
    rowsNotOnFile,
    areaEmptyNote: onFileForCar <= 0
      ? `Roam doesn't have any ${area.name} parts on file for this car yet. You can still ask Roam to add what you need.`
      : "",
    catalogAddAvgMinutes: input.catalogAddAvgMinutes ?? null,
    targetEngineLine: `TARGET ENGINE: ${engineLine}`,
    requestRouteLine: "REQUEST ROUTE: Fleet catalog intake → Dominion parts desk → catalog publish",
    vehicleLabel: orNoneYet(String(ctx.label || "")),
    expandedNotOnFileId: input.expandedNotOnFileId || "",
  };
}

const FP3_DB_ICON_SLUGS = new Set(["brakes", "oil", "droplet", "wind", "suspension", "tires", "gears", "belt"]);

/** True when icon_key is a Material Symbols name, not a catalog slug like "brakes". */
export function isMaterialSymbolIconKey(iconKey: string): boolean {
  const key = iconKey.trim().toLowerCase();
  if (!key || FP3_DB_ICON_SLUGS.has(key)) return false;
  if (key.includes("_")) return true;
  return new Set(["bolt", "category", "highlight", "adjust", "air", "inventory_2", "filter_list", "flash_on", "lightbulb", "hvac", "battery_charging_full"]).has(key);
}

export function fp3AreaIcon(name: string, iconKey?: string | null): string {
  const key = String(iconKey || "").trim();
  if (key && isMaterialSymbolIconKey(key)) return key.toLowerCase();
  const text = name.toLowerCase();
  if (text.includes("battery") || text.includes("electrical")) return "bolt";
  if (text.includes("belt") || text.includes("hose")) return "alt_route";
  if (text.includes("brake")) return "disc_full";
  if (text.includes("engine")) return "settings_suggest";
  if (text.includes("filter")) return "filter_alt";
  if (text.includes("fluid")) return "water_drop";
  if (text.includes("hvac")) return "mode_fan";
  if (text.includes("light")) return "highlight";
  if (text.includes("suspension") || text.includes("steer")) return "swap_vert";
  if (text.includes("tire") || text.includes("wheel")) return "adjust";
  if (text.includes("transmission")) return "linear_scale";
  return "category";
}

export function fp3CommonIcon(name: string): string {
  const text = name.toLowerCase();
  if (text.includes("oil filter")) return "filter_list";
  if (text.includes("air filter")) return "air";
  if (text.includes("brake pad")) return "disc_full";
  if (text.includes("wiper")) return "water_drop";
  if (text.includes("battery")) return "battery_charging_full";
  if (text.includes("spark")) return "flash_on";
  if (text.includes("cabin")) return "hvac";
  if (text.includes("headlight") || text.includes("bulb")) return "lightbulb";
  return "inventory_2";
}

function fp3ComponentIndex(browse: Fp3BrowseInput | undefined) {
  const map = new Map<string, { name: string; priceJmd?: number; positionAware?: boolean; areaName?: string }>();
  for (const area of browse?.areas || []) {
    for (const part of area.parts || []) {
      map.set(part.id, {
        name: orNoneYet(part.name),
        priceJmd: part.priceJmd,
        positionAware: part.positionAware,
        areaName: orNoneYet(area.name),
      });
    }
  }
  for (const system of browse?.systems || []) {
    for (const row of system.components || []) {
      map.set(row.id, {
        name: orNoneYet(row.plainName || row.name),
        positionAware: row.positionAware,
        areaName: orNoneYet(system.plainName || system.name),
      });
    }
  }
  return map;
}

function fp3AreasFromBrowse(browse: Fp3BrowseInput | undefined, selectedAreaId?: string, selectedChipId?: string): Fp3AreaRow[] {
  if (browse?.areas?.length) {
    return browse.areas.map((area, index) => {
      const subChips = (area.parts || []).map((part) => {
        const count = Number(part.count ?? 0);
        return {
          id: part.id,
          name: orNoneYet(part.name),
          metaLabel: fp3ChipOnFileLabel(count),
          onFileLabel: fp3ChipOnFileLabel(count),
          positionAware: part.positionAware,
          selected: selectedChipId === part.id,
          disabled: count <= 0,
        };
      });
      const partCount = subChips.reduce((sum, row) => sum + (row.disabled ? 0 : Number(String(row.onFileLabel).match(/^\d+/)?.[0] || 0)), 0)
        || subChips.length;
      const areaCount = (area.parts || []).reduce((sum, part) => sum + Number(part.count ?? 0), 0);
      const typeNames = (area.parts || []).map((p) => orNoneYet(p.name));
      return {
        id: String(area.id || area.name || "area"),
        name: orNoneYet(area.name),
        areaIndex: String(index + 1).padStart(2, "0"),
        partCount: areaCount || partCount,
        onFileLabel: fp3OnFileAreaLabel(areaCount),
        onFileShortLabel: fp3AreaOnFileShort(areaCount),
        partTypesLine: fp3PartTypesLine(typeNames),
        icon: fp3AreaIcon(orNoneYet(area.name)),
        selected: selectedAreaId === String(area.id || area.name),
        subChips,
      };
    });
  }
  if (browse?.systems?.length) {
    return browse.systems.map((system, index) => {
      const subChips = (system.components || []).map((row) => {
        const count = Number(row.count ?? 0);
        return {
          id: row.id,
          name: orNoneYet(row.plainName || row.name),
          metaLabel: fp3ChipOnFileLabel(count),
          onFileLabel: fp3ChipOnFileLabel(count),
          positionAware: row.positionAware,
          selected: selectedChipId === row.id,
          disabled: count <= 0,
        };
      });
      const areaCount = Number(system.count ?? subChips.reduce((sum, row) => sum + Number(String(row.onFileLabel).match(/^\d+/)?.[0] || 0), 0));
      const typeNames = (system.components || []).map((row) => orNoneYet(row.plainName || row.name));
      return {
        id: system.id,
        name: orNoneYet(system.plainName || system.name),
        areaIndex: String(index + 1).padStart(2, "0"),
        partCount: areaCount,
        onFileLabel: fp3OnFileAreaLabel(areaCount),
        onFileShortLabel: fp3AreaOnFileShort(areaCount),
        partTypesLine: fp3PartTypesLine(typeNames),
        icon: fp3AreaIcon(orNoneYet(system.plainName || system.name), system.icon),
        selected: selectedAreaId === system.id,
        subChips,
      };
    });
  }
  return fp3StitchFallbackAreas();
}

function fp3StitchFallbackAreas(): Fp3AreaRow[] {
  const rows: Array<{ id: string; name: string; count: number; icon: string }> = [
    { id: "belts", name: "Belts & hoses", count: 2, icon: "alt_route" },
    { id: "lighting", name: "Lighting & visibility", count: 5, icon: "highlight" },
    { id: "tires", name: "Tires & wheels", count: 4, icon: "adjust" },
  ];
  return rows.map((row, index) => ({
    id: row.id,
    name: row.name,
    areaIndex: String(index + 1).padStart(2, "0"),
    partCount: row.count,
    onFileLabel: fp3OnFileAreaLabel(row.count),
    onFileShortLabel: fp3AreaOnFileShort(row.count),
    partTypesLine: "—",
    icon: row.icon,
    selected: index === 0,
    subChips: [],
  }));
}

function fp3SymptomWeight(rank: number): string {
  const pct = Math.max(55, 100 - (Math.max(rank, 1) - 1) * 12);
  if (rank <= 1) return `High probability (${formatPercent(pct)})`;
  return formatPercent(pct);
}

export function buildFp3ViewModel(input: {
  ctx?: Record<string, unknown> | null;
  browse?: Fp3BrowseInput;
  symptoms?: {
    problems?: Array<{ id: string; name: string; hint?: string; positionAware?: boolean }>;
    symptoms?: Array<{ id: string; label: string; hint?: string | null; components?: Array<{ componentId: string; rank?: number }> }>;
  };
  selectedAreaId?: string;
  selectedChipId?: string;
  selectedPartName?: string;
  searchHits?: Fp3SearchHit[];
  nextHint?: string;
}): Fp3ViewModel {
  const ctx = input.ctx || {};
  const trim = orDash(String(ctx.trim || ctx.variant || ctx.subtitle || ""));
  const componentIndex = fp3ComponentIndex(input.browse);
  const selectedChipId = input.selectedChipId || "";
  const tiles: Fp3PartTile[] = [];
  for (const part of input.browse?.common || []) {
    const count = Number(part.count ?? 0);
    const name = orNoneYet(part.plainName || part.name);
    const active = selectedChipId === part.id;
    tiles.push({
      id: part.id,
      name,
      priceLabel: "—",
      meta: fp3CommonStatusLabel(count, active),
      statusLabel: fp3CommonStatusLabel(count, active),
      icon: fp3CommonIcon(name),
      active,
      positionAware: part.positionAware,
      onFileCount: count,
    });
  }
  for (const area of input.browse?.areas || []) {
    for (const part of area.parts || []) {
      tiles.push({
        id: part.id,
        name: orNoneYet(part.name),
        priceLabel: "—",
        meta: orNoneYet(area.name),
      });
    }
  }
  if (!tiles.some((tile) => tile.name.toLowerCase().includes("cabin filter"))) {
    tiles.push({
      id: "stitch-cabin-filter",
      name: "Cabin filter",
      priceLabel: "—",
      meta: "On file",
      statusLabel: "On file",
      icon: fp3CommonIcon("Cabin filter"),
      active: false,
      onFileCount: 1,
    });
  }
  const areaRows = fp3AreasFromBrowse(input.browse, input.selectedAreaId, input.selectedChipId);
  const areaLabels = areaRows.map((a) => a.name).filter((n) => n !== "None yet");
  const dueRaw = Array.isArray(ctx.due) ? ctx.due as Array<{ componentId?: string | null; name?: string; position?: string | null }> : [];
  const servicesLegacy = Array.isArray(ctx.services_due) ? (ctx.services_due as string[]) : [];
  const serviceDueRows: Fp3ServiceDueRow[] = dueRaw.length || servicesLegacy.length
    ? dedupeServiceDueRows(
      dueRaw.length
        ? dueRaw.map((row, index) => ({
            id: String(row.componentId || `due-${index}`),
            name: fp3ServiceDueDisplayName(String(row.name || "Service"), row.position),
          }))
        : servicesLegacy.map((name, index) => ({ id: `due-${index}`, name: orNoneYet(name) })),
    )
    : [];
  const servicesDue = serviceDueRows.map((row) => row.name);
  const symptomRows: Fp3SymptomRow[] = [];
  if (input.symptoms?.symptoms?.length) {
    for (const row of input.symptoms.symptoms) {
      const parts: Fp3SymptomPart[] = (row.components || []).slice(0, 4).map((link) => {
        const match = componentIndex.get(link.componentId);
        const rank = Number(link.rank ?? 1);
        const count = Number((link as { onFileCount?: number }).onFileCount ?? (link as { count?: number }).count ?? 0);
        const crossRefs = Number((link as { crossRefCount?: number }).crossRefCount ?? 0);
        const onFile = count > 0;
        return {
          id: link.componentId,
          name: orNoneYet(match?.name),
          subName: orNoneYet((link as { subName?: string }).subName || (link as { description?: string }).description || "Component assembly"),
          priceLabel: formatPriceJmd(match?.priceJmd),
          weightLabel: fp3SymptomWeight(rank),
          onFileLabel: onFile ? "On file" : "Not on file yet",
          matchTypeLabel: onFile ? (crossRefs > 0 ? "OEM & Aftermarket" : "OEM standard") : "Pending measurement",
          crossRefLabel: `${crossRefs} cross-refs`,
          positionAware: match?.positionAware,
        };
      }).filter((p) => p.id);
      symptomRows.push({
        id: row.id,
        name: orNoneYet(row.label),
        weightLabel: parts[0]?.weightLabel || "—",
        answerText: orNoneYet(row.hint || ""),
        parts,
      });
    }
  } else {
    for (const row of input.symptoms?.problems || []) {
      symptomRows.push({
        id: row.id,
        name: orNoneYet(row.name),
        weightLabel: fp3SymptomWeight(1),
        answerText: orNoneYet(row.hint || ""),
        parts: [{
          id: row.id,
          name: orNoneYet(row.name),
          subName: "Component assembly",
          priceLabel: formatPriceJmd(undefined),
          weightLabel: fp3SymptomWeight(1),
          onFileLabel: "Not on file yet",
          matchTypeLabel: "Pending measurement",
          crossRefLabel: "0 cross-refs",
          positionAware: row.positionAware,
        }],
      });
    }
  }
  if (!symptomRows.length) {
    symptomRows.push({
      id: "empty",
      name: "None yet",
      weightLabel: "—",
      answerText: "None yet",
      parts: [],
    });
  }
  const partTotal = areaRows.reduce((sum, area) => sum + (area.partCount || 0), 0) || tiles.length;
  const selectedChip = areaRows.flatMap((a) => a.subChips).find((c) => c.selected);
  const hubLabel = orNoneYet(String(ctx.hub_label || ctx.hubLabel || "Fleet hub"));
  const orgShortCode = orNoneYet(String(ctx.orgShortCode || ctx.org_short_code || "Fleet"));
  const versionTag = formatPartsVersionTag(ctx);
  const hasBrowseAreas = Boolean(input.browse?.areas?.length || input.browse?.systems?.length);
  const categoryTotal = hasBrowseAreas ? areaRows.length : 11;
  const specs = (ctx.specs || {}) as Record<string, unknown>;
  const brakeFrontType = orDash(String(specs.brake_front_type || ctx.brake_front_type || ""));
  const brakeRearType = orDash(String(specs.brake_rear_type || ctx.brake_rear_type || ""));
  const locationChip = orNoneYet(String(ctx.hub_label || ctx.hubLabel || hubLabel));
  const catalogAddAvgMinutes = typeof ctx.catalogAddAvgMinutes === "number" ? ctx.catalogAddAvgMinutes : null;
  let chosenOnFileCount = 0;
  let chosenOpCode = "—";
  if (selectedChipId) {
    for (const system of input.browse?.systems || []) {
      const match = system.components?.find((c) => c.id === selectedChipId);
      if (match) {
        chosenOnFileCount = Number(match.count ?? 0);
        chosenOpCode = orDash(String(match.opCode || "").trim() || "—");
        break;
      }
    }
  }
  return {
    plate: orDash(String(ctx.plate || "")),
    vehicleLabel: orNoneYet(String(ctx.label || "")),
    trimLabel: trim !== "—" ? trim : "None yet",
    odometerLabel: formatKm(Number(ctx.odometer)),
    healthPercent: formatPercent(Number(ctx.health_pct)),
    priceAltLabel: formatPriceJmd(Number((input.browse?.common?.[1] as { priceJmd?: number } | undefined)?.priceJmd)),
    partTiles: tiles.length ? tiles : [{ id: "empty", name: "None yet", priceLabel: "—", meta: "None", statusLabel: "None", icon: "inventory_2" }],
    areaLabels: areaLabels.length ? areaLabels : ["None yet"],
    areas: areaRows.length ? areaRows : [{ id: "empty", name: "None yet", areaIndex: "01", partCount: 0, onFileLabel: "None on file yet", onFileShortLabel: "None on file yet", partTypesLine: "—", icon: "category", subChips: [] }],
    symptoms: symptomRows.length ? symptomRows : [{ id: "empty", name: "None yet", weightLabel: "—", answerText: "None yet", parts: [] }],
    categoryTotal,
    selectedPartName: orNoneYet(input.selectedPartName || selectedChip?.name || ""),
    partTotal,
    searchHits: input.searchHits || [],
    servicesDue: servicesDue.length ? servicesDue : ["None yet"],
    serviceDueRows: serviceDueRows.length ? serviceDueRows : [{ id: "empty", name: "None yet" }],
    hubLabel,
    orgShortCode,
    telematicsLine: fp3TelematicsLine(ctx),
    chassisCode: orDash(String(ctx.chassis_code || specs.chassis_code || "")),
    versionTag: formatPartsVersionTag(ctx),
    nextHint: input.nextHint || "",
    brakeFrontType,
    brakeRearType,
    locationChip,
    chosenOnFileCount,
    chosenOpCode,
    catalogAddAvgMinutes,
  };
}

export type Fp4OptionRow = {
  id: string;
  heading: string;
  title: string;
  subtitle: string;
  replacementTimeLabel: string;
  offerLabel: string;
  infoLine: string;
};

export type Fp4AxleRow = {
  id: string;
  title: string;
  typeTag: string;
  partTitle: string;
  onFileLabel: string;
  selected?: boolean;
};

export type Fp4SideOption = {
  id: string;
  label: string;
  selected?: boolean;
};

export type Fp4ViewModel = {
  plate: string;
  vehicleLabel: string;
  odometerLabel: string;
  lastServiceLabel: string;
  healthPercent: string;
  hubLabel: string;
  fleetTip: string;
  trimLabel: string;
  versionTag: string;
  partLabel: string;
  fitmentEyebrow: string;
  diagramBadge: string;
  scaleLabel: string;
  frontSpec: { title: string; tag: string; description: string; rotor: string; piston: string };
  rearSpec: { title: string; tag: string; description: string; drum: string; cylinder: string };
  chassisProfile: { code: string; drive: string; abs: string; handbrake: string; pattern: string };
  axleRows: Fp4AxleRow[];
  sideOptions: Fp4SideOption[];
  options: Fp4OptionRow[];
  showSideStep?: boolean;
  axleSetAdvisory?: string | null;
  frontSideOptions?: Fp4SideOption[];
  rearSideOptions?: Fp4SideOption[];
};

const STITCH_TIER_DESCRIPTIONS: Record<number, string> = {
  1: "The exact factory component designed and installed by the vehicle manufacturer.",
  2: "Direct replacement parts listed for sister vehicles under another badge.",
  3: "Engine-family parts shared with other models that use the same powertrain.",
  4: "Direct replacement parts made by certified OEM tier-1 parts manufacturers.",
  5: "Consumables, fluids, and hardware that match factory chemical and dimensional tolerances.",
};

export { buildFp4ViewModel } from "./findPartsBuildFp4";

export type Fp5ResultRow = {
  id: string;
  tier: number;
  tierLabel: string;
  tierHeading: string;
  tierDescription: string;
  tierTag: string;
  partName: string;
  brandLabel: string;
  partNumber: string;
  matchPercent: string;
  verified: boolean;
  isBest?: boolean;
  isOemTier?: boolean;
  scopeNote: string;
  specLines: Array<{ label: string; value: string }>;
  interchangeLine: string;
  scheduleLine: string;
  emptyGapNote: string;
  positionLabel?: string | null;
};

export type Fp5TierSection = {
  tier: number;
  heading: string;
  description: string;
  tag: string;
  count: number;
  rows: Fp5ResultRow[];
  isEmpty?: boolean;
  emptyLine?: string;
  askLabel?: string;
};

export type Fp5ViewModel = {
  plate: string;
  vehicleLabel: string;
  chassisLabel: string;
  hubLabel: string;
  trimBadge: string;
  priceLabel: string;
  brandLabel: string;
  trimLabel: string;
  rows: Fp5ResultRow[];
  interchange: string;
  shelfSummary: string;
  partNumber: string;
  partBrand: string;
  partNumberAlt: string;
  matchCount: number;
  filterAllCount: number;
  filterStockCount: number;
  filterOemCount: number;
  activeFilterTab: "all" | "stock" | "oem";
  activeTrimScope: "all" | "specific";
  gtinLine: string;
  scheduleLine: string;
  photoMatchLabel: string;
  componentTitle: string;
  fitYearLabel: string;
  tierSections: Fp5TierSection[];
  emptyTierNotes: string[];
  archiveEyebrow: string;
  resultsHeadline: string;
  trimSeriesLabel: string;
  engineLayoutLabel: string;
  drivetrainLabel: string;
  chassisCodeLabel: string;
  catalogSpecLabel: string;
  matchRevisionLine: string;
  vinLabel: string;
  checkedCataloguesLabel: string;
  fitsVersionBadge: string;
};

function tierMeta(tier: number) {
  const row = PART_MATCH_TIERS.find((t) => t.tier === tier) || PART_MATCH_TIERS[0];
  return {
    heading: row.plainLabel,
    description: row.plainReason.replace(/\{[^}]+\}/g, "").replace(/\s+/g, " ").trim() || row.plainReason,
    tag: row.tag,
  };
}

function readRowNum(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const raw = row[key];
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function specLinesFromPartRecord(item: Record<string, unknown>): Array<{ label: string; value: string }> {
  const part = (item.part || {}) as Record<string, unknown>;
  const meta = part.metadata as { specs?: unknown } | undefined;
  const raw = meta?.specs ?? item.specs;
  if (Array.isArray(raw)) {
    const lines = raw
      .map((entry) => {
        const row = entry as { key?: string; label?: string; value?: string };
        const label = String(row.key || row.label || "").trim();
        const value = String(row.value || "").trim();
        if (!label || !value) return null;
        return { label: orNoneYet(label), value: orNoneYet(value) };
      })
      .filter(Boolean) as Array<{ label: string; value: string }>;
    return lines.slice(0, 6);
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .map(([key, val]) => {
        const value = String(val ?? "").trim();
        if (!value) return null;
        return { label: orNoneYet(key), value: orNoneYet(value) };
      })
      .filter(Boolean)
      .slice(0, 6) as Array<{ label: string; value: string }>;
  }
  return [];
}

function formatCheckedCataloguesLabel(item?: Record<string, unknown>): string {
  const part = (item?.part || {}) as Record<string, unknown>;
  const n = readRowNum(item || {}, "checked_catalog_count", "catalogs_checked", "domains_checked")
    ?? readRowNum(part, "checked_catalog_count", "catalogs_checked", "domains_checked");
  if (n != null && n > 0) return `Checked against ${n} catalogues`;
  return "";
}

function formatResultPositionLabel(item: Record<string, unknown>): string | null {
  const raw = String(item.position ?? (item.part as { position?: string } | undefined)?.position ?? "").trim().toLowerCase();
  if (raw === "front") return "Front";
  if (raw === "rear") return "Rear";
  if (raw === "both") return "Front & rear";
  return null;
}

function rowFromItem(
  section: { label?: string; tier?: number },
  item: Record<string, unknown>,
  bestId?: string,
  trimScopeLabel?: string,
): Fp5ResultRow {
  const part = (item.part || {}) as { id?: string; name?: string; brand?: string; oem_part_number?: string; manufacturer?: string };
  const id = String(part.id || "");
  const tier = Number(item.tier ?? section.tier ?? 1);
  const meta = tierMeta(tier);
  const tierLabel = orNoneYet(section.label || meta.heading);
  const isOemTier = tier === 1 || /oem|made for/i.test(tierLabel);
  const verified = Boolean(item.photo_verified || item.verified);
  const matchPctRaw = item.matchPct != null ? Number(item.matchPct) : null;
  const matchPercent = verified
    ? "Verified"
    : matchPctRaw != null && matchPctRaw > 0
      ? formatPercent(matchPctRaw)
      : "—";
  const specLines = specLinesFromPartRecord(item);
  const interchangeRaw = (item.interchange ?? item.sisterNames ?? "") as string;
  const schedule = String(item.maintenance_schedule || item.service_schedule || "").trim();
  return {
    id,
    tier,
    tierLabel,
    tierHeading: meta.heading,
    tierDescription: meta.description,
    tierTag: meta.tag,
    partName: orNoneYet(part.name),
    brandLabel: orNoneYet(part.brand || part.manufacturer),
    partNumber: orDash(part.oem_part_number),
    matchPercent,
    verified,
    isBest: id === bestId,
    isOemTier,
    scopeNote: trimScopeLabel || "Only this version",
    specLines,
    interchangeLine: orNoneYet(String(interchangeRaw || "—")),
    scheduleLine: schedule || "None yet",
    emptyGapNote: "",
    positionLabel: formatResultPositionLabel(item),
  };
}

function readVehicleSpecs(ctx: Record<string, unknown>): Record<string, unknown> {
  const nested = ctx.specs;
  if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  return ctx;
}

function formatEngineLayoutLabel(specs: Record<string, unknown>): string {
  const code = String(specs.engine_code || "").trim();
  const liters = Number(specs.engine_displacement_l);
  if (code && Number.isFinite(liters) && liters > 0) {
    const cc = Math.round(liters * 1000);
    return `${code} (${cc} cc)`;
  }
  const line = String(specs.engineFilterLine || "").trim();
  if (line) return line;
  return code || "None yet";
}

function formatCatalogSpecLabel(standardRef: string | undefined): string {
  const ref = String(standardRef || "").trim();
  if (!ref) return "None yet";
  return ref.toUpperCase().startsWith("OEM") ? ref : `OEM CATALOG SPEC: ${ref}`;
}

export function buildFp5ViewModel(input: {
  result?: {
    car?: { label?: string; year?: number | string; plate?: string };
    sections?: Array<{ label?: string; items?: Array<Record<string, unknown>> }>;
    standard_ref?: string;
  } | null;
  bestId?: string;
  hubLabel?: string;
  filterTab?: "all" | "stock" | "oem";
  trimScope?: "all" | "specific";
  plate?: string;
  partName?: string;
  vehicleContext?: Record<string, unknown> | null;
  variantCount?: number;
}): Fp5ViewModel {
  const ctx = input.vehicleContext || {};
  const car = input.result?.car || {};
  const trimFromCtx = formatPartsVersionTag(ctx);
  const filterTab = input.filterTab || "all";
  const trimScope = input.trimScope || "specific";
  const trimScopeLabel = trimScope === "all"
    ? "Fits all listed versions"
    : `Only ${trimFromCtx !== "None yet" ? trimFromCtx : "this version"}`;
  const allRows: Fp5ResultRow[] = [];
  for (const section of input.result?.sections || []) {
    for (const item of section.items || []) {
      allRows.push(rowFromItem(section, item, input.bestId, trimScopeLabel));
    }
  }
  const filterAllCount = allRows.length;
  const filterOemCount = allRows.filter((r) => r.isOemTier).length;
  let rows = allRows;
  if (filterTab === "oem") rows = rows.filter((r) => r.isOemTier);
  const best = allRows.find((r) => r.isBest) || allRows[0];
  let bestItem: Record<string, unknown> | undefined;
  for (const section of input.result?.sections || []) {
    for (const item of section.items || []) {
      const part = (item.part || {}) as { id?: string };
      if (String(part.id || "") === String(best?.id || "")) {
        bestItem = item;
        break;
      }
    }
  }
  const chassisRaw = String(ctx.chassis_code || ctx.chassis || (input.result as { chassis?: string })?.chassis || "").trim();
  const chassis = chassisRaw ? orNoneYet(chassisRaw) : orNoneYet(String((input.result as { chassis?: string })?.chassis || ""));
  const gtin = String((bestItem as { gtin?: string } | undefined)?.gtin || "").trim();
  const bestSpecs = Array.isArray((bestItem as { specs?: unknown })?.specs)
    ? ((bestItem as { specs?: Array<{ key?: string; value?: string }> }).specs || [])
    : [];
  const oemSpecLine = bestSpecs.map((s) => String(s.value || "").trim()).find(Boolean) || "";
  const gtinLine = gtin
    ? `GTIN: ${gtin}`
    : oemSpecLine
      ? oemSpecLine
      : "None yet";
  const schedule = String((bestItem as { maintenance_schedule?: string } | undefined)?.maintenance_schedule || "").trim();
  const scheduleLine = schedule || "None yet";
  const photoVerified = Boolean((bestItem as { photo_verified?: boolean } | undefined)?.photo_verified);
  const photoMatchLabel = photoVerified ? "PHOTO MATCH: Verified" : "PHOTO MATCH: —";
  const interchangeRaw = (bestItem as { interchange?: string; sisterNames?: string } | undefined)?.interchange
    || (bestItem as { sisterNames?: string })?.sisterNames;
  const year = car.year != null ? String(car.year) : "";
  const variantCount = input.variantCount ?? 0;
  const hubFromCtx = orNoneYet(String(ctx.hub_label || ctx.hubLabel || input.hubLabel || "Fleet hub"));
  const searchPartName = orNoneYet(input.partName || best?.partName || "");
  const tierSections: Fp5TierSection[] = [];
  const tierMap = new Map<number, Fp5ResultRow[]>();
  for (const row of rows) {
    const list = tierMap.get(row.tier) || [];
    list.push(row);
    tierMap.set(row.tier, list);
  }
  for (const tierRow of PART_MATCH_TIERS) {
    const sectionRows = tierMap.get(tierRow.tier) || [];
    tierSections.push({
      tier: tierRow.tier,
      heading: tierRow.plainLabel,
      description: STITCH_TIER_DESCRIPTIONS[tierRow.tier] || tierRow.plainReason,
      tag: tierRow.tag,
      count: sectionRows.length,
      rows: sectionRows,
      isEmpty: sectionRows.length === 0,
      emptyLine: sectionRows.length === 0 ? "None on file for your car yet." : "",
      askLabel: sectionRows.length === 0 ? "Ask Roam to find another option" : "",
    });
  }
  const specs = readPartsVehicleSpecs(ctx);
  const trimSeriesLabel = orNoneYet(String(specs.trim_series || ctx.version || trimFromCtx || ""));
  const engineLayoutLabel = formatEngineLayoutLabel(specs);
  const drivetrainLabel = orNoneYet(String(specs.drivetrain || ""));
  const chassisCodeLabel = orNoneYet(String(specs.chassis_code || chassisRaw || chassis || ""));
  const standardRef = String(
    (input.result as { standard_ref?: string } | null | undefined)?.standard_ref
      || (bestItem as { standard_ref?: string } | undefined)?.standard_ref
      || (bestItem?.part as { standard_ref?: string } | undefined)?.standard_ref
      || "",
  ).trim();
  const catalogSpecLabel = formatCatalogSpecLabel(standardRef);
  const archiveChassis = chassisCodeLabel !== "None yet" ? chassisCodeLabel : (chassis !== "None yet" ? chassis : "—");
  const archiveEyebrow = `PARTS FITMENT ARCHIVE · CHASSIS ${archiveChassis} DATABASE`;
  const headlinePart = searchPartName !== "None yet" ? searchPartName : "Parts";
  const resultsHeadline = `${headlinePart} for your ${orNoneYet(car.label || String(ctx.label || "vehicle"))}`;
  const matchRevisionLine = chassisCodeLabel !== "None yet"
    ? `MATCH REVISION: ${new Date().toISOString().slice(0, 10)} · CHASSIS: ${chassisCodeLabel}`
    : "None yet";
  return {
    plate: orDash(input.plate || car.plate || String(ctx.plate || "")),
    vehicleLabel: orNoneYet(car.label || String(ctx.label || "")),
    chassisLabel: chassis !== "None yet" ? chassis : "—",
    hubLabel: hubFromCtx,
    trimBadge: trimFromCtx,
    priceLabel: "—",
    brandLabel: best?.brandLabel || "—",
    trimLabel: trimFromCtx,
    rows: rows.length ? rows : [{
      id: "empty",
      tier: 1,
      tierLabel: "None yet",
      tierHeading: "None yet",
      tierDescription: "—",
      tierTag: "OEM",
      partName: "None yet",
      brandLabel: "—",
      partNumber: "—",
      matchPercent: "—",
      verified: false,
      scopeNote: "—",
      specLines: [],
      interchangeLine: "—",
      scheduleLine: "—",
      emptyGapNote: "",
    }],
    interchange: orNoneYet(String(interchangeRaw || (input.result as { interchange?: string })?.interchange || "")),
    shelfSummary: "—",
    partNumber: best?.partNumber || "—",
    partBrand: best?.brandLabel || "—",
    partNumberAlt: orDash((bestItem?.part as { altNumber?: string } | undefined)?.altNumber),
    matchCount: filterAllCount,
    filterAllCount,
    filterStockCount: 0,
    filterOemCount,
    activeFilterTab: filterTab,
    activeTrimScope: trimScope,
    gtinLine,
    scheduleLine,
    photoMatchLabel,
    componentTitle: searchPartName,
    fitYearLabel: year ? `Fit ${year}` : "None yet",
    tierSections,
    emptyTierNotes: [] as string[],
    archiveEyebrow,
    resultsHeadline,
    trimSeriesLabel,
    engineLayoutLabel,
    drivetrainLabel,
    chassisCodeLabel,
    catalogSpecLabel,
    matchRevisionLine,
    vinLabel: orDash(String(ctx.vin || ctx.vin_number || "").trim()),
    checkedCataloguesLabel: formatCheckedCataloguesLabel(bestItem),
    fitsVersionBadge: "Fits this version",
  };
}

export type Fp6OfferRow = {
  id: string;
  supplierLabel: string;
  priceLabel: string;
  leadLabel: string;
  selected?: boolean;
};

export type Fp6CrossRefRow = {
  brand: string;
  partNumber: string;
  note: string;
};

export type Fp6ShelfRow = {
  partNumber: string;
  description: string;
  priceLabel: string;
  shelfCountLabel: string;
};

export type Fp6VariantChip = {
  label: string;
  active?: boolean;
  excluded?: boolean;
};

export type Fp6ViewModel = {
  partName: string;
  partNumber: string;
  brandLabel: string;
  vehicleLabel: string;
  plate: string;
  vinLabel: string;
  odometerLabel: string;
  stockLabel: string;
  hubLabel: string;
  priceLabel: string;
  serviceLine: string;
  descriptionLine: string;
  offers: Fp6OfferRow[];
  crossRefs: string[];
  crossRefRows: Fp6CrossRefRow[];
  variantChips: Fp6VariantChip[];
  recommendedShelfCounts: Fp6ShelfRow[];
  specMatchLabel: string;
  partBrand: string;
  partNumberAlt: string;
  specRows: Array<{ label: string; value: string }>;
  engineFilterLine: string;
  partPhotoUrl: string;
};

function fp6ParseCrossRefRows(sisterNames: string | null | undefined, brandFallback: string, altNumber?: string): Fp6CrossRefRow[] {
  const rows: Fp6CrossRefRow[] = [];
  if (altNumber && altNumber !== "—") {
    rows.push({ brand: orNoneYet(brandFallback), partNumber: altNumber, note: "Aftermarket OE grade" });
  }
  for (const entry of String(sisterNames || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean)) {
    const dash = entry.indexOf(" ");
    if (dash > 0) {
      rows.push({
        brand: entry.slice(0, dash).trim(),
        partNumber: entry.slice(dash + 1).trim(),
        note: "Cross-reference",
      });
    } else {
      rows.push({ brand: orNoneYet(brandFallback), partNumber: entry, note: "Tier-1 interchange" });
    }
  }
  return rows.length ? rows : [{ brand: "None yet", partNumber: "—", note: "—" }];
}

export function buildFp6ViewModel(input: {
  item?: {
    part?: { id?: string; name?: string; oem_part_number?: string; manufacturer?: string; altNumber?: string; photo_url?: string };
    stockQty?: number;
    stockLocation?: string;
    matchPct?: number;
    photo_verified?: boolean;
    offers?: Array<{ supplier?: { name?: string }; landedCostJmd?: number; lead_time_days?: number }>;
    specs?: Array<{ key?: string; value?: string }>;
    sisterNames?: string | null;
    fitsVariantIds?: string[];
  } | null;
  ctx?: Record<string, unknown> | null;
  variantLabels?: string[];
}): Fp6ViewModel {
  const part = input.item?.part || {};
  const offersRaw = input.item?.offers || [];
  const offers: Fp6OfferRow[] = offersRaw.length
    ? offersRaw.map((o, index) => ({
        id: String(index),
        supplierLabel: orNoneYet(o.supplier?.name),
        priceLabel: formatPriceJmd(o.landedCostJmd),
        leadLabel: o.lead_time_days != null ? `${o.lead_time_days} days` : "None yet",
        selected: index === 0,
      }))
    : [{ id: "empty", supplierLabel: "None yet", priceLabel: "No price yet", leadLabel: "—", selected: true }];
  const stockQty = Number(input.item?.stockQty || 0);
  const ctx = input.ctx || {};
  const cross = String(input.item?.sisterNames || "").split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  const specs = (input.item?.specs || []).map((s) => ({
    label: orNoneYet(s.key),
    value: orNoneYet(s.value),
  }));
  const brand = orNoneYet(part.manufacturer);
  const partNumberAlt = orDash((part as { altNumber?: string }).altNumber);
  const crossRefRows = fp6ParseCrossRefRows(input.item?.sisterNames, brand, partNumberAlt !== "—" ? partNumberAlt : undefined);
  const ctxShelf = Array.isArray(ctx.recommended_shelf) ? ctx.recommended_shelf as Array<{ partNumber?: string; description?: string; priceJmd?: number; shelfQty?: number }> : [];
  const recommendedShelfCounts: Fp6ShelfRow[] = ctxShelf.length
    ? ctxShelf.map((row) => ({
        partNumber: orDash(row.partNumber),
        description: orNoneYet(row.description),
        priceLabel: formatPriceJmd(row.priceJmd),
        shelfCountLabel: row.shelfQty != null && row.shelfQty > 0 ? String(row.shelfQty) : "None yet",
      }))
    : [{
        partNumber: orDash(part.oem_part_number),
        description: orNoneYet(part.name),
        priceLabel: formatPriceJmd(offersRaw[0]?.landedCostJmd),
        shelfCountLabel: "None yet",
      }];
  const variantLabels = input.variantLabels?.length
    ? input.variantLabels
    : (input.item?.fitsVariantIds || []).map((id) => String(id));
  const variantChips: Fp6VariantChip[] = variantLabels.length
    ? variantLabels.map((label, index) => ({
        label: orNoneYet(label),
        active: index === 0,
        excluded: false,
      }))
    : [{ label: orNoneYet(String(ctx.trim || ctx.variant || "None yet")), active: true }];
  const matchPct = Number(input.item?.matchPct ?? (input.item?.photo_verified ? 100 : 0));
  const specMatchLabel = matchPct > 0 ? `${formatPercent(matchPct)} SPEC MATCH` : "—";
  return {
    partName: orNoneYet(part.name),
    partNumber: orDash(part.oem_part_number),
    brandLabel: brand,
    vehicleLabel: orNoneYet(String(ctx.label || "")),
    plate: orDash(String(ctx.plate || "")),
    vinLabel: orDash(String(ctx.vin || ctx.chassis || ctx.trim || "")),
    odometerLabel: formatKm(Number(ctx.odometer)),
    stockLabel: "None yet",
    hubLabel: orNoneYet(String(ctx.hub_label || ctx.hubLabel || "Fleet hub")),
    priceLabel: formatPriceJmd(offersRaw[0]?.landedCostJmd),
    serviceLine: orNoneYet(String(ctx.last_service || ctx.lastService || "")),
    descriptionLine: orNoneYet(part.name),
    offers,
    crossRefs: cross.length ? cross : ["None yet"],
    crossRefRows,
    variantChips,
    recommendedShelfCounts,
    specMatchLabel,
    partBrand: brand,
    partNumberAlt,
    specRows: specs.length ? specs : [{ label: "None yet", value: "—" }],
    engineFilterLine: String(ctx.engineFilterLine || "").trim() || "None yet",
    partPhotoUrl: catalogPhotoUrl(String((part as { photo_url?: string }).photo_url || (input.item as { photo_url?: string })?.photo_url || "")),
  };
}

export type Fp7SupplierRow = {
  id: string;
  name: string;
  priceLabel: string;
  meta: string;
};

export type Fp7ViewModel = {
  partName: string;
  partNumber: string;
  plate: string;
  vehicleLabel: string;
  hubLabel: string;
  quoteRef: string;
  shelfBalance: string;
  suppliers: Fp7SupplierRow[];
  sortLabel: string;
  pendingRepliesLabel: string;
  trimLabel: string;
};

export function buildFp7ViewModel(input: {
  part?: Record<string, unknown>;
  plate?: string;
  vehicleLabel?: string;
  hubLabel?: string;
  quoteRef?: string;
  offers?: Array<{ supplier_name?: string; landedCostJmd?: number; distanceKm?: number }>;
  stockQty?: number;
  pendingQuoteCount?: number;
  trimLabel?: string;
}): Fp7ViewModel {
  const offers = input.offers?.length
    ? input.offers.map((o, index) => ({
        id: String(index),
        name: orNoneYet(o.supplier_name),
        priceLabel: formatPriceJmd(o.landedCostJmd),
        meta: o.distanceKm != null ? `${Math.round(o.distanceKm)} km` : "—",
      }))
    : [{ id: "empty", name: "None yet", priceLabel: "No price yet", meta: "—" }];
  const stockQty = Number(input.stockQty || 0);
  const pending = Number(input.pendingQuoteCount ?? 0);
  return {
    partName: orNoneYet(String(input.part?.name || "")),
    partNumber: orDash(String(input.part?.oem_part_number || "")),
    plate: orDash(input.plate),
    vehicleLabel: orNoneYet(input.vehicleLabel),
    hubLabel: orNoneYet(input.hubLabel || "Fleet hub"),
    quoteRef: orDash(input.quoteRef),
    shelfBalance: stockQty > 0 ? `${stockQty} units` : "None yet",
    suppliers: offers,
    sortLabel: "Sort: Proximity & landed cost",
    pendingRepliesLabel: pending > 0 ? `${pending} pending supplier replies` : "None yet pending supplier replies",
    trimLabel: orNoneYet(input.trimLabel),
  };
}

export type Fp8ViewModel = {
  plate: string;
  vehicleLabel: string;
  trimLabel: string;
  chassisLabel: string;
  partName: string;
  positionLabel: string;
  headlineLine: string;
  hubLabel: string;
  vehiclePhotoUrl: string;
  runnerOnline: boolean;
  resolvedWin: string;
  benchmarkPrices: Array<{ label: string; priceLabel: string }>;
  targetKmLabel: string;
  healthLeftLabel: string;
  sourcingWins: Array<{ label: string; priceLabel: string }>;
  fitmentQueryRef: string;
  versionTag: string;
  requestSent?: boolean;
  requestRefLabel?: string;
  queueAheadLabel?: string;
  medianDispatchLabel?: string;
  batchMatchRateLabel?: string;
  showOrgMetrics?: boolean;
  jamaicaResetLabel?: string;
  showHubChip?: boolean;
  dailyLimitReached?: boolean;
  dailyLimitUsed?: number;
  dailyLimitMax?: number;
  activeRequestCount?: number;
};

export function buildFp8ViewModel(input: {
  plate?: string;
  vehicleLabel?: string;
  trimLabel?: string;
  chassisLabel?: string;
  partName?: string;
  positionLabel?: string;
  hubLabel?: string;
  runnerOnline?: boolean;
  resolvedWin?: string;
  targetKm?: number | null;
  healthPct?: number | null;
  vehiclePhotoUrl?: string | null;
  sourcingWins?: Array<{ label: string; foundPriceJmd?: number | null }>;
  fitmentQueryRef?: string;
  versionTag?: string;
  requestSent?: boolean;
  requestRefLabel?: string;
  queueAheadLabel?: string;
  medianDispatchLabel?: string;
  batchMatchRateLabel?: string;
  showOrgMetrics?: boolean;
  jamaicaResetLabel?: string;
  showHubChip?: boolean;
  dailyLimitReached?: boolean;
  dailyLimitUsed?: number;
  dailyLimitMax?: number;
  activeRequestCount?: number;
}): Fp8ViewModel {
  const wins = (input.sourcingWins || []).map((row) => ({
    label: orNoneYet(row.label),
    priceLabel: formatPriceJmd(row.foundPriceJmd),
  }));
  const health = input.healthPct;
  const partName = orNoneYet(input.partName);
  const positionLabel = input.positionLabel != null && input.positionLabel !== ""
    ? orNoneYet(input.positionLabel)
    : orNoneYet("—");
  return {
    plate: orDash(input.plate),
    vehicleLabel: orNoneYet(input.vehicleLabel),
    trimLabel: orNoneYet(input.trimLabel),
    chassisLabel: orDash(input.chassisLabel),
    partName,
    positionLabel,
    headlineLine: `We don't have ${partName.toLowerCase() === "none yet" ? "this part" : partName} for this car on file yet.`,
    hubLabel: orNoneYet(input.hubLabel || "Fleet hub"),
    vehiclePhotoUrl: catalogPhotoUrl(input.vehiclePhotoUrl),
    runnerOnline: Boolean(input.runnerOnline),
    resolvedWin: orNoneYet(input.resolvedWin),
    benchmarkPrices: wins.length >= 2 ? wins.slice(0, 2) : [
      { label: "Market avg", priceLabel: wins[0]?.priceLabel || "No price yet" },
      { label: "Last landed", priceLabel: wins[1]?.priceLabel || "No price yet" },
    ],
    targetKmLabel: formatKm(input.targetKm),
    healthLeftLabel: health != null && health >= 0 ? `${formatPercent(health)} left (Front)` : "None yet",
    sourcingWins: wins.length ? wins : [{ label: "None yet", priceLabel: "No price yet" }],
    fitmentQueryRef: orDash(input.fitmentQueryRef),
    versionTag: orNoneYet(input.versionTag || input.trimLabel),
    requestSent: Boolean(input.requestSent),
    requestRefLabel: orDash(input.requestRefLabel),
    queueAheadLabel: input.queueAheadLabel || "",
    medianDispatchLabel: input.medianDispatchLabel || "",
    batchMatchRateLabel: input.batchMatchRateLabel || "",
    showOrgMetrics: Boolean(input.showOrgMetrics),
    jamaicaResetLabel: input.jamaicaResetLabel || "",
    showHubChip: Boolean(input.showHubChip),
    dailyLimitReached: Boolean(input.dailyLimitReached),
    dailyLimitUsed: input.dailyLimitUsed ?? 30,
    dailyLimitMax: input.dailyLimitMax ?? 30,
    activeRequestCount: input.activeRequestCount ?? 30,
  };
}

/** Countdown copy for daily request limit (America/Jamaica midnight). */
export function formatJamaicaMidnightCountdown(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Jamaica",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  const s = Number(parts.find((p) => p.type === "second")?.value || 0);
  const elapsed = h * 3600 + m * 60 + s;
  const remaining = Math.max(0, 86400 - elapsed);
  const rh = Math.floor(remaining / 3600);
  const rm = Math.floor((remaining % 3600) / 60);
  return `Resets at 00:00 EST (${rh}h ${rm}m)`;
}

export type Fp9TrimRow = {
  id: string;
  title: string;
  subtitle: string;
  engineLine: string;
  fleetShareLabel: string;
  selected?: boolean;
};

export type Fp9ViewModel = {
  plate: string;
  plateSecondary: string;
  vehicleLabel: string;
  depotStockLabel: string;
  trimLabel: string;
  hubLabel: string;
  trims: Fp9TrimRow[];
  alternateTrimsLine: string;
  schematicPhotoUrl: string;
};

export function buildFp9ViewModel(input: {
  make?: string;
  model?: string;
  year?: string | number;
  plate?: string;
  plateSecondary?: string;
  options?: PartsVehicleOptions | null;
  depotPartsCount?: number;
  selectedTrimId?: string;
  alternateTrimsLine?: string;
  schematicPhotoUrl?: string | null;
}): Fp9ViewModel {
  const title = [input.year, input.make, input.model].filter(Boolean).join(" ");
  const versions = input.options?.versions || [];
  const fleetTotal = versions.reduce((sum, v) => sum + Number(v.fleetCount ?? 0), 0);
  const trims: Fp9TrimRow[] = versions.length
    ? versions.map((v, index) => {
        const share = fleetTotal > 0 && v.fleetCount != null
          ? `${Math.round((Number(v.fleetCount) / fleetTotal) * 100)}% fleet avg`
          : "None yet";
        return {
          id: String(v.id),
          title: orNoneYet(v.name || v.description),
          subtitle: orNoneYet(v.description || v.name),
          engineLine: orNoneYet((v as { engine?: string }).engine ? `Engine: ${(v as { engine?: string }).engine}` : "Engine: None yet"),
          fleetShareLabel: share,
          selected: input.selectedTrimId ? String(v.id) === input.selectedTrimId : index === 0,
        };
      })
    : [{ id: "any", title: "None yet", subtitle: "—", engineLine: "Engine: None yet", fleetShareLabel: "None yet", selected: true }];
  const count = input.depotPartsCount ?? 0;
  return {
    plate: orDash(input.plate),
    plateSecondary: orDash(input.plateSecondary),
    vehicleLabel: orNoneYet(title),
    depotStockLabel: "None yet",
    trimLabel: orNoneYet(trims[0]?.title),
    hubLabel: orNoneYet(String(input.plate ? "Fleet hub" : "Fleet hub")),
    trims,
    alternateTrimsLine: orNoneYet(String(input.alternateTrimsLine || "")),
    schematicPhotoUrl: catalogPhotoUrl(input.schematicPhotoUrl),
  };
}

export type Fp10ActivityFilter = "all" | "requests" | "alerts";

type ActivityRow = Record<string, unknown>;

function activityNum(row: ActivityRow, ...keys: string[]): number | null {
  for (const key of keys) {
    const raw = row[key];
    if (raw == null || raw === "") continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function activityStr(row: ActivityRow, ...keys: string[]): string {
  for (const key of keys) {
    const raw = row[key];
    if (raw == null) continue;
    const t = String(raw).trim();
    if (t) return t;
  }
  return "";
}

function formatActivityDate(value: unknown): string {
  if (!value) return "None yet";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return orNoneYet(String(value));
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatActivityDateKm(row: ActivityRow, dateKeys: string[], kmKeys: string[]): string {
  const date = formatActivityDate(activityStr(row, ...dateKeys) || row.created_at);
  const km = activityNum(row, ...kmKeys);
  return km != null && km > 0 ? `${date} (${formatKm(km)})` : date;
}

function mapRequestStatusLabel(raw: string): string {
  const s = raw.trim().toLowerCase();
  if (s === "found" || s === "quoted" || s === "resolved" || s === "closed") return "Found";
  if (s === "pending" || s === "open") return "Pending";
  if (s === "looking" || s === "sourcing" || !s || s === "none yet") return "Looking";
  return raw.trim() || "Looking";
}

function mapRequestCard(row: ActivityRow, index: number): Fp10ActivityCard {
  const status = orNoneYet(activityStr(row, "status"));
  const statusLabel = mapRequestStatusLabel(status);
  return {
    id: String(row.id || `req-${index}`),
    kind: "request",
    title: orNoneYet(activityStr(row, "need_text", "title")),
    subtitle: status,
    meta: formatActivityDate(row.created_at),
    statusLabel,
  };
}

function mapQuoteCard(row: ActivityRow, index: number): Fp10ActivityCard {
  const status = orNoneYet(activityStr(row, "status"));
  return {
    id: String(row.id || `quote-${index}`),
    kind: "quote",
    title: orNoneYet(activityStr(row, "reference", "part_number", "note")),
    subtitle: status,
    meta: formatActivityDate(row.created_at),
    statusLabel: status,
  };
}

function mapAlertCard(row: ActivityRow, index: number): Fp10ActivityCard {
  const detail = activityStr(row, "detail", "notes");
  return {
    id: String(row.id || `alert-${index}`),
    kind: "alert",
    title: orNoneYet(activityStr(row, "title", "kind") || detail.split(".")[0]),
    subtitle: orNoneYet(detail || activityStr(row, "brand")),
    meta: "Wear anomaly",
    statusLabel: "alert",
  };
}

function mapCoreCard(row: ActivityRow, index: number): Fp10ActivityCard {
  return {
    id: String(row.id || `core-${index}`),
    kind: "core",
    title: orNoneYet(activityStr(row, "summary", "notes", "status")),
    subtitle: orNoneYet(activityStr(row, "status")),
    meta: "Core return",
    statusLabel: orNoneYet(activityStr(row, "status")),
  };
}

function computeSlaPercent(requestItems: ActivityRow[], quoteItems: ActivityRow[]): string {
  const rows = [...requestItems, ...quoteItems];
  const withDue = rows.filter((row) => activityStr(row, "reply_due_at"));
  if (!withDue.length) return "—";
  const now = Date.now();
  const met = withDue.filter((row) => {
    const due = Date.parse(activityStr(row, "reply_due_at"));
    const status = activityStr(row, "status").toLowerCase();
    if (status === "closed" || status === "quoted" || status === "resolved") return true;
    return Number.isFinite(due) && due >= now;
  });
  return formatPercent(Math.round((met.length / withDue.length) * 100));
}

function slaBarFromQuote(row: ActivityRow | undefined): { percent: number; label: string } {
  if (!row) return { percent: 0, label: "None yet" };
  const status = activityStr(row, "status").toLowerCase();
  if (status === "open" || status === "pending") {
    return { percent: 50, label: "Awaiting response from Roam" };
  }
  return { percent: 0, label: "None yet" };
}

export type Fp10ActivityCard = {
  id: string;
  kind: "request" | "quote" | "alert" | "core";
  title: string;
  subtitle: string;
  meta: string;
  statusLabel: string;
};

export type Fp10ViewModel = {
  cards: Fp10ActivityCard[];
  requestRows: Fp10ActivityCard[];
  quoteRows: Fp10ActivityCard[];
  alertRows: Fp10ActivityCard[];
  coreRows: Fp10ActivityCard[];
  filterCounts: { all: number; requests: number; quotes: number; alerts: number; cores: number };
  activeActivityFilter: Fp10ActivityFilter;
  activityCountLabel: string;
  openRfqLabel: string;
  kpiPercent: string;
  coreBalanceLabel: string;
  slaBarPercent: number;
  slaRemainingLabel: string;
  vendorsNotified: string;
  alertTitle: string;
  alertDetail: string;
  alertVehicleLabel: string;
  alertPlate: string;
  alertCyclePrimary: string;
  alertCycleSecondary: string;
  alertDate: string;
  alertKm: string;
  expectedLifespanKm: string;
  wearBarPercent: number;
  coreUnitsAudited: string;
  requestsActiveLabel: string;
  quotesPendingLabel: string;
  alertsCriticalLabel: string;
  warrantyActiveLabel: string;
  feedSummary: string;
  regionLabel: string;
  anomalyLine: string;
  brandLabel: string;
  partNumber: string;
  hubLabel: string;
  plate: string;
  vehicleLabel: string;
  vehicleLabelSecondary: string;
  plateSecondary: string;
  requestRef: string;
  orgShortCode: string;
  queueAheadLabel: string;
  medianDispatchLabel: string;
  batchMatchRateLabel: string;
  showOrgMetrics: boolean;
};

export function buildFp10ViewModel(input: {
  activity?: {
    requests?: { items?: ActivityRow[]; total?: number };
    quotes?: { items?: ActivityRow[]; total?: number };
    repeatAlerts?: { items?: ActivityRow[]; total?: number };
    warrantyClaims?: { items?: ActivityRow[]; total?: number };
    cores?: { items?: ActivityRow[]; total?: number };
    meta?: {
      medianAddMinutes?: number | null;
      batchMatchRate?: number | null;
      resolvedCount30d?: number;
      queueDepth?: number;
    };
  } | null;
  feedConnected?: number;
  activityFilter?: Fp10ActivityFilter;
  orgShortCode?: string;
}): Fp10ViewModel {
  const requestItems = input.activity?.requests?.items || [];
  const alertItems = input.activity?.repeatAlerts?.items || [];
  const requestRows = requestItems.map(mapRequestCard);
  const quoteRows: Fp10ActivityCard[] = [];
  const alertRows = alertItems.map(mapAlertCard);
  const coreRows: Fp10ActivityCard[] = [];
  const filterCounts = {
    requests: input.activity?.requests?.total ?? requestRows.length,
    quotes: 0,
    alerts: input.activity?.repeatAlerts?.total ?? alertRows.length,
    cores: 0,
    all: 0,
  };
  filterCounts.all = filterCounts.requests + filterCounts.alerts;
  const activityFilter = input.activityFilter || "all";
  const allCards = [...requestRows, ...alertRows];
  const cardsByFilter: Record<Fp10ActivityFilter, Fp10ActivityCard[]> = {
    all: allCards,
    requests: requestRows,
    alerts: alertRows,
  };
  const cards = cardsByFilter[activityFilter].length
    ? cardsByFilter[activityFilter]
    : [{
        id: "empty",
        kind: "request" as const,
        title: "None yet",
        subtitle: "—",
        meta: "Ask Roam requests and repeat-part wear alerts for your fleet.",
        statusLabel: "None yet",
      }];
  const primaryAlert = alertItems[0];
  const kmSince = activityNum(primaryAlert || {}, "km_since_last", "miles_since_last", "odometer_km");
  const intervalKm = activityNum(primaryAlert || {}, "expected_lifespan_km", "service_interval_km", "interval_km");
  const wearBar = wearLifeBarPercent(kmSince, intervalKm) ?? 0;
  const openRequests = requestItems.filter((row) => {
    const status = activityStr(row, "status").toLowerCase();
    return !status || status === "open" || status === "sourcing" || status === "looking";
  }).length;
  const activityCountLabel = `(${filterCounts.all})`;
  const meta = input.activity?.meta;
  const resolvedCount = meta?.resolvedCount30d ?? 0;
  const showOrgMetrics = resolvedCount >= 5;
  const queueDepth = meta?.queueDepth ?? 0;
  const primaryRequest = requestItems[0];
  const reqShort = primaryRequest ? formatPartsRequestShortId(String(primaryRequest.id || "")) : "";
  const medianMin = meta?.medianAddMinutes;
  const batchRate = meta?.batchMatchRate;
  return {
    cards,
    requestRows,
    quoteRows,
    alertRows,
    coreRows,
    filterCounts,
    activeActivityFilter: activityFilter,
    activityCountLabel,
    openRfqLabel: String(openRequests || filterCounts.requests),
    kpiPercent: "—",
    coreBalanceLabel: "—",
    slaBarPercent: 0,
    slaRemainingLabel: "None yet",
    vendorsNotified: "None yet",
    alertTitle: orNoneYet(mapAlertCard(primaryAlert || {}, 0).title),
    alertDetail: orNoneYet(activityStr(primaryAlert || {}, "detail", "notes")),
    alertVehicleLabel: orNoneYet(activityStr(primaryAlert || {}, "vehicle_label", "vehicle_id")),
    alertPlate: orDash(activityStr(primaryAlert || {}, "plate", "license_plate")),
    alertCyclePrimary: primaryAlert
      ? formatActivityDateKm(primaryAlert, ["cycle_1_at", "first_cycle_at"], ["cycle_1_km", "first_cycle_km"])
      : "None yet",
    alertCycleSecondary: primaryAlert
      ? formatActivityDateKm(primaryAlert, ["cycle_2_at", "second_cycle_at"], ["cycle_2_km", "second_cycle_km"])
      : "None yet",
    alertDate: primaryAlert ? formatActivityDate(primaryAlert.created_at) : "None yet",
    alertKm: formatKm(kmSince),
    expectedLifespanKm: intervalKm != null && intervalKm > 0 ? formatKm(intervalKm) : "None yet",
    wearBarPercent: wearBar,
    coreUnitsAudited: "0",
    requestsActiveLabel: `${openRequests || filterCounts.requests} active`,
    quotesPendingLabel: "0 pending",
    alertsCriticalLabel: filterCounts.alerts > 0 ? `${filterCounts.alerts} critical review required` : "None critical",
    warrantyActiveLabel: "0 active claims",
    feedSummary: "Ask Roam catalog requests and repeat-part alerts for your fleet.",
    regionLabel: "St. Andrew & corporate area fleet",
    anomalyLine: "Automated anomaly detection from service telemetry & premature part exhaustion.",
    brandLabel: "—",
    partNumber: "—",
    hubLabel: "Fleet hub",
    plate: "—",
    vehicleLabel: "Vehicle",
    vehicleLabelSecondary: orNoneYet(activityStr(primaryAlert || {}, "vehicle_label", "vehicle_id")),
    plateSecondary: orDash(activityStr(primaryAlert || {}, "plate", "license_plate")),
    requestRef: orDash(reqShort || mapRequestCard(requestItems[0] || {}, 0).title),
    orgShortCode: orNoneYet(String(input.orgShortCode || "").trim() || "Fleet"),
    queueAheadLabel: queueDepth > 0 ? `In line · ${queueDepth} requests ahead` : "In line · next up",
    medianDispatchLabel: showOrgMetrics && medianMin != null ? `${medianMin} min median` : "",
    batchMatchRateLabel: showOrgMetrics && batchRate != null ? `${batchRate}% added in 30 days` : "",
    showOrgMetrics,
  };
}

/** Short request id (audit FP13 / FP15), e.g. KGN-JA-774 from uuid. */
export function formatPartsRequestShortId(id: string): string {
  const core = String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase();
  if (!core) return "—";
  if (core.length < 6) return core;
  return `${core.slice(0, 3)}-${core.slice(3, 5)}-${core.slice(5, 8)}`;
}

/** FP14 notice headline fragments (Stitch fidelity + live catalog banner). */
export function formatCatalogOnFileNoticeMessage(
  partName: string,
  vehicleLabel: string,
  modelYear?: string | number | null,
): string {
  const part = String(partName || "").trim() || "Part";
  const vehicle = String(vehicleLabel || "").trim() || "your car";
  const year = modelYear != null && String(modelYear).trim() ? String(modelYear).trim() : "";
  return `${part} for your ${vehicle}${year ? ` ${year}` : ""} is now on file.`;
}

export const FP5_BACK_TO_AREA_LABEL = "Back to belts & hoses";

export const FP5_SPEC_FIELD_LABELS = [
  "Rib profile",
  "Effective length",
  "Material grade",
  "Model application",
] as const;

export const FP8_REQUEST_PART_HEADING = "Request part for";
export const FP8_SPEC_NOTES_LABEL = "Specification notes";
export const FP8_CO_REQUEST_LINE = "Others asked for this too, so it's already in line.";
export const FP8_QUOTA_GUARD_TITLE = "Quota guard & throttling";
export const FP8_DAILY_CAP_LABEL = "30/30 daily cap";
export const FP8_INPUT_CACHED_LABEL = "Input cached";
export const FP8_VERIFIES_FITMENT = "Verifies fitment across";
export const FP8_SAMPLE_REQUEST_REF = "req-2026-fit-094";
export const FP8_DISPATCH_LOG_LINE = "Logged 0, 14:05 EST · Node #01";

/** Stitch FP14 copy block (also used for live catalog-added banner). */
export const FP14_CATALOG_ADDED_LINE = "Drive belt for your Toyota Roomy 2019 is now on file.";
export const FP14_BATCH_PARTS_PHRASE = "3 parts";
export const FP14_RESULTS_COUNT_LINE = "Results: 1 / 2 alternates";
export const FP14_CHECKED_TWO_CATALOGUES = "Checked against 2 catalogues";
export const FP14_SISTER_OPTIONS_COUNT = "Sister & aftermarket options (2)";

/** Stitch FP15 copy block. */
export const FP15_CO_REQUEST_ACROSS = "Others asked for this too, so it's already in line across";
export const FP15_LIMIT_USED_LINE = "30 / 30 used";
export const FP15_SENT_REQUESTS_LINE = "You've sent 30 requests";
export const FP15_VIEW_YOUR_REQUESTS = "View your 30";

export function formatCatalogResolvedNoticeLine(requestedAt: unknown): string {
  if (!requestedAt) return "";
  const d = new Date(String(requestedAt));
  if (Number.isNaN(d.getTime())) return "";
  const datePart = d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `Resolved from OEM parts catalogue lookup requested on ${datePart}.`;
}

export const FP14_VARIANT_RESEARCH_BODY =
  "Ask Roam Fleet Engineering to research an alternative OEM part number for your chassis.";
export const FP14_VARIANT_RESEARCH_BUTTON = "Request variant research";

/** Stitch FP14 resolved notice sample (dynamic dates use formatCatalogResolvedNoticeLine). */
export const FP14_STITCH_RESOLVED_DEMO =
  "Resolved from OEM parts catalogue lookup requested on 28 Oct 2026.";

/** FP13 requests timeline (Stitch FP13). */
export const FP13_HELP_CARD_TITLE = "Can't find a component in the standard parts catalog?";
export const FP13_HELP_CARD_BODY =
  "Simply trigger an OEM search from the main hub search bar using the vehicle plate or chassis prefix.";
export const FP13_EMPTY_BODY =
  "When a part isn't on file, ask Roam from the search. Research pipelines will populate this list automatically.";
export const FP13_NOTE_FIELD_LABEL =
  "Provide vehicle chassis sub-code, existing part photo, or aftermarket casing stamping to refine match:";
export const FP13_SEND_NOTE_LABEL = "Send note to Roam";
export const FP13_ADD_NOTE_BUTTON = "Add a note or photo";
export const FP13_FAILED_DEFAULT_REASON = "No trusted catalogue match yet.";
export const FP13_WAITING_FOOTER = "Roam is checking trusted parts catalogues. Usually within a day.";

export function formatFp13CantFindWithRetry(partName: string, vehicleCode: string, retryDateLabel: string): string {
  return `No trusted catalogue lists a ${partName} for ${vehicleCode} yet. We'll try again on ${retryDateLabel}.`;
}

export function formatFp13NoteConfirmation(requestId: string): string {
  const shortId = formatPartsRequestShortId(requestId);
  return `✓ Additional metadata recorded and attached to dispatch query ${shortId}.`;
}

/** Stitch FP13 card 4 (fidelity reference; live cards use formatFp13CantFindWithRetry). */
export const FP13_STITCH_CANT_FIND_DEMO =
  "No trusted catalogue lists a cabin filter for GP5 yet. We'll try again on 8 Nov.";
export const FP13_STITCH_NOTE_CONFIRM_DEMO =
  "✓ Additional metadata recorded and attached to dispatch query KGN-JA-774.";
export const FP13_STITCH_TURNAROUND_DEMO = "Avg dispatch turnaround: 4.8 hrs";

/** FP16 assembly area labels (phone notice frame). */
export const FP16_CATALOG_UPDATED_LABEL = "Catalog updated";
export const FP16_WHAT_PART_HEADING = "What part?";
export const FP16_ASSEMBLY_CATEGORIES_HEADING = "Assembly categories";
export const FP16_ON_FILE_FOR_CAR = "1 on file for your car";
export const FP16_WAITING_STATUS_BLURB =
  "Roam is checking trusted catalogues. Usually identified within a day.";

export function formatFp16AssemblyGroupsLabel(count: number): string {
  return `${count} groups`;
}

/** Stitch FP16 assembly row count label. */
export const FP16_ASSEMBLY_GROUPS_COUNT_LABEL = "5 groups";

/** FP16 assembly area labels (phone notice frame). */
export const FP16_ASSEMBLY_CATEGORIES = [
  "Belts & hoses",
  "Brakes",
  "Filters & fluids",
  "Suspension",
  "Electrical & sensors",
] as const;

function formatActivityTimeShort(value: unknown): string {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatActivityAskedLabel(value: unknown): string {
  if (!value) return "None yet";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return orNoneYet(String(value));
  return `Asked ${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })} EST`;
}

function formatMedianTurnaroundLabel(minutes: number | null | undefined, show: boolean): string {
  if (!show || minutes == null || !Number.isFinite(minutes)) return "Avg dispatch turnaround: hidden until 5 resolves";
  if (minutes >= 60) {
    const hrs = Math.round((minutes / 60) * 10) / 10;
    return `Avg dispatch turnaround: ${hrs} hrs`;
  }
  return `Avg dispatch turnaround: ${minutes} min`;
}

function requestStatusCategory(raw: string): "waiting" | "added" | "failed" {
  const s = raw.trim().toLowerCase();
  if (s === "resolved" || s === "found" || s === "added" || s === "closed") return "added";
  if (s === "rejected" || s === "cant_find" || s === "failed") return "failed";
  return "waiting";
}

function requestStatusLabel(raw: string, row: ActivityRow): string {
  const s = raw.trim().toLowerCase();
  if (s === "resolved" || s === "added") return "Added";
  if (s === "rejected" || s === "cant_find" || s === "failed") return "Couldn't find";
  if (s === "in_progress" || s === "sourcing" || s === "looking" || row.looking_at) return "Roam is looking";
  if (s === "open" || s === "pending") return "Sent";
  return raw.trim() || "Sent";
}

function buildRequestTimeline(row: ActivityRow, category: "waiting" | "added" | "failed"): Fp13TimelineStep[] {
  const sentAt = row.sent_at || row.created_at;
  const lookingAt = row.looking_at;
  const addedAt = row.added_at || (category === "added" ? row.resolved_at : null);
  const checkedAt = row.checked_at || (addedAt ? lookingAt || addedAt : null);
  const failedAt = row.cant_find_at || row.resolved_at || row.retry_at;

  if (category === "failed") {
    const stepDefs: Array<{ key: Fp13TimelineStep["key"]; label: string; at: unknown }> = [
      { key: "sent", label: "Sent", at: sentAt },
      { key: "looking", label: "Roam looking", at: lookingAt },
      { key: "checked", label: "Checked", at: checkedAt },
      { key: "added", label: "Couldn't find", at: failedAt },
    ];
    return stepDefs.map((step, index) => {
      const state: Fp13TimelineStep["state"] = index < 3 ? "done" : "active";
      const timeLabel = index === 3 ? "Unresolved" : formatActivityTimeShort(step.at);
      return {
        key: step.key,
        label: step.label,
        timeLabel,
        state,
        timeEmphasis: index === 3 ? "error" : "default",
      };
    });
  }

  const activeIndex = category === "added"
    ? 3
    : row.looking_at
      ? 1
      : 0;
  const steps: Array<{ key: Fp13TimelineStep["key"]; label: string; at: unknown }> = [
    { key: "sent", label: "Sent", at: sentAt },
    { key: "looking", label: "Roam looking", at: lookingAt },
    { key: "checked", label: "Checked", at: checkedAt },
    { key: "added", label: "Added", at: addedAt },
  ];
  return steps.map((step, index) => {
    let state: Fp13TimelineStep["state"] = "pending";
    if (category === "added" || index < activeIndex) state = "done";
    else if (index === activeIndex) state = "active";
    const timeLabel = state === "done" ? formatActivityTimeShort(step.at) : state === "active" ? "In progress" : "—";
    return { key: step.key, label: step.label, timeLabel, state, timeEmphasis: "default" };
  });
}

function checkedDomainsLabelFromRow(row: ActivityRow): string {
  const n = activityNum(row, "checked_catalog_count", "catalogs_checked", "domains_checked");
  if (n != null && n > 0) return `Checked against ${n} catalogues`;
  const domains = activityStr(row, "checked_domains", "catalog_domains");
  if (domains) return `Checked against ${domains}`;
  return "";
}

export type Fp13RequestFilter = "all" | "waiting" | "added" | "failed";

export type Fp13TimelineStep = {
  key: "sent" | "looking" | "checked" | "added";
  label: string;
  timeLabel: string;
  state: "done" | "active" | "pending";
  timeEmphasis?: "error" | "default";
};

export type Fp13RequestCard = {
  id: string;
  shortId: string;
  title: string;
  vehicleLine: string;
  plate: string;
  askedLabel: string;
  statusLabel: string;
  filterCategory: "waiting" | "added" | "failed";
  accent: "primary" | "tint" | "muted" | "error";
  timeline: Fp13TimelineStep[];
  footerNote: string;
  resultLine: string;
  checkedDomainsLabel: string;
  showSeePart: boolean;
  cantFindReason: string;
  retryLabel: string;
};

export type Fp13ViewModel = {
  cards: Fp13RequestCard[];
  filter: Fp13RequestFilter;
  filterCounts: { all: number; waiting: number; added: number; failed: number };
  queueAheadLabel: string;
  medianTurnaroundLabel: string;
  showOrgMetrics: boolean;
  emptyTitle: string;
  emptyBody: string;
  autoUpdateLabel: string;
  helpCardTitle: string;
  helpCardBody: string;
};

export function buildFp13ViewModel(input: {
  activity?: {
    requests?: { items?: ActivityRow[]; total?: number };
    meta?: {
      medianAddMinutes?: number | null;
      batchMatchRate?: number | null;
      resolvedCount30d?: number;
      queueDepth?: number;
    };
  } | null;
  filter?: Fp13RequestFilter;
}): Fp13ViewModel {
  const requestItems = input.activity?.requests?.items || [];
  const meta = input.activity?.meta;
  const resolvedCount = meta?.resolvedCount30d ?? 0;
  const showOrgMetrics = resolvedCount >= 5;
  const queueDepth = meta?.queueDepth ?? 0;
  const filter = input.filter || "all";
  const cards = requestItems.map((row, index) => {
    const statusRaw = activityStr(row, "status");
    const filterCategory = requestStatusCategory(statusRaw);
    const statusLabel = requestStatusLabel(statusRaw, row);
    const title = orNoneYet(activityStr(row, "need_text", "title"));
    const vehicleLine = orNoneYet(activityStr(row, "vehicle_label", "car_label"));
    const plate = orDash(activityStr(row, "plate", "license_plate"));
    const resultLine = orNoneYet(activityStr(row, "resolution_note", "resolved_part_label", "part_number"));
    const cantFindReason = orNoneYet(activityStr(row, "cant_find_reason", "resolution_note"));
    const retryRaw = row.retry_at || row.next_retry_at;
    const retryLabel = retryRaw
      ? `We'll try again on ${formatActivityDate(retryRaw)}.`
      : "";
    let footerNote = "";
    if (filterCategory === "added") {
      footerNote = resultLine !== "None yet" ? resultLine : "";
    } else if (filterCategory === "failed") {
      footerNote = cantFindReason !== "None yet" ? cantFindReason : FP13_FAILED_DEFAULT_REASON;
    } else if (statusLabel === "Roam is looking") {
      footerNote = FP13_WAITING_FOOTER;
    } else {
      footerNote = queueDepth > 0
        ? "Queued for research. Roam starts looking within 2 hours."
        : "In line · next up";
    }
    const accent: Fp13RequestCard["accent"] = filterCategory === "added"
      ? "primary"
      : filterCategory === "failed"
        ? "error"
        : statusLabel === "Roam is looking"
          ? "tint"
          : "muted";
    return {
      id: String(row.id || `req-${index}`),
      shortId: formatPartsRequestShortId(String(row.id || "")),
      title,
      vehicleLine,
      plate,
      askedLabel: formatActivityAskedLabel(row.sent_at || row.created_at),
      statusLabel,
      filterCategory,
      accent,
      timeline: buildRequestTimeline(row, filterCategory),
      footerNote,
      resultLine,
      checkedDomainsLabel: checkedDomainsLabelFromRow(row),
      showSeePart: filterCategory === "added" && resultLine !== "None yet",
      cantFindReason,
      retryLabel,
    };
  });
  const filterCounts = {
    all: cards.length,
    waiting: cards.filter((c) => c.filterCategory === "waiting").length,
    added: cards.filter((c) => c.filterCategory === "added").length,
    failed: cards.filter((c) => c.filterCategory === "failed").length,
  };
  const visible = filter === "all" ? cards : cards.filter((c) => c.filterCategory === filter);
  return {
    cards: visible,
    filter,
    filterCounts,
    queueAheadLabel: queueDepth > 0 ? `In line · ${queueDepth} requests ahead` : "In line · next up",
    medianTurnaroundLabel: formatMedianTurnaroundLabel(meta?.medianAddMinutes, showOrgMetrics),
    showOrgMetrics,
    emptyTitle: "No requests in this view",
    emptyBody: FP13_EMPTY_BODY,
    autoUpdateLabel: "Updates automatically · checked",
    helpCardTitle: FP13_HELP_CARD_TITLE,
    helpCardBody: FP13_HELP_CARD_BODY,
  };
}

export type Fp11PreviewTab = "loading" | "error" | "unlisted" | "noperm";

export type Fp11ViewModel = {
  state: Fp11PreviewTab;
  errorCode: string;
  httpStatusLine: string;
  errorMessage: string;
  attemptLabel: string;
  connectionStatusLabel: string;
  vehicleChip: string;
  sectionChip: string;
  userEmail: string;
  roleLabel: string;
  adminLabel: string;
  adminContactLine: string;
  missingModel: string;
  vinNote: string;
  hubLabel: string;
  vehicleLabel: string;
  /** @deprecated stitch-only; equals state */
  activePreviewTab: Fp11PreviewTab;
  hubStatusLabel: string;
  latencyLabel: string;
};

function formatHttpStatusLine(status: number, message: string): string {
  if (!status) return message.trim() || "Request failed";
  const short = message.trim() || "Error";
  return `HTTP ${status} ${short}`.slice(0, 120);
}

export function buildFp11ViewModel(input: {
  state?: Fp11PreviewTab;
  previewTab?: Fp11PreviewTab;
  errorCode?: string;
  httpStatus?: number;
  errorMessage?: string;
  attempts?: number;
  latencyMs?: number | null;
  userEmail?: string;
  role?: string;
  adminName?: string;
  adminRole?: string;
  missingModel?: string;
  hubLabel?: string;
  vehicleLabel?: string;
  vehicleChip?: string;
  sectionLabel?: string;
}): Fp11ViewModel {
  const state = input.state ?? input.previewTab ?? "error";
  const attempts = Math.min(3, Math.max(0, input.attempts ?? 0));
  const attemptNum = attempts > 0 ? attempts : 1;
  const latency = input.latencyMs != null && input.latencyMs >= 0 ? input.latencyMs : null;
  const connectionStatusLabel = latency != null
    ? `Check connection status (${latency}ms)`
    : "Check connection status";
  const vehicleChip = orNoneYet(
    input.vehicleChip
    || input.vehicleLabel
    || "Vehicle",
  );
  const sectionChip = orNoneYet(input.sectionLabel || "Part section");
  const errorMessage = input.errorMessage?.trim()
    || "The parts database did not respond in time. Your vehicle selection and entered notes are preserved.";
  const httpStatus = input.httpStatus ?? 0;
  return {
    state,
    errorCode: orNoneYet(input.errorCode || (httpStatus ? String(httpStatus) : "TIMEOUT")),
    httpStatusLine: formatHttpStatusLine(httpStatus, input.errorMessage || input.errorCode || "GATEWAY_TIMEOUT"),
    errorMessage,
    attemptLabel: `ATTEMPT: ${attemptNum} OF 3`,
    connectionStatusLabel,
    vehicleChip,
    sectionChip,
    userEmail: orNoneYet(input.userEmail),
    roleLabel: orNoneYet(input.role),
    adminLabel: orNoneYet(input.adminName || "Fleet lead"),
    adminContactLine: input.adminName
      ? `${input.adminName}${input.adminRole ? ` (${input.adminRole})` : ""}`
      : "None yet",
    missingModel: orNoneYet(input.missingModel),
    vinNote: "VIN uncatalogued / pre-2002 JDM vehicle",
    hubLabel: orNoneYet(input.hubLabel || "Fleet hub"),
    vehicleLabel: orNoneYet(input.vehicleLabel || "Vehicle"),
    activePreviewTab: state,
    hubStatusLabel: "",
    latencyLabel: latency != null ? `${latency}ms` : "",
  };
}

export type Fp12ViewModel = Fp5ViewModel;

export function buildFp12ViewModel(input: Parameters<typeof buildFp5ViewModel>[0]): Fp12ViewModel {
  return buildFp5ViewModel(input);
}
