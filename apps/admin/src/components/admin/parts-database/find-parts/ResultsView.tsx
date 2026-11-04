// Stitch: AM-S4 find_parts_match_row_with_why_it_matches
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import {
  dominionCategoryBadge,
  dominionMatchRowIcon,
  formatMatchWhyLine,
  TIER_ACCENT,
  TIER_MATCH_CRITERIA,
} from "@roam/types/partMatchReason";
import { formatPartPositionSideLabel } from "@roam/types/partPositionNorm";
import { PART_MATCH_TIERS } from "../../../../../../../packages/types/src/partsResolution";
import type { FindPartsCandidate, FindPartsResult, FoundPartRow, PlainSection } from "../partsDatabaseApi";
import { exportFindPartsMatrix, keepDerivedBatch, type PartMatchHealth } from "../../../../services/partsAutoMatchApi";
import { useAuth } from "../../../auth/AuthContext";
import { MaterialIcon } from "../import/MaterialIcon";
import { PartsMatchTypesOff } from "../PartsDatabaseStates";
import { WhyItMatchesDrawer } from "./WhyItMatchesDrawer";

function readItemFields(item: FoundPartRow & Record<string, unknown>) {
  return {
    derivedId: String((item as { derivedId?: string }).derivedId || (item as { derived_id?: string }).derived_id || ""),
    reasonCode: item.matchReasonCode ?? (item as Record<string, unknown>).match_reason_code as string | null,
    reasonParams: item.matchReasonParams ?? (item as Record<string, unknown>).match_reason_params as Record<string, unknown> | null,
    matchStatus: item.matchStatus ?? (item as Record<string, unknown>).match_status as string | null,
    fitSource: item.fitSource ?? (item as Record<string, unknown>).fit_source as string | null,
    via: item.via ?? (item as Record<string, unknown>).via as string | null,
    position: item.position ?? null,
    side: item.side ?? null,
    wva: item.wva ?? null,
    groupId: String((item as { groupId?: string }).groupId || (item as { group_id?: string }).group_id || ""),
  };
}

export function sectionsFrom(result: FindPartsResult): PlainSection[] {
  if (result.plainSections && result.plainSections.length > 0) return result.plainSections;
  return (result.sections ?? []).map((section) => {
    const tier = PART_MATCH_TIERS.find((row) => row.tier === section.tier);
    const sisters = String((section as { sisterNames?: string }).sisterNames || "");
    return {
      tier: section.tier,
      plainLabel: tier?.plainLabel ?? section.label,
      tag: tier?.tag ?? "",
      plainReason: sisters || tier?.plainReason || "",
      items: (section.items ?? []).map((item) => {
        const part = (item.part ?? {}) as Record<string, unknown>;
        const decision = String(item.catalogDecision ?? part.catalog_decision ?? "");
        const extra = readItemFields(item as FoundPartRow & Record<string, unknown>);
        const reasonCode = extra.reasonCode;
        const reasonParams = extra.reasonParams;
        return {
          partId: String(part.id ?? item.fitmentId ?? ""),
          name: String(part.name ?? "Part"),
          brand: String(part.manufacturer ?? ""),
          number: String(part.oem_part_number ?? ""),
          tier: section.tier,
          reason: formatMatchWhyLine(reasonCode, reasonParams, extra.fitSource),
          status: extra.matchStatus === "needs_checking" || decision !== "confirmed" ? "needs_checking" as const : "verified" as const,
          fitsVariantIds: [],
          matchReasonCode: reasonCode,
          matchReasonParams: reasonParams,
          matchStatus: extra.matchStatus,
          fitSource: extra.fitSource,
          via: extra.via,
          position: extra.position,
          side: extra.side,
          wva: extra.wva,
          derivedId: extra.derivedId,
          groupId: extra.groupId,
        } as FoundPartRow;
      }),
    };
  }).filter((section) => section.items.length > 0);
}

function tierHeading(tier: number, plainLabel: string) {
  const row = PART_MATCH_TIERS.find((t) => t.tier === tier);
  if (tier === 1) return "1. Made for your car · OEM";
  if (tier === 2) return "2. Same car, diff. badge · Sister";
  if (tier === 3) return "3. Fit the engine / Component";
  if (tier === 4) return "4. Other brands that replace it · Aftermarket";
  if (tier === 5) return "5. Fits by size · Universal";
  return `${tier}. ${plainLabel}`;
}

// parts_for_vehicle.fit_source: 'kept' (auto_match_kept listing), 'listed' (manual/import
// listing), 'derived' (engine), 'universal'. `via` is how it fits, never who entered it.
function sourceLabel(meta: ReturnType<typeof readItemFields>) {
  if (meta.fitSource === "kept") return "Kept by you";
  if (meta.fitSource === "listed") return "Entered by hand";
  return "Auto-matched";
}

function formatTolerance(mm: number | null | undefined) {
  if (mm == null) return "Universal tolerance not on file";
  const text = mm < 1 ? `${mm} MM GEOM` : `±${mm} mm`;
  return text.toUpperCase();
}

function tierCriteriaLabel(section: PlainSection): string {
  const sisters = (section.plainReason || "").trim();
  if (section.tier === 1) {
    return `MATCH CRITERIA: ${(TIER_MATCH_CRITERIA[1]?.({}) ?? "Factory line specification").toUpperCase()}`;
  }
  if (section.tier === 2) {
    const shared = sisters
      ? `SHARED PLATFORM: ${sisters.toUpperCase()}`
      : `SHARED PLATFORM: ${(TIER_MATCH_CRITERIA[2]?.({ sisterNames: sisters }) ?? "Sister models").toUpperCase()}`;
    return shared;
  }
  if (section.tier === 3) return "CROSS-CHASSIS CALIPER BRACKET LINK";
  if (section.tier === 4) return "OEM REPLACEMENT TIERS & CROSS-CATALOG";
  if (section.tier === 5 && section.plainReason) {
    return `MATCH CRITERIA: DIMENSIONS (${section.plainReason.toUpperCase()})`;
  }
  return (TIER_MATCH_CRITERIA[section.tier]?.({ sisterNames: sisters }) ?? "").toUpperCase();
}

export function ResultsView({
  title,
  codeLine,
  fitsEvery,
  candidates,
  result,
  owner,
  vehicleId,
  onOpen,
  engineEnabled,
  health,
  onRematch,
  partName,
  positionLabel,
  carQueryLabel,
  chassisChip,
  platformLabel,
  axleLabel,
}: {
  title: string;
  codeLine: string;
  fitsEvery: string;
  candidates: FindPartsCandidate[];
  result: FindPartsResult;
  owner: boolean;
  vehicleId?: string;
  onOpen: (part: FoundPartRow) => void;
  onOpenDatabase?: () => void;
  engineEnabled?: boolean;
  health?: PartMatchHealth | null;
  onRematch?: () => void;
  partName?: string;
  positionLabel?: string;
  carQueryLabel?: string;
  chassisChip?: string;
  platformLabel?: string;
  axleLabel?: string;
}) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [tierFilter, setTierFilter] = useState<number[]>(() => {
    if (typeof window === "undefined") return [1, 2, 3, 4, 5];
    const raw = new URLSearchParams(window.location.search).get("tiers");
    if (!raw) return [1, 2, 3, 4, 5];
    const parsed = raw.split(",").map((x) => Number(x.trim())).filter((n) => n >= 1 && n <= 5);
    return parsed.length ? parsed : [1, 2, 3, 4, 5];
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "needs_checking">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "derived" | "listed">("all");
  const [batchMode, setBatchMode] = useState(false);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [batchNote, setBatchNote] = useState("");
  const [whyPart, setWhyPart] = useState<FoundPartRow | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("tiers", tierFilter.join(","));
    window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [tierFilter]);

  const sections = useMemo(() => {
    return sectionsFrom(result)
      .filter((s) => tierFilter.includes(s.tier))
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const meta = readItemFields(item as FoundPartRow & Record<string, unknown>);
          if (statusFilter === "live" && item.status === "needs_checking") return false;
          if (statusFilter === "needs_checking" && item.status !== "needs_checking") return false;
          if (sourceFilter === "derived" && meta.fitSource !== "derived") return false;
          if (sourceFilter === "listed" && meta.fitSource === "derived") return false;
          return true;
        }),
      }))
      .filter((s) => s.items.length > 0);
  }, [result, tierFilter, statusFilter, sourceFilter]);

  const groupCount = result.databaseNodeGroups ?? new Set(
    sections.flatMap((s) => s.items.map((i) => readItemFields(i as FoundPartRow & Record<string, unknown>).groupId).filter(Boolean)),
  ).size;
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const live = Number(health?.derived?.live ?? 0);
  const checking = Number(health?.derived?.needsChecking ?? 0);
  const openConflicts = Object.values(health?.openConflicts ?? {}).reduce((a, b) => a + Number(b), 0);
  const pendingInspect = vehicleId ? checking + openConflicts : checking;
  const toleranceMm = result.universalToleranceMm ?? result.universal_part?.tolerance_mm ?? null;
  const passRate = live + checking > 0 ? Math.round((live / (live + checking)) * 1000) / 10 : null;
  const ownerTitle = owner ? undefined : "Only the owner can run this.";
  const auditLabel = health?.lastRun?.error ? "DEGRADED" : "COMPLIANT (ISO/PAS 28000)";
  const engineHash = health?.engineHash ?? (health?.engineVersion != null
    ? `#F${health.engineVersion}${health.normVersion ?? 0}-99A`
    : null);

  async function exportMatrix() {
    if (!token || !vehicleId) {
      toast.message("Pick a car first.");
      return;
    }
    setExportBusy(true);
    try {
      const out = await exportFindPartsMatrix(token, { vehicleId, format: "csv" });
      if (out instanceof Blob) {
        const url = URL.createObjectURL(out);
        const a = document.createElement("a");
        a.href = url;
        a.download = "find-parts-matrix.csv";
        a.click();
        URL.revokeObjectURL(url);
        toast.success("Export started");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportBusy(false);
    }
  }

  async function commitBatch() {
    if (!owner || !token || !batchIds.length) return;
    const note = batchNote.trim();
    if (!note) {
      toast.message("Add a note for the batch commit.");
      return;
    }
    try {
      await keepDerivedBatch(token, batchIds, note);
      toast.success("Active fitments committed");
      setBatchIds([]);
      setBatchNote("");
      setBatchMode(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not commit");
    }
  }

  return (
    <div className="find-parts-flow find-parts-results w-full max-w-none mx-auto flex flex-col gap-space-lg pb-space-lg">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="relative">
          <button
            type="button"
            className="find-parts-toolbar-btn flex h-8 items-center gap-1.5 rounded-lg bg-surface-container px-2.5 font-label-md text-label-md text-on-surface shadow-sm transition-colors hover:bg-surface-container-high"
            onClick={() => setFilterOpen((v) => !v)}
          >
            <MaterialIcon name="tune" className="text-[16px]" />
            Filter tiers
          </button>
          {filterOpen ? (
            <div className="absolute right-0 z-20 mt-1 min-w-[220px] rounded-lg border border-outline-variant bg-surface-container-lowest p-3 shadow-lg text-sm">
              {[1, 2, 3, 4, 5].map((t) => (
                <label key={t} className="flex items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={tierFilter.includes(t)}
                    onChange={() => setTierFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].sort()))}
                  />
                  Tier {t}
                </label>
              ))}
              <label className="mt-2 flex items-center gap-2">
                Status
                <select className="rounded border border-outline-variant px-1 py-0.5" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
                  <option value="all">All</option>
                  <option value="live">Live</option>
                  <option value="needs_checking">Needs checking</option>
                </select>
              </label>
              <label className="mt-1 flex items-center gap-2">
                Source
                <select className="rounded border border-outline-variant px-1 py-0.5" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}>
                  <option value="all">All</option>
                  <option value="derived">Derived</option>
                  <option value="listed">Listed</option>
                </select>
              </label>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className="find-parts-toolbar-btn flex h-8 items-center gap-1.5 rounded-lg bg-surface-container px-2.5 font-label-md text-label-md text-on-surface shadow-sm transition-colors hover:bg-surface-container-high disabled:opacity-40"
          disabled={!vehicleId || exportBusy}
          onClick={() => { void exportMatrix(); }}
        >
          <MaterialIcon name="file_download" className="text-[16px]" />
          Export Matrix
        </button>
        <button
          type="button"
          className="find-parts-primary-btn flex h-8 items-center gap-1.5 rounded-lg px-3 font-label-md text-label-md font-semibold shadow-sm transition-colors disabled:opacity-40"
          disabled={!owner}
          title={ownerTitle}
          onClick={onRematch}
        >
          <MaterialIcon name="sync_alt" className="text-[16px]" />
          Run Engine Re-match
        </button>
      </div>

      <div className="rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono-sm text-mono-sm font-semibold uppercase tracking-wider text-on-surface-variant">Active query</span>
            <div className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-1 text-on-surface">
              <MaterialIcon name="directions_car" className="text-[16px] text-primary" />
              <span className="font-headline-md text-headline-md">{carQueryLabel || title}</span>
              {chassisChip ? (
                <span className="rounded bg-surface-container px-1 font-mono-sm text-mono-sm font-semibold text-primary">{chassisChip}</span>
              ) : null}
            </div>
            {partName ? (
              <>
                <MaterialIcon name="chevron_right" className="text-[16px] text-outline" />
                <div className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-1">
                  <MaterialIcon name="category" className="text-[16px] text-on-surface-variant" />
                  <span className="font-label-md text-label-md font-semibold text-on-surface">{partName}</span>
                </div>
              </>
            ) : null}
            {positionLabel && positionLabel !== "Any position" ? (
              <>
                <MaterialIcon name="chevron_right" className="text-[16px] text-outline" />
                <div className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-1">
                  <MaterialIcon name="vertical_align_top" className="text-[16px] text-on-surface-variant" />
                  <span className="font-label-md text-label-md font-semibold text-on-surface">{positionLabel}</span>
                </div>
              </>
            ) : null}
            <div className="ml-1 flex items-center gap-1.5 rounded-full bg-secondary-container px-2 py-0.5 font-mono-sm text-mono-sm font-semibold text-on-secondary-container">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-container" />
              {total} fits identified
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-space-md font-mono-sm text-mono-sm text-on-surface-variant">
            {platformLabel ? <span>Platform: <strong className="font-semibold text-on-surface">{platformLabel}</strong></span> : null}
            {axleLabel ? <span>Axle: <strong className="font-semibold text-on-surface">{axleLabel}</strong></span> : null}
            {codeLine && !platformLabel ? <span>{codeLine}</span> : null}
          </div>
        </div>
      </div>

      {engineEnabled ? (
        <div className="flex flex-wrap items-center justify-between gap-space-md rounded-xl bg-surface-container-low px-space-md py-space-sm shadow-sm">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary">
              <MaterialIcon name="neurology" className="text-[18px]" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-headline-md text-headline-md font-semibold text-on-surface">Auto-matching engine active</span>
                {passRate != null ? (
                  <span className="rounded-full bg-surface-container-highest px-2 py-0.5 font-mono-sm text-mono-sm text-on-surface">
                    Pass rate: {passRate}%
                  </span>
                ) : null}
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Matched using factory OE numbers, platform twins, and industry cross-references.
                {pendingInspect > 0 ? ` ${pendingInspect} item${pendingInspect === 1 ? "" : "s"} require catalog architectural review.` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono-sm text-mono-sm">
            {engineHash ? (
              <span className="rounded-lg bg-surface-container-highest px-2 py-1 text-on-surface-variant">Engine hash: {engineHash}</span>
            ) : null}
            {pendingInspect > 0 ? (
              vehicleId ? (
                <a
                  className="find-parts-pending-link flex items-center gap-1 rounded-lg bg-surface-container px-2 py-1 font-medium text-error"
                  href={`/?page=pending-motor-vehicles&tab=conflicts&vehicle=${encodeURIComponent(vehicleId)}`}
                >
                  <span className="h-2 w-2 rounded-full bg-error" />
                  {pendingInspect} Pending inspect
                </a>
              ) : (
                <span className="flex items-center gap-1 rounded-lg bg-surface-container px-2 py-1 text-error">
                  <span className="h-2 w-2 rounded-full bg-error" />
                  {pendingInspect} Pending inspect
                </span>
              )
            ) : null}
          </div>
        </div>
      ) : null}

      {result.mode === "legacy" ? (
        <PartsMatchTypesOff tierOneCount={sections.reduce((s, x) => s + (x.tier === 1 ? x.items.length : 0), 0)} offlineTiers={result.emptyTiers ?? [2, 3, 4, 5]} />
      ) : null}

      {sections.map((section) => {
        const criteria = tierCriteriaLabel(section);
        const needsChecking = section.items.filter((i) => i.status === "needs_checking").length;
        const accent = TIER_ACCENT[section.tier] ?? "#0153dc";
        return (
          <section key={section.tier} className="mb-space-lg">
            <div className="find-parts-tier-header mb-space-xs flex flex-wrap items-start justify-between gap-2 pb-space-xs">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
                <h2 className="font-headline-md text-headline-md font-bold uppercase tracking-tight text-on-surface">
                  {tierHeading(section.tier, section.plainLabel)}
                </h2>
                <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-mono-sm text-mono-sm font-semibold text-on-surface-variant">
                  Tier {section.tier} · {section.items.length} Matches{section.tier === 3 && needsChecking ? ` (${needsChecking} Needs Checking)` : ""}
                </span>
              </div>
              <span className="min-w-0 max-w-[min(100%,28rem)] shrink text-right font-mono-sm text-mono-sm leading-snug text-on-surface-variant whitespace-normal break-words">
                {criteria}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {section.items.map((item) => {
                const meta = readItemFields(item as FoundPartRow & Record<string, unknown>);
                const partKind = (item as FoundPartRow).partKind
                  ?? (item as Record<string, unknown>).part_kind as string | null
                  ?? null;
                const linkComponentName = (item as FoundPartRow).linkComponentName ?? null;
                const badge = dominionCategoryBadge({
                  via: meta.via,
                  reasonCode: meta.reasonCode,
                  tier: section.tier,
                  partKind,
                  fitSource: meta.fitSource,
                  matchReasonParams: item.matchReasonParams,
                  linkComponentName,
                });
                const rowIcon = dominionMatchRowIcon({
                  via: meta.via,
                  reasonCode: meta.reasonCode,
                  partKind,
                  tier: section.tier,
                  matchStatus: item.status === "needs_checking" ? "needs_checking" : meta.matchStatus,
                });
                const isDerived = meta.fitSource === "derived";
                const posShort = meta.position ? String(meta.position).charAt(0).toUpperCase() + String(meta.position).slice(1) : "";
                const sideShort = meta.side === "any"
                  ? "Any"
                  : meta.side === "both" || !meta.side
                    ? "Both"
                    : meta.side === "left"
                      ? "Left"
                      : meta.side === "right"
                        ? "Right"
                        : "";
                const wvaPeerLabel = (item as FoundPartRow).wvaPeerLabel;
                const reasonParams = item.matchReasonParams ?? null;
                const supersessionFrom = reasonParams?.from != null ? String(reasonParams.from) : "";
                const supersessionTo = reasonParams?.to != null ? String(reasonParams.to) : "";
                return (
                  <div
                    key={item.partId + item.number}
                    className="group rounded-xl bg-surface-container-lowest px-space-md py-space-sm shadow-sm transition-colors hover:bg-surface-container-low"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-space-md">
                      <div className="min-w-0 flex-1 pr-space-md">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          {batchMode && meta.derivedId ? (
                            <input
                              type="checkbox"
                              className="shrink-0"
                              checked={batchIds.includes(meta.derivedId)}
                              onChange={() => setBatchIds((prev) => (prev.includes(meta.derivedId) ? prev.filter((id) => id !== meta.derivedId) : [...prev, meta.derivedId]))}
                            />
                          ) : null}
                          <span className="font-mono-lg text-mono-lg font-bold tracking-tight text-on-surface">
                            {[item.brand, item.number].filter(Boolean).join(" ")}
                          </span>
                          {item.name ? (
                            <>
                              <span className="text-outline">·</span>
                              <span className="font-headline-md text-headline-md font-semibold text-on-surface">{item.name}</span>
                            </>
                          ) : null}
                          <span className="flex h-5 items-center rounded-full bg-surface-container-high px-2 font-mono-sm text-mono-sm font-semibold text-primary">
                            {badge}
                          </span>
                          {posShort ? (
                            <span className="rounded bg-surface-container px-1.5 font-mono-sm text-mono-sm font-medium text-on-surface-variant">Pos: {posShort}</span>
                          ) : null}
                          {sideShort ? (
                            <span className="rounded bg-surface-container px-1.5 font-mono-sm text-mono-sm font-medium text-on-surface-variant">Side: {sideShort}</span>
                          ) : null}
                          {meta.wva ? <span className="font-mono-sm text-mono-sm text-outline">WVA {meta.wva}</span> : null}
                        </div>
                        <div className="flex flex-wrap items-start gap-x-1.5 gap-y-1">
                          <MaterialIcon
                            name={rowIcon}
                            className={`mt-0.5 shrink-0 text-[15px] ${item.status === "needs_checking" ? "text-amber-600" : rowIcon === "check" ? "text-on-surface-variant" : "text-primary"}`}
                          />
                          <p className="min-w-[12rem] flex-1 font-body-sm text-body-sm text-on-surface-variant">{item.reason}</p>
                          {supersessionFrom && supersessionTo ? (
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-container-high px-2 py-0.5 font-mono-sm text-mono-sm text-on-surface shadow-sm">
                              <MaterialIcon name="verified" className="text-[13px] text-primary" />
                              <span>Car: <strong className="text-on-surface">{supersessionFrom}</strong></span>
                              <span className="text-outline">·</span>
                              <span>Part: <strong className="text-on-surface">{supersessionTo}</strong></span>
                              <span className="text-outline">·</span>
                              <span className="font-semibold text-primary">Change: {supersessionFrom.slice(-5)} → {supersessionTo.slice(-5)}</span>
                            </span>
                          ) : null}
                          {wvaPeerLabel ? (
                            <span className="font-mono-sm text-mono-sm rounded-md bg-surface-container-high px-2 py-0.5 font-medium text-on-surface-variant">
                              {wvaPeerLabel}
                            </span>
                          ) : null}
                          {item.status === "needs_checking" ? (
                            <a
                              className="find-parts-pending-link flex shrink-0 items-center gap-0.5 font-mono-sm text-mono-sm font-semibold"
                              href="/?page=pending-motor-vehicles&tab=conflicts"
                            >
                              Review in Pending catalog
                              <MaterialIcon name="north_east" className="text-[13px]" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-space-md">
                        {item.status === "needs_checking" ? (
                          <a
                            className="flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-1 font-mono-sm text-mono-sm font-semibold text-amber-800"
                            href="/?page=pending-motor-vehicles&tab=conflicts"
                          >
                            <MaterialIcon name="visibility" className="text-[14px] text-amber-600" />
                            Needs checking
                          </a>
                        ) : (
                          <div className="flex items-center gap-1.5 rounded-full bg-surface-container px-2 py-1 font-mono-sm text-mono-sm font-semibold text-on-surface">
                            <span className="h-2 w-2 rounded-full bg-emerald-600" />
                            Live
                          </div>
                        )}
                        <div className="flex items-center gap-1 font-mono-sm text-mono-sm text-on-surface-variant">
                          <MaterialIcon
                            name={meta.fitSource === "kept" ? "check_circle" : meta.fitSource === "listed" ? "edit" : "smart_toy"}
                            className="text-[15px]"
                          />
                          {sourceLabel(meta)}
                        </div>
                        {isDerived ? (
                          <button
                            type="button"
                            className="flex h-8 items-center gap-1 rounded-lg bg-surface-container px-3 font-label-md text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
                            onClick={() => setWhyPart(item)}
                          >
                            Inspect fit
                            <MaterialIcon name="arrow_forward" className="text-[15px]" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="flex h-8 items-center gap-1 rounded-lg bg-surface-container px-3 font-label-md text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
                            onClick={() => onOpen(item)}
                          >
                            View drawer
                            <MaterialIcon name="arrow_forward" className="text-[15px]" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="rounded-xl bg-surface-container-low p-space-md shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-space-md">
          <div className="flex flex-wrap items-center gap-space-md font-mono-sm text-mono-sm text-on-surface-variant">
            <span>Database nodes: <strong className="text-on-surface">{groupCount} groups</strong></span>
            <span className="text-outline">·</span>
            <span>Automatch tolerance: <strong className="text-on-surface">{formatTolerance(toleranceMm)}</strong></span>
            <span className="text-outline">·</span>
            <span>Engine audit: <strong className="text-on-surface">{auditLabel}</strong></span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {batchMode ? (
              <input
                className="find-parts-batch-note min-w-[200px] rounded-lg border border-outline-variant bg-surface-bright px-2 py-1.5 font-body-sm text-body-sm text-on-surface"
                placeholder="Batch commit note (required)"
                value={batchNote}
                onChange={(e) => setBatchNote(e.target.value)}
              />
            ) : null}
            <button
              type="button"
              className="h-8 rounded-lg bg-surface-container px-3 font-label-md text-label-md font-semibold text-on-surface transition-colors hover:bg-surface-container-high"
              onClick={() => { setBatchMode((v) => !v); if (batchMode) { setBatchIds([]); setBatchNote(""); } }}
            >
              {batchMode ? "Exit batch mode" : "Batch validation mode"}
            </button>
            <button
              type="button"
              className="find-parts-primary-btn h-8 rounded-lg px-3 font-label-md text-label-md font-semibold transition-colors disabled:opacity-40"
              disabled={!owner || !batchIds.length || !batchNote.trim()}
              title={ownerTitle}
              onClick={() => { void commitBatch(); }}
            >
              Commit active fitments
            </button>
          </div>
        </div>
      </div>

      {fitsEvery ? <p className="font-body-sm text-body-sm text-on-surface-variant">{fitsEvery}</p> : null}
      {whyPart ? <WhyItMatchesDrawer part={whyPart} onClose={() => setWhyPart(null)} /> : null}
    </div>
  );
}
