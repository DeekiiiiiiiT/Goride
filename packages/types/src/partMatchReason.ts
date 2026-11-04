/** Human-readable "why it matches" lines from parts_for_vehicle match_* columns (AM-06). */

export type MatchReasonParams = Record<string, unknown> | null | undefined;
export type FitVia = "direct" | "sister" | "platform_link" | "engine" | "universal" | string | null;
export type FitSource = "listed" | "kept" | "derived" | "universal" | string | null;
export type MatchStatus = "live" | "needs_checking" | "suppressed" | string | null;

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export function formatMatchWhyLine(
  reasonCode: string | null | undefined,
  params: MatchReasonParams,
  fitSource?: FitSource,
): string {
  if (str(fitSource) === "kept") {
    return "You kept this automatic match";
  }
  const code = str(reasonCode) || "matched";
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;

  switch (code) {
    case "oe_number":
      return `Direct fit via factory OE number ${str(p.oe_number)} (${str(p.oe_brand) || "OEM"})`;
    case "oe_number_superseded": {
      const from = str(p.from);
      const to = str(p.to);
      const base = str(p.oe_number) || from;
      if (from && to) return `Direct fit via factory OE number ${base} (superseded → ${to})`;
      return `Direct fit via superseded factory number ${base}`;
    }
    case "via_sister":
      return `Same platform family · via ${str(p.platform_code) || "sister"} (${str(p.source_vehicle_id) ? "listed on sister car" : "sister listing"})`;
    case "via_platform_link":
      return `Shared component link · ${str(p.platform_code) || "platform"} tier-${str(p.source_tier) || "1"}`;
    case "via_engine":
      return `Same engine family · ${str(p.engine_code) || "engine code"}`;
    case "listed_direct":
      return "Hand-entered listing for this car";
    case "universal_spec": {
      // parts_for_vehicle sends a jsonb ARRAY of { spec_key, value, unit } for tier 5.
      const entries = universalSpecEntries(params);
      const specs = entries.length
        ? entries
        : p.spec_key ? [{ spec_key: str(p.spec_key), value: str(p.spec_value ?? p.value), unit: str(p.unit) }] : [];
      if (!specs.length) return "Universal spec";
      const text = specs
        .map((s) => `${str(s.spec_key).replace(/_mm$/, "").replace(/_/g, " ")} ${str(s.value)}${s.unit ? ` ${str(s.unit)}` : ""}`.trim())
        .join(" · ");
      return `Universal spec · ${text}`;
    }
    case "index_badge":
      return `Same ${str(p.index_type).toUpperCase() || "index"} ${str(p.value)} as grouped part`;
    default:
      return "Matched";
  }
}

export function matchWhyTooltip(
  reasonCode: string | null | undefined,
  params: MatchReasonParams,
  carLabel?: string,
): { carLine: string; partLine: string } {
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  const car = carLabel || "Your car";
  switch (str(reasonCode)) {
    case "oe_number":
    case "oe_number_superseded":
      return {
        carLine: `${car}: ${str(p.oe_number) || str(p.from) || "—"}`,
        partLine: `This part: ${str(p.oe_number) || str(p.to) || "—"}`,
      };
    case "via_sister":
      return { carLine: `${car}: sister platform`, partLine: `Listed on ${str(p.platform_code) || "sister car"}` };
    case "via_engine":
      return { carLine: `${car}: ${str(p.engine_code) || "engine"}`, partLine: "Shares engine-family listing" };
    default:
      return { carLine: car, partLine: formatMatchWhyLine(reasonCode, params) };
  }
}

function titleCaseWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function universalSpecEntries(params: MatchReasonParams): Array<{ unit?: string; value?: string; spec_key?: string }> {
  const p = (params && typeof params === "object" ? params : {}) as Record<string, unknown>;
  if (Array.isArray(p.specs)) {
    return p.specs as Array<{ unit?: string; value?: string; spec_key?: string }>;
  }
  if (Array.isArray(params)) return params as Array<{ unit?: string; value?: string; spec_key?: string }>;
  return [];
}

function allDimensionMmSpecs(params: MatchReasonParams): boolean {
  const entries = universalSpecEntries(params);
  return entries.length > 0 && entries.every((row) => str(row.unit).toLowerCase() === "mm");
}

export function dominionCategoryBadge(input: {
  via?: FitVia;
  reasonCode?: string | null;
  partKind?: string | null;
  tier?: number;
  fitSource?: FitSource;
  matchReasonParams?: MatchReasonParams;
  linkComponentName?: string | null;
}): string {
  const via = str(input.via);
  const kind = str(input.partKind).toLowerCase();
  const code = str(input.reasonCode);
  const fitSource = str(input.fitSource);
  if (input.tier === 5 || via === "universal") {
    if (code === "universal_spec" && allDimensionMmSpecs(input.matchReasonParams)) return "Dimension Match";
    return "Universal Spec";
  }
  if (kind === "oe_supplier") return "Direct Supplier OE";
  if (kind.includes("aftermarket") || kind === "reman" || kind === "used") return "Tier-1 Aftermarket";
  if (via === "sister") {
    return fitSource === "derived" ? "Platform Sister" : "Badge Clone";
  }
  if (via === "platform_link") {
    const raw = str(input.linkComponentName)
      || str((input.matchReasonParams as Record<string, unknown> | undefined)?.component_name);
    const label = raw ? titleCaseWords(raw.replace(/_/g, " ")) : "Component";
    return `Shared ${label} Fit`;
  }
  if (via === "engine") return "Carrier Match";
  if (code === "oe_number_superseded") return "OEM Supersession";
  if (via === "direct" || code === "oe_number" || code === "listed_direct") return "OEM Direct";
  return "OEM Direct";
}

/** Material icon name for AM-S4 result rows (Stitch parity). */
export function dominionMatchRowIcon(input: {
  via?: FitVia;
  reasonCode?: string | null;
  partKind?: string | null;
  tier?: number;
  matchStatus?: MatchStatus;
}): string {
  if (str(input.matchStatus) === "needs_checking") return "report_problem";
  const via = str(input.via);
  const code = str(input.reasonCode);
  const kind = str(input.partKind).toLowerCase();
  if (code === "oe_number_superseded") return "swap_horiz";
  if (via === "sister") return "device_hub";
  if (via === "engine") return "check";
  if (via === "platform_link") return "report_problem";
  if (input.tier === 4 || kind.includes("aftermarket") || kind === "oe_supplier") return "alt_route";
  if (input.tier === 5 || via === "universal") return "square_foot";
  return "link";
}

export function fleetTypeTag(via: FitVia, partKind?: string | null): string {
  const kind = str(partKind).toLowerCase();
  if (kind.includes("aftermarket")) return "AFTERMARKET";
  if (kind === "universal" || via === "universal") return "UNIVERSAL";
  if (via === "sister") return "SISTER";
  if (via === "platform_link") return "SHARED";
  if (via === "engine") return "ENGINE";
  return "OEM";
}

export type FleetWhyLineContext = {
  carShortName?: string;
  partBrand?: string;
  partNumber?: string;
  positionLabel?: string | null;
  linkComponentName?: string | null;
  sisterModelName?: string | null;
  indexEquivalentLabel?: string | null;
};

function fleetCarShortName(label: string | undefined): string {
  const t = str(label);
  if (!t) return "your car";
  const withoutYear = t.replace(/^\d{4}\s+/, "");
  const parts = withoutYear.split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts[parts.length - 1]! : parts[0] || "your car";
}

function sisterDisplayName(raw: string): string {
  const t = str(raw);
  if (!t) return "the sister model";
  if (/^the /i.test(t)) return t;
  if (/^daihatsu/i.test(t) && !/\bthor\b/i.test(t)) return `the ${t} Thor`;
  return `the ${t}`;
}

/** Plain-language Fleet "why it fits" line (AM-S4F / Stitch). */
export function formatFleetWhyLine(
  reasonCode: string | null | undefined,
  params: MatchReasonParams,
  fitSource?: FitSource,
  ctx: FleetWhyLineContext = {},
): string {
  if (str(fitSource) === "kept") {
    return "You kept this automatic match";
  }
  const code = str(reasonCode) || "matched";
  const p = (params && typeof params === "object" && !Array.isArray(params) ? params : {}) as Record<string, unknown>;
  const car = ctx.carShortName || "your car";
  const posRaw = str(ctx.positionLabel || p.position).toLowerCase();
  const axle = posRaw === "rear" ? "rear" : posRaw === "front" ? "front" : "";

  switch (code) {
    case "oe_number_superseded": {
      const from = str(p.from) || str(p.oe_number);
      const to = str(p.to);
      if (from && to) return `Factory number for your ${car} (${from}, now ${to})`;
      return `Factory number for your ${car}`;
    }
    case "via_sister": {
      const sisterRaw = ctx.sisterModelName || str(p.sister_names) || str(p.sister_name) || str(p.platform_code);
      const sister = sisterDisplayName(sisterRaw);
      return `Same part as ${sister}, the sister of your ${car}`;
    }
    case "via_platform_link": {
      const comp = str(ctx.linkComponentName || p.component_name || "parts").replace(/_/g, " ");
      if (axle && /brake\s*pad/i.test(comp)) {
        return `Shares ${axle} brake pads with a related car family`;
      }
      return `Shares ${comp} with a related car family`;
    }
    case "via_engine": {
      const eng = str(p.engine_code);
      return eng ? `Fits your engine family (${eng})` : "Shares parts with your engine family";
    }
    case "oe_number": {
      const oe = str(p.oe_number);
      return oe ? `Replaces your factory number ${oe}` : "Replaces your factory number";
    }
    case "index_badge": {
      const idxType = str(p.index_type).toUpperCase() || "WVA";
      const val = str(p.value);
      const equiv = str(ctx.indexEquivalentLabel || p.equivalent_part || p.reference_part);
      if (equiv && val) return `Same size as ${equiv} (${idxType} ${val})`;
      if (val) return `Same size by ${idxType} ${val}`;
      return "Same friction standard as a verified replacement";
    }
    case "listed_direct":
      return "Hand-entered listing for this car";
    case "universal_spec": {
      const entries = universalSpecEntries(params);
      const mmRows = entries.filter((s) => str(s.unit).toLowerCase() === "mm");
      const width = mmRows.find((r) => /length|width/i.test(str(r.spec_key))) || mmRows[0];
      const height = mmRows.find((r) => /height/i.test(str(r.spec_key))) || mmRows[1];
      const wVal = str(width?.value);
      const hVal = str(height?.value);
      if (wVal && hVal) {
        return `Matches your factory pad width (${wVal} mm), height (${hVal} mm) and calliper clips`;
      }
      return formatMatchWhyLine(code, params, fitSource);
    }
    default:
      return "Matched";
  }
}

export { fleetCarShortName };

export function fitLinkBadge(via: FitVia, _fitSource?: FitSource): string {
  const v = str(via);
  if (v === "sister") return "PLATFORM TWIN";
  if (v === "platform_link") return "SHARED";
  if (v === "engine") return "ENGINE";
  return "DIRECT";
}

export const TIER_ACCENT: Record<number, string> = {
  1: "#2563eb",
  2: "#0e7490",
  3: "#b45309",
  4: "#7c3aed",
  5: "#059669",
};

export const TIER_MATCH_CRITERIA: Record<number, (ctx: { sisterNames?: string; linkLabel?: string; engineCode?: string }) => string> = {
  1: () => "Factory line specification",
  2: (ctx) => `Shared platform: ${ctx.sisterNames || "sister models"}`,
  3: (ctx) => ctx.linkLabel || ctx.engineCode || "Link component or engine code",
  4: () => "OEM replacement tiers & cross-catalog",
  5: () => "Dimensions, from the universal spec list",
};

export function fleetSectionCountLabel(tier: number, rows: Array<{ matchStatus?: string | null }>): string {
  const n = rows.length;
  const checking = rows.some((r) => str(r.matchStatus) === "needs_checking");
  const allChecking = n > 0 && rows.every((r) => str(r.matchStatus) === "needs_checking");
  if (allChecking) return `${n} unconfirmed candidate${n === 1 ? "" : "s"}`;
  switch (tier) {
    case 1:
      return `${n} exact match${n === 1 ? "" : "es"}`;
    case 2:
      return `${n} verified sister part${n === 1 ? "" : "s"}`;
    case 3:
      return checking ? `${n} part${n === 1 ? "" : "s"} being audited` : `${n} shared fit${n === 1 ? "" : "s"}`;
    case 4:
      return `${n} direct replacement${n === 1 ? "" : "s"}`;
    case 5:
      return `${n} dimensionally verified part${n === 1 ? "" : "s"}`;
    default:
      return `${n} match${n === 1 ? "" : "es"}`;
  }
}
