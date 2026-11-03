/** Human-readable "why it matches" lines from parts_for_vehicle match_* columns (AM-06). */

export type MatchReasonParams = Record<string, unknown> | null | undefined;

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export function formatMatchWhyLine(
  reasonCode: string | null | undefined,
  params: MatchReasonParams,
): string {
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
      const specs = p.specs;
      if (Array.isArray(specs) && specs.length) {
        const first = specs[0] as { spec_key?: string; value?: string; unit?: string };
        return `Universal spec · ${str(first.spec_key)} ${str(first.value)}${first.unit ? ` ${first.unit}` : ""}`;
      }
      return `Universal spec · ${str(p.spec_key)} ${str(p.spec_value)}`;
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

export type FitVia = "direct" | "sister" | "platform_link" | "engine" | "universal" | string | null;
export type FitSource = "listed" | "kept" | "derived" | "universal" | string | null;
export type MatchStatus = "live" | "needs_checking" | "suppressed" | string | null;

export function dominionCategoryBadge(input: {
  via?: FitVia;
  reasonCode?: string | null;
  partKind?: string | null;
  tier?: number;
}): string {
  const via = str(input.via);
  const kind = str(input.partKind).toLowerCase();
  const code = str(input.reasonCode);
  if (input.tier === 5 || via === "universal") {
    return code === "universal_spec" && Array.isArray((input as { specs?: unknown }).specs)
      ? "Dimension Match"
      : "Universal Spec";
  }
  if (kind.includes("aftermarket") || kind === "oe_supplier") {
    if (kind === "oe_supplier") return "Direct Supplier OE";
    return "Tier-1 Aftermarket";
  }
  if (via === "sister") {
    return input.reasonCode === "via_sister" && (input as { fitSource?: string }).fitSource === "derived"
      ? "Platform Sister"
      : "Badge Clone";
  }
  if (via === "platform_link") return "Shared component Fit";
  if (via === "engine") return "Carrier Match";
  if (code === "oe_number_superseded") return "OEM Supersession";
  if (via === "direct" || code === "oe_number") return "OEM Direct";
  return "OEM Direct";
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
