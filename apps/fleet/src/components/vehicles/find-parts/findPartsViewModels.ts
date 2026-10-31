import { formatKm, formatPercent, formatPriceJmd, orDash, orNoneYet, wearLifeBarPercent } from "./findPartsFormat";
import type { PartsMyVehicleRow, PartsVehicleOptions } from "./findPartsTypes";
import { PART_MATCH_TIERS } from "../../../../../../packages/types/src/partsResolution.ts";

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
};

export type Fp3SubChip = {
  id: string;
  name: string;
  metaLabel: string;
  positionAware?: boolean;
  selected?: boolean;
};

export type Fp3AreaRow = {
  id: string;
  name: string;
  partCount: number;
  subChips: Fp3SubChip[];
};

export type Fp3SymptomPart = {
  id: string;
  name: string;
  priceLabel: string;
  weightLabel: string;
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
};

type Fp3BrowseInput = {
  areas?: Array<{ id?: string; name?: string; parts?: Array<{ id: string; name: string; priceJmd?: number; positionAware?: boolean }> }>;
  systems?: Array<{ id: string; plainName?: string; name?: string; components?: Array<{ id: string; plainName?: string; name?: string; count?: number; positionAware?: boolean }> }>;
  common?: Array<{ id: string; name?: string; plainName?: string; priceJmd?: number; positionAware?: boolean; description?: string }>;
};

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
    return browse.areas.map((area) => {
      const subChips = (area.parts || []).map((part) => ({
        id: part.id,
        name: orNoneYet(part.name),
        metaLabel: part.positionAware ? "Position-aware" : "On file",
        positionAware: part.positionAware,
        selected: selectedChipId === part.id,
      }));
      return {
        id: String(area.id || area.name || "area"),
        name: orNoneYet(area.name),
        partCount: subChips.length,
        subChips,
      };
    });
  }
  if (browse?.systems?.length) {
    return browse.systems.map((system) => {
      const subChips = (system.components || []).map((row) => ({
        id: row.id,
        name: orNoneYet(row.plainName || row.name),
        metaLabel: row.count != null && row.count > 0 ? `${row.count} on file` : orNoneYet(""),
        positionAware: row.positionAware,
        selected: selectedChipId === row.id,
      }));
      const partCount = subChips.length || system.components?.reduce((sum, row) => sum + Number(row.count || 0), 0) || 0;
      return {
        id: system.id,
        name: orNoneYet(system.plainName || system.name),
        partCount,
        subChips,
      };
    });
  }
  return [];
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
}): Fp3ViewModel {
  const ctx = input.ctx || {};
  const trim = orDash(String(ctx.trim || ctx.variant || ctx.subtitle || ""));
  const componentIndex = fp3ComponentIndex(input.browse);
  const tiles: Fp3PartTile[] = [];
  for (const part of input.browse?.common || []) {
    tiles.push({
      id: part.id,
      name: orNoneYet(part.plainName || part.name),
      priceLabel: "—",
      meta: orNoneYet(part.description || "Common wear"),
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
  const areaRows = fp3AreasFromBrowse(input.browse, input.selectedAreaId, input.selectedChipId);
  const areaLabels = areaRows.map((a) => a.name).filter((n) => n !== "None yet");
  const dueRaw = Array.isArray(ctx.due) ? ctx.due as Array<{ componentId?: string | null; name?: string; position?: string | null }> : [];
  const servicesLegacy = Array.isArray(ctx.services_due) ? (ctx.services_due as string[]) : [];
  const serviceDueRows: Fp3ServiceDueRow[] = dedupeServiceDueRows(
    dueRaw.length
      ? dueRaw.map((row, index) => ({
          id: String(row.componentId || `due-${index}`),
          name: fp3ServiceDueDisplayName(String(row.name || "Service"), row.position),
        }))
      : servicesLegacy.map((name, index) => ({ id: `due-${index}`, name: orNoneYet(name) })),
  );
  const servicesDue = serviceDueRows.map((row) => row.name);
  const symptomRows: Fp3SymptomRow[] = [];
  if (input.symptoms?.symptoms?.length) {
    for (const row of input.symptoms.symptoms) {
      const parts: Fp3SymptomPart[] = (row.components || []).slice(0, 4).map((link) => {
        const match = componentIndex.get(link.componentId);
        const rank = Number(link.rank ?? 1);
        return {
          id: link.componentId,
          name: orNoneYet(match?.name),
          priceLabel: formatPriceJmd(match?.priceJmd),
          weightLabel: fp3SymptomWeight(rank),
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
          priceLabel: formatPriceJmd(undefined),
          weightLabel: fp3SymptomWeight(1),
          positionAware: row.positionAware,
        }],
      });
    }
  }
  const partTotal = areaRows.reduce((sum, area) => sum + (area.partCount || 0), 0) || tiles.length;
  const selectedChip = areaRows.flatMap((a) => a.subChips).find((c) => c.selected);
  const hubLabel = orNoneYet(String(ctx.hub_label || ctx.hubLabel || "Fleet hub"));
  const orgShortCode = orNoneYet(String(ctx.orgShortCode || ctx.org_short_code || "Fleet"));
  return {
    plate: orDash(String(ctx.plate || "")),
    vehicleLabel: orNoneYet(String(ctx.label || "")),
    trimLabel: trim !== "—" ? trim : "None yet",
    odometerLabel: formatKm(Number(ctx.odometer)),
    healthPercent: formatPercent(Number(ctx.health_pct)),
    priceAltLabel: formatPriceJmd(Number((input.browse?.common?.[1] as { priceJmd?: number } | undefined)?.priceJmd)),
    partTiles: tiles.length ? tiles : [{ id: "empty", name: "None yet", priceLabel: "—", meta: "—" }],
    areaLabels: areaLabels.length ? areaLabels : ["None yet"],
    areas: areaRows.length ? areaRows : [{ id: "empty", name: "None yet", partCount: 0, subChips: [] }],
    symptoms: symptomRows.length ? symptomRows : [{ id: "empty", name: "None yet", weightLabel: "—", answerText: "None yet", parts: [] }],
    categoryTotal: areaRows.length,
    selectedPartName: orNoneYet(input.selectedPartName || selectedChip?.name || ""),
    partTotal,
    searchHits: input.searchHits || [],
    servicesDue: servicesDue.length ? servicesDue : ["None yet"],
    serviceDueRows: serviceDueRows.length ? serviceDueRows : [{ id: "empty", name: "None yet" }],
    hubLabel,
    orgShortCode,
    telematicsLine: fp3TelematicsLine(ctx),
    chassisCode: orDash(String(ctx.chassis_code || "")),
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

export type Fp4ViewModel = {
  plate: string;
  vehicleLabel: string;
  odometerLabel: string;
  lastServiceLabel: string;
  healthPercent: string;
  hubLabel: string;
  fleetTip: string;
  trimLabel: string;
  partLabel: string;
  options: Fp4OptionRow[];
};

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

const STITCH_TIER_DESCRIPTIONS: Record<number, string> = {
  1: "The exact factory component designed and installed by the vehicle manufacturer.",
  2: "Direct replacement parts listed for sister vehicles under another badge.",
  3: "Engine-family parts shared with other models that use the same powertrain.",
  4: "Direct replacement parts made by certified OEM tier-1 parts manufacturers.",
  5: "Consumables, fluids, and hardware that match factory chemical and dimensional tolerances.",
};

export function buildFp4ViewModel(input: {
  ctx?: Record<string, unknown> | null;
  positions?: Array<{ id: string; title: string; labour_minutes?: number; offerLabel?: string; subtitle?: string; infoLine?: string }>;
}): Fp4ViewModel {
  const ctx = input.ctx || {};
  const labourDefault = Number(ctx.labour_minutes ?? ctx.labourMinutes);
  const positions = input.positions?.length
    ? input.positions
    : [
        { id: "front", title: "Front axle brake pad set (4 pads · left & right wheels)", labour_minutes: labourDefault || 45 },
        { id: "rear", title: "Rear axle brake pad set (4 pads · left & right wheels)", labour_minutes: labourDefault ? labourDefault + 5 : 50 },
        { id: "both", title: "Front and rear axle brake pad sets", labour_minutes: labourDefault ? labourDefault * 2 : 95, offerLabel: "Recommended Package" },
      ];
  return {
    plate: orDash(String(ctx.plate || "")),
    vehicleLabel: orNoneYet(String(ctx.label || "")),
    odometerLabel: formatKm(Number(ctx.odometer)),
    lastServiceLabel: orNoneYet(String(ctx.lastService || ctx.last_service || "")),
    healthPercent: formatPercent(Number(ctx.health_pct)),
    hubLabel: orNoneYet(String(ctx.hub_label || ctx.hubLabel || "Fleet hub")),
    fleetTip: orNoneYet(String(ctx.fleet_tip || ctx.fleetTip || "")),
    trimLabel: orNoneYet(String(ctx.trim || ctx.variant || "")),
    partLabel: orNoneYet(String(ctx.part_label || ctx.partName || "parts")),
    options: positions.map((p) => ({
      id: p.id,
      heading: fp4Heading(p.id),
      title: p.title,
      subtitle: orNoneYet((p as { subtitle?: string }).subtitle),
      replacementTimeLabel: formatLabourMinutes(Number((p as { labour_minutes?: number }).labour_minutes ?? labourDefault)),
      offerLabel: p.id === "both" ? "Recommended Package" : orNoneYet(p.offerLabel),
      infoLine: orNoneYet((p as { infoLine?: string }).infoLine || "Fits disc brake calipers for this chassis."),
    })),
  };
}

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
};

export type Fp5TierSection = {
  tier: number;
  heading: string;
  description: string;
  tag: string;
  count: number;
  rows: Fp5ResultRow[];
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
};

function tierMeta(tier: number) {
  const row = PART_MATCH_TIERS.find((t) => t.tier === tier) || PART_MATCH_TIERS[0];
  return {
    heading: row.plainLabel,
    description: row.plainReason.replace(/\{[^}]+\}/g, "").replace(/\s+/g, " ").trim() || row.plainReason,
    tag: row.tag,
  };
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
  const specs = Array.isArray(item.specs) ? item.specs as Array<{ key?: string; value?: string }> : [];
  const specLines = specs.length
    ? specs.slice(0, 4).map((s) => ({ label: orNoneYet(s.key), value: orNoneYet(s.value) }))
    : [
        { label: "Height", value: orDash(String((item as { height_mm?: string }).height_mm || "—")) },
        { label: "Material", value: orDash(String((item as { material?: string }).material || "—")) },
      ];
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
  };
}

export function buildFp5ViewModel(input: {
  result?: {
    car?: { label?: string; year?: number | string; plate?: string };
    sections?: Array<{ label?: string; items?: Array<Record<string, unknown>> }>;
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
  const trimFromCtx = orNoneYet(String(ctx.trim || ctx.variant || (input.result as { trimBadge?: string })?.trimBadge || ""));
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
    if (!sectionRows.length) continue;
    tierSections.push({
      tier: tierRow.tier,
      heading: tierRow.plainLabel,
      description: STITCH_TIER_DESCRIPTIONS[tierRow.tier] || tierRow.plainReason,
      tag: tierRow.tag,
      count: sectionRows.length,
      rows: sectionRows,
    });
  }
  const presentTiers = new Set(allRows.map((r) => r.tier));
  const emptyTierNotes = PART_MATCH_TIERS
    .filter((t) => !presentTiers.has(t.tier))
    .map((t) => `Nothing on file for: ${t.plainLabel.toLowerCase()}.`);
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
    emptyTierNotes,
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
}): Fp8ViewModel {
  const wins = (input.sourcingWins || []).map((row) => ({
    label: orNoneYet(row.label),
    priceLabel: formatPriceJmd(row.foundPriceJmd),
  }));
  const health = input.healthPct;
  const partName = orNoneYet(input.partName);
  const positionLabel = orNoneYet(input.positionLabel || "front");
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
  };
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
};

export function buildFp10ViewModel(input: {
  activity?: {
    requests?: { items?: ActivityRow[]; total?: number };
    quotes?: { items?: ActivityRow[]; total?: number };
    repeatAlerts?: { items?: ActivityRow[]; total?: number };
    warrantyClaims?: { items?: ActivityRow[]; total?: number };
    cores?: { items?: ActivityRow[]; total?: number };
  } | null;
  feedConnected?: number;
  activityFilter?: Fp10ActivityFilter;
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
    requestRef: orDash(mapRequestCard(requestItems[0] || {}, 0).title),
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
