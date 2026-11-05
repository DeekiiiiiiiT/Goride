import type {
  CatalogResearchJobListItem,
  CatalogResearchStrip,
  VehicleCatalogBrief,
} from "../../../../services/pendingPartsCatalogService";
import { CATALOG_RESEARCH_ENGINE_REV } from "../../../../services/pendingPartsCatalogService";
import type { VehicleCatalogPendingRequest } from "../../../../types/vehicleCatalogPending";

export { CATALOG_RESEARCH_ENGINE_REV };

export type S10eStripViewModel = {
  researchStatusLabel: string;
  pauseReasonLabel: string;
  todayJobsLabel: string;
  dispatcherLabel: string;
  shadowLine: string;
  showPing: boolean;
};

export function buildS10eStripViewModel(strip: CatalogResearchStrip): S10eStripViewModel {
  const researchStatusLabel = strip.enabled
    ? strip.paused
      ? "Research paused"
      : "Research is on"
    : "Research is off";
  const pauseReasonLabel = strip.paused && strip.pausedReason ? strip.pausedReason : "";
  const todayJobsLabel = strip.dailyJobLimit != null
    ? `Today ${strip.todayResearchCount ?? 0} / ${strip.dailyJobLimit} jobs`
    : `Today ${strip.todayResearchCount ?? 0} jobs`;
  const dispatcherLabel = !strip.enabled
    ? "Turn on"
    : strip.paused
      ? "Resume Dispatcher"
      : "Pause Dispatcher";
  const shadowLine =
    strip.shadowMode !== false
      ? `Shadow mode · streak ${strip.shadowStreak ?? 0} / 20`
      : "Shadow mode off";
  const showPing = Boolean(strip.enabled && !strip.paused);
  return { researchStatusLabel, pauseReasonLabel, todayJobsLabel, dispatcherLabel, shadowLine, showPing };
}

export type ResearchQueueFilter =
  | "all"
  | "needs_review"
  | "researching"
  | "queued"
  | "auto_added"
  | "added"
  | "not_found"
  | "failed";

export function researchFilterForJobState(state: string | null | undefined): ResearchQueueFilter | null {
  if (!state) return null;
  if (state === "needs_review") return "needs_review";
  if (state === "researching" || state === "checking") return "researching";
  if (state === "queued") return "queued";
  if (state === "auto_added") return "auto_added";
  if (state === "added") return "added";
  if (state === "not_found") return "not_found";
  if (state === "failed") return "failed";
  return null;
}

export function formatResearchStateLabel(state: string | null | undefined): string {
  const bucket = researchFilterForJobState(state);
  if (bucket === "needs_review") return "Needs review";
  if (bucket === "researching") return "Researching";
  if (bucket === "queued") return "Queued";
  if (bucket === "auto_added") return "Added automatically";
  if (bucket === "added") return "Added";
  if (bucket === "not_found") return "Couldn't find";
  if (bucket === "failed") return "Failed";
  return "New";
}

export type ResearchMetricsCards = {
  needsReview: number;
  addedAutoWeek: number;
  addedWeek: number;
  couldntFind: number;
  queued: number;
};

export function buildResearchMetricsCards(jobs: CatalogResearchJobListItem[]): ResearchMetricsCards {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const inWeek = (iso: string) => new Date(iso).getTime() >= weekAgo;
  let needsReview = 0;
  let addedAutoWeek = 0;
  let addedWeek = 0;
  let couldntFind = 0;
  let queued = 0;
  for (const job of jobs) {
    const bucket = researchFilterForJobState(job.state);
    if (bucket === "needs_review") needsReview += 1;
    if (bucket === "queued") queued += 1;
    if (bucket === "not_found") couldntFind += 1;
    if (bucket === "auto_added" && inWeek(job.updatedAt)) addedAutoWeek += 1;
    if ((bucket === "added" || bucket === "auto_added") && inWeek(job.updatedAt)) addedWeek += 1;
  }
  return { needsReview, addedAutoWeek, addedWeek, couldntFind, queued };
}

export type PartDrawerVariant = "needs_review" | "auto_added" | "standard";

export function partDrawerVariantFromJobState(state: string | null | undefined): PartDrawerVariant {
  if (state === "needs_review") return "needs_review";
  if (state === "auto_added" || state === "added") return "auto_added";
  return "standard";
}

type RawSource = {
  url?: string;
  domain?: string;
  quote?: string;
  number_found?: boolean;
  car_found?: boolean;
  position_found?: boolean;
  dropped?: boolean;
};

export type ProposalDisplay = {
  id: string;
  brand: string;
  partNumber: string;
  partName: string;
  matchType: string;
  route: string;
  sources: RawSource[];
  checks: Record<string, unknown>;
  passedDomainCount: number;
};

export function parseProposalRow(row: Record<string, unknown>): ProposalDisplay {
  const checks = (row.checks || {}) as Record<string, unknown>;
  const sources = (Array.isArray(row.sources) ? row.sources : []) as RawSource[];
  const passedDomains = Array.isArray(checks.passedDomains)
    ? (checks.passedDomains as string[])
    : sources.filter((s) => s.number_found && s.car_found && !s.dropped).map((s) => s.domain || "");
  return {
    id: String(row.id || ""),
    brand: String(row.brand || "—"),
    partNumber: String(row.part_number || "—"),
    partName: String(row.part_name || ""),
    matchType: String(row.match_type || ""),
    route: String(row.route || ""),
    sources,
    checks,
    passedDomainCount: Number(checks.passedDomainCount ?? passedDomains.length) || passedDomains.length,
  };
}

export function buildSourceAgreementLabel(passed: number, totalTrusted: number): string {
  if (totalTrusted <= 0) return `${passed} source${passed === 1 ? "" : "s"} confirmed`;
  return `${passed} of ${totalTrusted} sources agree`;
}

export type CheckRow = { ok: boolean; label: string; detail: string };

export function buildPartProposalChecks(
  proposal: ProposalDisplay,
  onFileCount: number,
): { rows: CheckRow[]; passed: number; total: number } {
  const sources = proposal.sources.filter((s) => !s.dropped);
  const passedDomains = new Set(
    sources.filter((s) => s.number_found && s.car_found).map((s) => String(s.domain || "").toLowerCase()),
  );
  const firstPassed = sources.find((s) => s.number_found && s.car_found);
  const shape = proposal.checks.shape as { ok?: boolean } | undefined;
  const rows: CheckRow[] = [
    {
      ok: shape?.ok !== false,
      label: "Part number shape is right for brand",
      detail: proposal.partNumber,
    },
    {
      ok: sources.some((s) => s.number_found),
      label: "Page shows this part number",
      detail: firstPassed?.domain || "—",
    },
    {
      ok: sources.some((s) => s.car_found),
      label: "Page shows this car",
      detail: firstPassed?.domain || "—",
    },
    {
      ok: passedDomains.size >= 2,
      label: "Second trusted catalogue agrees",
      detail: passedDomains.size >= 2 ? `${passedDomains.size} catalogues` : `only ${passedDomains.size} of 2`,
    },
    {
      ok: onFileCount === 0,
      label: "Not already on file",
      detail: onFileCount === 0 ? "new part" : "already listed",
    },
  ];
  const passed = rows.filter((r) => r.ok).length;
  return { rows, passed, total: rows.length };
}

export function buildResearchStepBar(events: Array<Record<string, unknown>>): {
  asked: boolean;
  research: boolean;
  confirmed: boolean;
  added: boolean;
  fleetsNotified: number | null;
} {
  let asked = false;
  let research = false;
  let confirmed = false;
  let added = false;
  let fleetsNotified: number | null = null;
  for (const ev of events) {
    const step = String(ev.step || "");
    const outcome = String(ev.outcome || "");
    if (step === "enqueue" || outcome.includes("asked")) asked = true;
    if (step === "research" && outcome === "ok") research = true;
    if (step === "route" && (outcome === "needs_review" || outcome === "auto_added")) confirmed = true;
    if (outcome === "promoted" || outcome === "auto_added" || step === "promote") added = true;
    const detail = ev.detail as { fleetCount?: number; notified?: number } | undefined;
    if (typeof detail?.notified === "number") fleetsNotified = detail.notified;
    if (typeof detail?.fleetCount === "number" && outcome.includes("notify")) fleetsNotified = detail.fleetCount;
  }
  if (events.some((e) => String(e.outcome || "").includes("notify"))) {
    fleetsNotified = fleetsNotified ?? 1;
  }
  return { asked, research, confirmed, added, fleetsNotified };
}

export function formatHistoryEvents(events: Array<Record<string, unknown>>): Array<{ at: string; label: string }> {
  return events.map((ev) => {
    const at = String(ev.at || ev.created_at || "");
    const step = String(ev.step || "");
    const outcome = String(ev.outcome || "");
    const label = [step, outcome].filter(Boolean).join(" · ") || "Event";
    return { at, label };
  });
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_RE = /\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/;

export function scanPayloadForPii(text: string): { clean: boolean; findings: string[] } {
  const findings: string[] = [];
  if (EMAIL_RE.test(text)) findings.push("email pattern");
  if (PHONE_RE.test(text)) findings.push("phone pattern");
  return { clean: findings.length === 0, findings };
}

export function vehicleResearchGroupKey(row: VehicleCatalogPendingRequest): string {
  return [
    "vehicle",
    row.proposed_make || "",
    row.proposed_model || "",
    String(row.proposed_production_start_year || ""),
    row.organization_id || "",
  ].join(":");
}

export type VehicleSpecField = {
  key: string;
  label: string;
  value: string;
  sourceDomain?: string;
};

export function buildVehicleProposalFields(
  proposal: Record<string, unknown> | null,
  marketFilter: string | null,
): VehicleSpecField[] {
  if (!proposal) return [];
  const market = String(proposal.market || "JM");
  if (marketFilter && marketFilter !== "all" && market !== marketFilter) return [];
  const sources = (Array.isArray(proposal.sources) ? proposal.sources : []) as RawSource[];
  const firstDomain = sources.find((s) => s.domain)?.domain;
  const fields: VehicleSpecField[] = [
    {
      key: "version",
      label: "Version",
      value: [proposal.make, proposal.model].filter(Boolean).join(" ") || "—",
      sourceDomain: firstDomain,
    },
    { key: "chassis", label: "Chassis", value: String(proposal.chassis_code || "—"), sourceDomain: firstDomain },
    { key: "engine", label: "Engine", value: String(proposal.engine_code || "—"), sourceDomain: sources[1]?.domain || firstDomain },
    {
      key: "years",
      label: "Years",
      value: [proposal.production_start_year, proposal.production_end_year].filter(Boolean).join("–") || "—",
      sourceDomain: firstDomain,
    },
    { key: "drivetrain", label: "Drivetrain", value: String(proposal.drivetrain || "—"), sourceDomain: firstDomain },
    { key: "gearbox", label: "Gearbox", value: String(proposal.transmission || "—"), sourceDomain: sources[2]?.domain || firstDomain },
  ];
  return fields.filter((f) => f.value !== "—");
}

export function vehicleSourcesAgreeLabel(sources: RawSource[]): string {
  const domains = new Set(sources.filter((s) => s.domain && !s.dropped).map((s) => s.domain));
  const n = domains.size;
  if (n === 0) return "0 sources";
  return `${n} of ${n} sources agree`;
}

export function firstSourceExcerpt(sources: RawSource[]): { domain: string; quote: string; url: string } | null {
  const hit = sources.find((s) => (s.quote && s.quote.trim()) || s.url);
  if (!hit) return null;
  return {
    domain: String(hit.domain || "source"),
    quote: String(hit.quote || "").trim(),
    url: String(hit.url || ""),
  };
}

export function formatFitsLine(vehicle: VehicleCatalogBrief | null | undefined): string {
  if (!vehicle) return "—";
  const years =
    vehicle.production_start_year && vehicle.production_end_year
      ? `${vehicle.production_start_year}–${vehicle.production_end_year}`
      : vehicle.production_start_year
        ? `${vehicle.production_start_year}–`
        : "";
  return [vehicle.chassis_code, vehicle.engine_code, years].filter(Boolean).join(" · ");
}

export type HealthNotice = { tone: "warn" | "ok"; title: string; detail: string };

export function buildHealthNotices(
  health: Record<string, unknown>,
  strip: CatalogResearchStrip | null,
): HealthNotice[] {
  const notices: HealthNotice[] = [];
  const oldQueued = Number(health.queuedOlderThan24h ?? 0);
  const oldReview = Number(health.reviewOlderThan7d ?? 0);
  const stuck = Number(health.stuckResearchingReset ?? 0);
  if (oldQueued > 0) {
    notices.push({
      tone: "warn",
      title: `${oldQueued} request${oldQueued === 1 ? "" : "s"} waiting more than 24 hours`,
      detail: "Queued jobs were bumped — check the oldest queued row.",
    });
  }
  if (oldReview > 0) {
    notices.push({
      tone: "warn",
      title: `${oldReview} need review older than 7 days`,
      detail: "Review the needs-review queue.",
    });
  }
  if (stuck > 0) {
    notices.push({
      tone: "warn",
      title: `${stuck} stuck researching job${stuck === 1 ? "" : "s"} reset`,
      detail: "Auto-recovery moved long-running jobs back to queued.",
    });
  }
  if (notices.length === 0) {
    notices.push({
      tone: "ok",
      title: "Pipeline nominal",
      detail: strip
        ? `Queue ${strip.queued} · working on ${strip.workingOn ?? 0} · needs you ${strip.needsReview}`
        : "No active warnings from health check.",
    });
  }
  return notices;
}
