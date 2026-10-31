import { formatKm, formatPercent, formatPriceJmd, orDash, orNoneYet, wearLifeBarPercent } from "./findPartsFormat";
import type { PartsMyVehicleRow, PartsVehicleOptions } from "./findPartsTypes";

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
};

export function buildFp2ViewModel(input: {
  make: string;
  model: string;
  year: number | null;
  plate?: string;
  options?: PartsVehicleOptions | null;
  fleetRows?: PartsMyVehicleRow[];
}): Fp2ViewModel {
  const title = [input.year, input.make, input.model].filter(Boolean).join(" ");
  const versionsRaw = input.options?.versions || [];
  const trimCode = orDash(versionsRaw[0]?.name?.split(" ")[0] || input.model?.slice(0, 3).toUpperCase() || "—");
  const defaultTemplates: Fp2VersionRow[] = [
    { id: "hybrid", title: "1.5 hybrid", subtitle: `${trimCode} · LEB · 7-speed DCT`, chassisHint: `${trimCode}-1000001+`, fleetShareLabel: `Most common in fleet (${orNoneYet(String((input.fleetRows?.[0] as { hub?: string })?.hub || "Fleet hub"))})`, selected: true },
    { id: "petrol_15", title: "1.5 petrol", subtitle: "GK5 · L15B · CVT", chassisHint: "GK5-1200001+", fleetShareLabel: "Standard i-VTEC Sport / RS" },
    { id: "petrol_13", title: "1.3 petrol", subtitle: "GK3 · L13B · CVT", chassisHint: "GK3-1200001+", fleetShareLabel: "Entry JDM petrol engine" },
    { id: "any", title: "Not sure", subtitle: "Universal Catalog Mode", chassisHint: "Annotated Comparison", fleetShareLabel: "Shows all matching options" },
  ];
  const versions: Fp2VersionRow[] = versionsRaw.length
    ? versionsRaw.map((v, index) => ({
        id: String(v.id),
        title: orNoneYet(v.name || v.description),
        subtitle: orNoneYet(v.description || v.name),
        chassisHint: orDash((v as { chassisPrefix?: string }).chassisPrefix),
        fleetShareLabel: v.fleetCount != null ? `${v.fleetCount} in fleet` : "None yet",
        selected: index === 0,
      }))
    : defaultTemplates;
  if (versionsRaw.length && !versions.some((v) => v.id === "any")) {
    versions.push(defaultTemplates[3]);
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
};

type Fp3BrowseInput = {
  areas?: Array<{ id?: string; name?: string; parts?: Array<{ id: string; name: string; priceJmd?: number; positionAware?: boolean }> }>;
  systems?: Array<{ id: string; plainName?: string; name?: string; components?: Array<{ id: string; plainName?: string; name?: string; count?: number; positionAware?: boolean }> }>;
  common?: Array<{ id: string; name?: string; plainName?: string; priceJmd?: number; positionAware?: boolean }>;
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
        metaLabel: formatPriceJmd(part.priceJmd),
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
  if (rank === 2) return `Inspect for scoring (${formatPercent(pct)})`;
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
      priceLabel: formatPriceJmd(part.priceJmd),
      meta: "Common wear",
    });
  }
  for (const area of input.browse?.areas || []) {
    for (const part of area.parts || []) {
      tiles.push({
        id: part.id,
        name: orNoneYet(part.name),
        priceLabel: formatPriceJmd(part.priceJmd),
        meta: orNoneYet(area.name),
      });
    }
  }
  const areaRows = fp3AreasFromBrowse(input.browse, input.selectedAreaId, input.selectedChipId);
  const areaLabels = areaRows.map((a) => a.name).filter((n) => n !== "None yet");
  const dueRaw = Array.isArray(ctx.due) ? ctx.due as Array<{ componentId?: string | null; name?: string }> : [];
  const servicesLegacy = Array.isArray(ctx.services_due) ? (ctx.services_due as string[]) : [];
  const serviceDueRows: Fp3ServiceDueRow[] = dueRaw.length
    ? dueRaw.map((row, index) => ({
        id: String(row.componentId || `due-${index}`),
        name: orNoneYet(row.name),
      }))
    : servicesLegacy.map((name, index) => ({ id: `due-${index}`, name: orNoneYet(name) }));
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
  return {
    plate: orDash(String(ctx.plate || "")),
    vehicleLabel: orNoneYet(String(ctx.label || "")),
    trimLabel: trim !== "—" ? trim : "None yet",
    odometerLabel: formatKm(Number(ctx.odometer)),
    healthPercent: formatPercent(Number(ctx.health_pct)),
    priceAltLabel: formatPriceJmd(Number((input.browse?.common?.[1] as { priceJmd?: number } | undefined)?.priceJmd)),
    partTiles: tiles.length ? tiles : [{ id: "empty", name: "None yet", priceLabel: "No price yet", meta: "—" }],
    areaLabels: areaLabels.length ? areaLabels : ["None yet"],
    areas: areaRows.length ? areaRows : [{ id: "empty", name: "None yet", partCount: 0, subChips: [] }],
    symptoms: symptomRows.length ? symptomRows : [{ id: "empty", name: "None yet", weightLabel: "—", answerText: "None yet", parts: [] }],
    categoryTotal: areaRows.length,
    selectedPartName: orNoneYet(input.selectedPartName || selectedChip?.name || ""),
    partTotal,
    searchHits: input.searchHits || [],
    servicesDue: servicesDue.length ? servicesDue : ["None yet"],
    serviceDueRows: serviceDueRows.length ? serviceDueRows : [{ id: "empty", name: "None yet" }],
    hubLabel: orNoneYet(String(ctx.hub_label || ctx.hubLabel || "Fleet hub")),
  };
}

export type Fp4OptionRow = {
  id: string;
  title: string;
  subtitle: string;
  stockLabel: string;
  offerLabel: string;
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
  options: Fp4OptionRow[];
};

export function buildFp4ViewModel(input: {
  ctx?: Record<string, unknown> | null;
  positions?: Array<{ id: string; title: string; stockQty?: number; offerLabel?: string }>;
}): Fp4ViewModel {
  const ctx = input.ctx || {};
  const positions = input.positions?.length
    ? input.positions
    : [
        { id: "front", title: "Front axle brake pad set (4 pads · left & right wheels)" },
        { id: "rear", title: "Rear axle brake pad set (4 pads · left & right wheels)" },
        { id: "both", title: "Both (front & back)" },
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
    options: positions.map((p) => ({
      id: p.id,
      title: p.title,
      subtitle: orNoneYet((p as { subtitle?: string }).subtitle),
      stockLabel: p.stockQty != null && p.stockQty > 0 ? `On shelf: ${p.stockQty}` : "None yet",
      offerLabel: orNoneYet(p.offerLabel),
    })),
  };
}

export type Fp5ResultRow = {
  id: string;
  tierLabel: string;
  partName: string;
  brandLabel: string;
  supplierLabel: string;
  priceLabel: string;
  stockLabel: string;
  matchPercent: string;
  isBest?: boolean;
  stockQty?: number;
  isOemTier?: boolean;
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
};

function rowFromItem(
  section: { label?: string },
  item: Record<string, unknown>,
  bestId?: string,
): Fp5ResultRow {
  const part = (item.part || {}) as { id?: string; name?: string; brand?: string; oem_part_number?: string; manufacturer?: string };
  const offers = (item as { offers?: Array<{ supplier_name?: string; landedCostJmd?: number }> }).offers;
  const offer = (offers?.[0] || {}) as { supplier_name?: string; landedCostJmd?: number };
  const id = String(part.id || "");
  const tierLabel = orNoneYet(section.label);
  const isOemTier = /oem|made for/i.test(tierLabel) || Number(item.tier) === 1;
  return {
    id,
    tierLabel,
    partName: orNoneYet(part.name),
    brandLabel: orNoneYet(part.brand || part.manufacturer),
    supplierLabel: orNoneYet(offer.supplier_name),
    priceLabel: formatPriceJmd(offer.landedCostJmd),
    stockLabel: Number(item.stockQty) > 0 ? `On your shelf — ${item.stockQty} in hub` : "None yet",
    matchPercent: formatPercent(Number(item.matchPct ?? item.photo_verified ? 100 : 100)),
    isBest: id === bestId,
    stockQty: Number(item.stockQty || 0),
    isOemTier,
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
}): Fp5ViewModel {
  const allRows: Fp5ResultRow[] = [];
  for (const section of input.result?.sections || []) {
    for (const item of section.items || []) {
      allRows.push(rowFromItem(section, item, input.bestId));
    }
  }
  const filterTab = input.filterTab || "all";
  const trimScope = input.trimScope || "specific";
  const filterAllCount = allRows.length;
  const filterStockCount = allRows.filter((r) => (r.stockQty ?? 0) > 0).length;
  const filterOemCount = allRows.filter((r) => r.isOemTier).length;
  let rows = allRows;
  if (filterTab === "stock") rows = rows.filter((r) => (r.stockQty ?? 0) > 0);
  if (filterTab === "oem") rows = rows.filter((r) => r.isOemTier);
  const best = allRows.find((r) => r.isBest) || allRows[0];
  let bestPartNumber = "—";
  let bestItem: Record<string, unknown> | undefined;
  for (const section of input.result?.sections || []) {
    for (const item of section.items || []) {
      const part = (item.part || {}) as { id?: string; oem_part_number?: string };
      if (String(part.id || "") === String(best?.id || "")) {
        bestPartNumber = orDash(part.oem_part_number);
        bestItem = item;
        break;
      }
    }
  }
  const gtin = String((bestItem as { gtin?: string } | undefined)?.gtin || "").trim();
  const chassis = orNoneYet((input.result as { chassis?: string })?.chassis);
  const gtinLine = gtin
    ? `GTIN: ${gtin} · OEM SPEC 11400-${chassis} · ${orNoneYet(best?.brandLabel)} REV C`
    : `OEM SPEC 11400-${chassis}`;
  const schedule = String((bestItem as { maintenance_schedule?: string } | undefined)?.maintenance_schedule || "").trim();
  const scheduleLine = schedule || "Every 10,000 km or 6 months per Roam Fleet Preventive Manual.";
  const photoVerified = Boolean((bestItem as { photo_verified?: boolean } | undefined)?.photo_verified);
  const photoMatchLabel = photoVerified ? "PHOTO MATCH: 100%" : "PHOTO MATCH: —";
  const interchangeRaw = (bestItem as { interchange?: string; sisterNames?: string } | undefined)?.interchange
    || (bestItem as { sisterNames?: string })?.sisterNames;
  const car = input.result?.car || {};
  const year = car.year != null ? String(car.year) : "";
  return {
    plate: orDash(input.plate || car.plate),
    vehicleLabel: orNoneYet(car.label),
    chassisLabel: chassis !== "None yet" ? chassis : "—",
    hubLabel: orNoneYet(input.hubLabel || "Fleet hub"),
    trimBadge: orNoneYet((input.result as { trimBadge?: string })?.trimBadge),
    priceLabel: best?.priceLabel || "No price yet",
    brandLabel: best?.brandLabel || "—",
    trimLabel: orNoneYet((input.result as { trimBadge?: string })?.trimBadge),
    rows: rows.length ? rows : [{
      id: "empty",
      tierLabel: "None yet",
      partName: "None yet",
      brandLabel: "—",
      supplierLabel: "—",
      priceLabel: "No price yet",
      stockLabel: "None yet",
      matchPercent: "—",
    }],
    interchange: orNoneYet(String(interchangeRaw || (input.result as { interchange?: string })?.interchange || "")),
    shelfSummary: best?.stockLabel || "None yet",
    partNumber: bestPartNumber,
    partBrand: best?.brandLabel || "—",
    partNumberAlt: orDash((bestItem?.part as { altNumber?: string } | undefined)?.altNumber),
    matchCount: filterAllCount,
    filterAllCount,
    filterStockCount,
    filterOemCount,
    activeFilterTab: filterTab,
    activeTrimScope: trimScope,
    gtinLine,
    scheduleLine,
    photoMatchLabel,
    componentTitle: orNoneYet(best?.partName),
    fitYearLabel: year ? `Fit ${year}` : "None yet",
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
    part?: { id?: string; name?: string; oem_part_number?: string; manufacturer?: string; altNumber?: string };
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
        shelfCountLabel: row.shelfQty != null && row.shelfQty > 0 ? `${row.shelfQty} on shelf` : "None yet",
      }))
    : [{
        partNumber: orDash(part.oem_part_number),
        description: orNoneYet(part.name ? `${part.name} with O-ring & bypass valve` : part.name),
        priceLabel: formatPriceJmd(offersRaw[0]?.landedCostJmd),
        shelfCountLabel: stockQty > 0 ? `${stockQty} on shelf` : "None yet",
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
    stockLabel: stockQty > 0 ? `On your shelf — ${stockQty} (${orNoneYet(input.item?.stockLocation || "hub")})` : "None yet",
    hubLabel: orNoneYet(String(ctx.hub_label || ctx.hubLabel || "Fleet hub")),
    priceLabel: formatPriceJmd(offersRaw[0]?.landedCostJmd),
    serviceLine: orNoneYet(String(ctx.last_service || ctx.lastService || "Oil & filter exchange")),
    descriptionLine: orNoneYet(part.name ? `${part.name} with O-ring & bypass valve` : ""),
    offers,
    crossRefs: cross.length ? cross : ["None yet"],
    crossRefRows,
    variantChips,
    recommendedShelfCounts,
    specMatchLabel,
    partBrand: brand,
    partNumberAlt,
    specRows: specs.length ? specs : [{ label: "None yet", value: "—" }],
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
  hubLabel: string;
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
  sourcingWins?: Array<{ label: string; foundPriceJmd?: number | null }>;
}): Fp8ViewModel {
  const wins = (input.sourcingWins || []).map((row) => ({
    label: orNoneYet(row.label),
    priceLabel: formatPriceJmd(row.foundPriceJmd),
  }));
  const health = input.healthPct;
  return {
    plate: orDash(input.plate),
    vehicleLabel: orNoneYet(input.vehicleLabel),
    trimLabel: orNoneYet(input.trimLabel),
    chassisLabel: orDash(input.chassisLabel),
    partName: orNoneYet(input.partName),
    positionLabel: orNoneYet(input.positionLabel || "Front axle"),
    hubLabel: orNoneYet(input.hubLabel || "Fleet hub"),
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
    depotStockLabel: count > 0 ? `${count.toLocaleString()} parts in hub bins waiting for trim classification.` : "None yet in hub bins waiting for trim classification.",
    trimLabel: orNoneYet(trims[0]?.title),
    hubLabel: orNoneYet(String(input.plate ? "Fleet hub" : "Fleet hub")),
    trims,
  };
}

export type Fp10ActivityFilter = "all" | "requests" | "quotes" | "alerts" | "cores";

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

function mapRequestCard(row: ActivityRow, index: number): Fp10ActivityCard {
  return {
    id: String(row.id || `req-${index}`),
    kind: "request",
    title: orNoneYet(activityStr(row, "need_text", "title")),
    subtitle: orNoneYet(activityStr(row, "status")),
    meta: "Active sourcing request",
    priceLabel: formatPriceJmd(activityNum(row, "found_price_jmd", "total_jmd")),
  };
}

function mapQuoteCard(row: ActivityRow, index: number): Fp10ActivityCard {
  const suppliers = Array.isArray(row.supplier_ids) ? row.supplier_ids.length : 0;
  return {
    id: String(row.id || `quote-${index}`),
    kind: "quote",
    title: orNoneYet(activityStr(row, "reference", "part_number", "note")),
    subtitle: orNoneYet(activityStr(row, "supplier", "status")),
    meta: suppliers > 0 ? `${suppliers} vendors notified` : "Supplier quote",
    priceLabel: formatPriceJmd(activityNum(row, "total_jmd", "landed_jmd")),
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
    priceLabel: "—",
  };
}

function mapCoreCard(row: ActivityRow, index: number): Fp10ActivityCard {
  const charge = activityNum(row, "core_charge", "credit_amount");
  return {
    id: String(row.id || `core-${index}`),
    kind: "core",
    title: orNoneYet(activityStr(row, "summary", "notes", "status")),
    subtitle: orNoneYet(activityStr(row, "status")),
    meta: "Core return",
    priceLabel: charge != null && charge > 0 ? formatPriceJmd(charge) : "J$ 0.00",
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
  const dueRaw = activityStr(row, "reply_due_at");
  const createdRaw = activityStr(row, "created_at");
  if (!dueRaw || !createdRaw) return { percent: 0, label: "None yet" };
  const due = Date.parse(dueRaw);
  const start = Date.parse(createdRaw);
  if (!Number.isFinite(due) || !Number.isFinite(start) || due <= start) return { percent: 0, label: "None yet" };
  const total = due - start;
  const left = due - Date.now();
  const percent = Math.max(0, Math.min(100, Math.round((left / total) * 100)));
  if (left <= 0) return { percent: 0, label: "SLA window elapsed" };
  const hours = Math.max(1, Math.round(left / 3_600_000));
  return { percent, label: `${hours}h remaining on reply SLA` };
}

export type Fp10ActivityCard = {
  id: string;
  kind: "request" | "quote" | "alert" | "core";
  title: string;
  subtitle: string;
  meta: string;
  priceLabel: string;
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
  const quoteItems = input.activity?.quotes?.items || [];
  const alertItems = input.activity?.repeatAlerts?.items || [];
  const coreItems = input.activity?.cores?.items || [];
  const requestRows = requestItems.map(mapRequestCard);
  const quoteRows = quoteItems.map(mapQuoteCard);
  const alertRows = alertItems.map(mapAlertCard);
  const coreRows = coreItems.map(mapCoreCard);
  const filterCounts = {
    requests: input.activity?.requests?.total ?? requestRows.length,
    quotes: input.activity?.quotes?.total ?? quoteRows.length,
    alerts: input.activity?.repeatAlerts?.total ?? alertRows.length,
    cores: input.activity?.cores?.total ?? coreRows.length,
    all: 0,
  };
  filterCounts.all = filterCounts.requests + filterCounts.quotes + filterCounts.alerts + filterCounts.cores;
  const activityFilter = input.activityFilter || "all";
  const allCards = [...requestRows, ...quoteRows, ...alertRows, ...coreRows];
  const cardsByFilter: Record<Fp10ActivityFilter, Fp10ActivityCard[]> = {
    all: allCards,
    requests: requestRows,
    quotes: quoteRows,
    alerts: alertRows,
    cores: coreRows,
  };
  const cards = cardsByFilter[activityFilter].length
    ? cardsByFilter[activityFilter]
    : [{
        id: "empty",
        kind: "request" as const,
        title: "None yet",
        subtitle: "—",
        meta: "Active sourcing requests, supplier quotes, wear anomalies, and core return credits across hub.",
        priceLabel: "No price yet",
      }];
  const primaryAlert = alertItems[0];
  const primaryQuote = quoteItems[0];
  const kmSince = activityNum(primaryAlert || {}, "km_since_last", "miles_since_last", "odometer_km");
  const intervalKm = activityNum(primaryAlert || {}, "expected_lifespan_km", "service_interval_km", "interval_km");
  const wearBar = wearLifeBarPercent(kmSince, intervalKm) ?? 0;
  const supplierCount = primaryQuote && Array.isArray(primaryQuote.supplier_ids) ? primaryQuote.supplier_ids.length : 0;
  const pendingCores = coreItems.filter((row) => activityStr(row, "status") !== "credited");
  const coreOwed = pendingCores.reduce((sum, row) => sum + (activityNum(row, "core_charge") || 0), 0);
  const creditedCores = coreItems.filter((row) => activityStr(row, "status") === "credited").length;
  const sla = slaBarFromQuote(primaryQuote);
  const openRequests = requestItems.filter((row) => {
    const status = activityStr(row, "status").toLowerCase();
    return !status || status === "open" || status === "sourcing" || status === "looking";
  }).length;
  const connected = input.feedConnected ?? 0;
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
    kpiPercent: computeSlaPercent(requestItems, quoteItems),
    coreBalanceLabel: coreOwed > 0 ? formatPriceJmd(coreOwed) : "J$ 0.00",
    slaBarPercent: sla.percent,
    slaRemainingLabel: sla.label,
    vendorsNotified: supplierCount > 0 ? `${supplierCount} Vendors Notified` : "None yet notified",
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
    coreUnitsAudited: creditedCores > 0 ? `${creditedCores} units` : String(filterCounts.cores || 0),
    requestsActiveLabel: `${openRequests || filterCounts.requests} active`,
    quotesPendingLabel: `${filterCounts.quotes} pending`,
    alertsCriticalLabel: filterCounts.alerts > 0 ? `${filterCounts.alerts} critical review required` : "None critical",
    warrantyActiveLabel: `${input.activity?.warrantyClaims?.total ?? 0} active claims`,
    feedSummary: connected > 0
      ? `${connected} live vendor inventory feeds currently connected for St. Andrew, corporate area fleet, and St. Catherine hubs.`
      : "None yet connected for St. Andrew & corporate area fleet hubs.",
    regionLabel: "St. Andrew & corporate area fleet",
    anomalyLine: "Automated anomaly detection from service telemetry & premature part exhaustion.",
    brandLabel: orNoneYet(activityStr(primaryQuote || {}, "brand") || mapQuoteCard(primaryQuote || {}, 0).title.split(" ")[0]),
    partNumber: orDash(activityStr(primaryQuote || {}, "part_number", "reference")),
    hubLabel: "Fleet hub",
    plate: "—",
    vehicleLabel: "Vehicle",
    vehicleLabelSecondary: orNoneYet(activityStr(primaryAlert || {}, "vehicle_label", "vehicle_id")),
    plateSecondary: orDash(activityStr(primaryAlert || {}, "plate", "license_plate")),
    requestRef: orDash(mapRequestCard(requestItems[0] || {}, 0).title),
  };
}

export type Fp11PreviewTab = "all" | "loading" | "error" | "unlisted" | "noperm";

export type Fp11ViewModel = {
  errorCode: string;
  attemptLabel: string;
  userEmail: string;
  roleLabel: string;
  adminLabel: string;
  missingModel: string;
  vinNote: string;
  latencyLabel: string;
  hubLabel: string;
  vehicleLabel: string;
  hubStatusLabel: string;
  activePreviewTab: Fp11PreviewTab;
};

export function buildFp11ViewModel(input: {
  errorCode?: string;
  attempts?: number;
  userEmail?: string;
  role?: string;
  adminName?: string;
  missingModel?: string;
  hubLabel?: string;
  vehicleLabel?: string;
  runnerOnline?: boolean;
  syncStatus?: string | null;
  previewTab?: Fp11PreviewTab;
}): Fp11ViewModel {
  const attempts = input.attempts ?? 0;
  const syncStatus = String(input.syncStatus || "").toLowerCase();
  const syncHealthy = !syncStatus || syncStatus === "ok" || syncStatus === "idle" || syncStatus === "running";
  const hubStatusLabel = input.runnerOnline && syncHealthy
    ? "HUB STATUS: OPERATIONAL"
    : input.runnerOnline
      ? "HUB STATUS: SYNC DEGRADED"
      : "HUB STATUS: OFFLINE";
  return {
    errorCode: orNoneYet(input.errorCode || "TIMEOUT"),
    attemptLabel: attempts > 0 ? `ATTEMPT: ${attempts} OF 3` : "ATTEMPT: 0 OF 3",
    userEmail: orNoneYet(input.userEmail),
    roleLabel: orNoneYet(input.role),
    adminLabel: orNoneYet(input.adminName || "Fleet lead"),
    missingModel: orNoneYet(input.missingModel),
    vinNote: "VIN uncatalogued / pre-2002 M vehicle",
    latencyLabel: "< 1,400ms",
    hubLabel: orNoneYet(input.hubLabel || "Fleet hub"),
    vehicleLabel: orNoneYet(input.vehicleLabel || "Vehicle"),
    hubStatusLabel,
    activePreviewTab: input.previewTab || "all",
  };
}

export type Fp12ViewModel = Fp5ViewModel;

export function buildFp12ViewModel(input: Parameters<typeof buildFp5ViewModel>[0]): Fp12ViewModel {
  return buildFp5ViewModel(input);
}
