/**
 * Keep in sync with packages/finance-core/src/reconSources.ts
 * Deno edge cannot import @roam/finance-core — mirror pure manifest helpers only.
 */

export type SourceKind = "upload" | "native" | "driver_submitted" | "external_dependency";
export type CoverageMode = "daily_rows" | "statement_period" | "none";
export type ReconServiceLine = "rideshare" | "rush_delivery" | "org";
export type SourceRequirement = "required" | "optional" | "not_applicable";

export type ReconSourceId =
  | "uber_bundle"
  | "indrive_trips"
  | "roam_trips"
  | "toll_usage"
  | "toll_topup"
  | "cash_tolls"
  | "fuel_card_roam"
  | "fuel_card_self"
  | "cash_fuel"
  | "rush_deliveries"
  | "cod_remittance";

export type RunStepId =
  | "sources"
  | "attribution"
  | "trips_earnings"
  | "tolls"
  | "tag_account"
  | "fuel"
  | "settlement_preview"
  | "close";

export type OrgReconProfile = {
  serviceLines: readonly ReconServiceLine[];
  hasUberDrivers: boolean;
  hasIndriveDrivers: boolean;
  hasTollTags: boolean;
  hasRoamFuelCards: boolean;
  hasSelfServeJaa: boolean;
  rushDeliveryEnabled: boolean;
};

export type ReconSourceDef = {
  id: ReconSourceId;
  line: ReconServiceLine;
  kind: SourceKind;
  label: string;
  coverage: CoverageMode;
  feeds: readonly RunStepId[];
  requiredWhen: (org: OrgReconProfile, weekKey: string) => SourceRequirement;
};

function lineActive(profile: OrgReconProfile, line: ReconServiceLine): boolean {
  if (line === "org") return true;
  if (line === "rideshare") return profile.serviceLines.includes("rideshare");
  if (line === "rush_delivery") {
    return profile.serviceLines.includes("rush_delivery") && profile.rushDeliveryEnabled;
  }
  return false;
}

export const RECON_SOURCES: readonly ReconSourceDef[] = [
  {
    id: "uber_bundle",
    line: "rideshare",
    kind: "upload",
    label: "Uber weekly reports",
    coverage: "statement_period",
    feeds: ["trips_earnings", "tolls", "settlement_preview"],
    requiredWhen: (p) =>
      lineActive(p, "rideshare") && p.hasUberDrivers ? "required" : "not_applicable",
  },
  {
    id: "indrive_trips",
    line: "rideshare",
    kind: "upload",
    label: "InDrive trip export",
    // R3-07: statement-period (export range), not daily trip rows — sparse weeks.
    coverage: "statement_period",
    feeds: ["trips_earnings"],
    requiredWhen: (p) =>
      lineActive(p, "rideshare") && p.hasIndriveDrivers ? "required" : "not_applicable",
  },
  {
    id: "roam_trips",
    line: "rideshare",
    kind: "native",
    label: "Roam app trips",
    coverage: "daily_rows",
    feeds: ["trips_earnings"],
    requiredWhen: (p) => (lineActive(p, "rideshare") ? "optional" : "not_applicable"),
  },
  {
    id: "toll_usage",
    line: "org",
    kind: "upload",
    label: "Tag account usage statement",
    coverage: "statement_period",
    feeds: ["tolls", "tag_account"],
    requiredWhen: (p) => (p.hasTollTags ? "required" : "not_applicable"),
  },
  {
    id: "toll_topup",
    line: "org",
    kind: "upload",
    label: "Tag account top-ups",
    coverage: "statement_period",
    feeds: ["tag_account"],
    requiredWhen: (p) => (p.hasTollTags ? "required" : "not_applicable"),
  },
  {
    id: "cash_tolls",
    line: "rideshare",
    kind: "driver_submitted",
    label: "Cash tolls",
    coverage: "daily_rows",
    feeds: ["tolls"],
    requiredWhen: (p) => (lineActive(p, "rideshare") ? "optional" : "not_applicable"),
  },
  {
    id: "fuel_card_roam",
    line: "rideshare",
    kind: "external_dependency",
    label: "Roam-issued fuel card statement",
    coverage: "statement_period",
    feeds: ["fuel"],
    requiredWhen: (p) =>
      lineActive(p, "rideshare") && p.hasRoamFuelCards ? "required" : "not_applicable",
  },
  {
    id: "fuel_card_self",
    line: "rideshare",
    kind: "upload",
    label: "Own fuel card statement",
    coverage: "statement_period",
    feeds: ["fuel"],
    requiredWhen: (p) =>
      lineActive(p, "rideshare") && p.hasSelfServeJaa ? "required" : "not_applicable",
  },
  {
    id: "cash_fuel",
    line: "rideshare",
    kind: "driver_submitted",
    label: "Cash fuel / receipts",
    coverage: "daily_rows",
    feeds: ["fuel"],
    requiredWhen: (p) => (lineActive(p, "rideshare") ? "optional" : "not_applicable"),
  },
  {
    id: "rush_deliveries",
    line: "rush_delivery",
    kind: "native",
    label: "Rush deliveries",
    coverage: "daily_rows",
    feeds: ["trips_earnings", "settlement_preview"],
    requiredWhen: (p) => (lineActive(p, "rush_delivery") ? "required" : "not_applicable"),
  },
  {
    id: "cod_remittance",
    line: "rush_delivery",
    kind: "native",
    label: "COD remittance (display)",
    coverage: "none",
    feeds: ["settlement_preview"],
    requiredWhen: (p) => (lineActive(p, "rush_delivery") ? "optional" : "not_applicable"),
  },
] as const;

export const RECON_SOURCE_IDS: readonly ReconSourceId[] = RECON_SOURCES.map((s) => s.id);

export type ResolvedSourceRequirement = {
  sourceId: ReconSourceId;
  requirement: SourceRequirement;
};

export function resolveSourceRequirements(
  profile: OrgReconProfile,
  weekKey: string,
): ResolvedSourceRequirement[] {
  return RECON_SOURCES.map((def) => ({
    sourceId: def.id,
    requirement: def.requiredWhen(profile, weekKey),
  }));
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const local = new Date(y, m - 1, d, 12, 0, 0);
  local.setDate(local.getDate() + days);
  const yy = local.getFullYear();
  const mm = String(local.getMonth() + 1).padStart(2, "0");
  const dd = String(local.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function weekDayKeys(weekKey: string): string[] {
  const anchor = String(weekKey || "").slice(0, 10);
  const out: string[] = [];
  for (let i = 0; i < 7; i += 1) out.push(addDaysYmd(anchor, i));
  return out;
}

export type SourceCoverageDay = "covered" | "zero_attested" | "missing" | "spill";

export type SourceAggregateStatus =
  | "not_applicable"
  | "missing"
  | "partial"
  | "received"
  | "attested_none"
  | "waived"
  | "waiting_external";

const COVERED_LIKE = new Set<SourceCoverageDay>(["covered", "zero_attested"]);

export function computeSourceStatusFromCoverage(
  coverage: Record<string, string>,
  requirement: SourceRequirement,
  opts?: { waived?: boolean; waitingExternal?: boolean },
): SourceAggregateStatus {
  if (opts?.waived) return "waived";
  if (opts?.waitingExternal) return "waiting_external";
  if (requirement === "not_applicable") return "not_applicable";

  const days = Object.values(coverage);
  if (days.length === 0) {
    return requirement === "optional" ? "received" : "missing";
  }

  const coveredCount = days.filter((d) => COVERED_LIKE.has(d as SourceCoverageDay)).length;
  const attestedNone = days.every((d) => d === "zero_attested");
  const allCovered = days.every((d) => COVERED_LIKE.has(d as SourceCoverageDay));
  const anyCovered = coveredCount > 0;
  const anyMissing = days.some((d) => d === "missing" || !d);

  if (attestedNone && coveredCount === days.length) return "attested_none";
  if (allCovered) return "received";
  if (requirement === "optional") {
    return anyCovered ? "received" : "missing";
  }
  if (anyMissing && anyCovered) return "partial";
  return "missing";
}

export function sourcesForLine(line: "rideshare" | "rush_delivery"): ReconSourceDef[] {
  return RECON_SOURCES.filter((s) => s.line === line || s.line === "org");
}
