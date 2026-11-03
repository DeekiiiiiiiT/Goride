// Stitch: AM-S4 find_parts_match_row_with_why_it_matches
import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import {
  dominionCategoryBadge,
  formatMatchWhyLine,
  TIER_ACCENT,
  TIER_MATCH_CRITERIA,
} from "@roam/types/partMatchReason";
import { formatPartPositionSideLabel } from "@roam/types/partPositionNorm";
import { fillPlainReason, PART_MATCH_TIERS } from "../../../../../../../packages/types/src/partsResolution";
import type { FindPartsCandidate, FindPartsResult, FoundPartRow, PlainSection } from "../partsDatabaseApi";
import { exportFindPartsMatrix, keepDerivedBatch, type PartMatchHealth } from "../../../../services/partsAutoMatchApi";
import { useAuth } from "../../../auth/AuthContext";
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
          reason: formatMatchWhyLine(reasonCode, reasonParams),
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
        } as FoundPartRow;
      }),
    };
  }).filter((section) => section.items.length > 0);
}

export function ResultsView({
  title,
  codeLine,
  fitsEvery,
  candidates,
  result,
  owner,
  vehicleId,
  onAdd: _onAdd,
  onBack: _onBack,
  onOpen,
  engineEnabled,
  health,
  onRematch,
}: {
  title: string;
  codeLine: string;
  fitsEvery: string;
  candidates: FindPartsCandidate[];
  result: FindPartsResult;
  owner: boolean;
  vehicleId?: string;
  onAdd: () => void;
  onBack: () => void;
  onOpen: (part: FoundPartRow) => void;
  onOpenDatabase?: () => void;
  engineEnabled?: boolean;
  health?: PartMatchHealth | null;
  onRematch?: () => void;
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
  const [whyPart, setWhyPart] = useState<FoundPartRow | null>(null);
  const [exportBusy, setExportBusy] = useState(false);

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

  const groupCount = new Set(sections.flatMap((s) => s.items.map((i) => i.partId))).size;
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const live = Number(health?.derived?.live ?? 0);
  const checking = Number(health?.derived?.needsChecking ?? 0);
  const openConflicts = Object.values(health?.openConflicts ?? {}).reduce((a, b) => a + Number(b), 0);
  const pendingInspect = vehicleId ? checking + openConflicts : checking;
  const toleranceMm = (result as { universalToleranceMm?: number; universal_part?: { tolerance_mm?: number } }).universalToleranceMm
    ?? (result as { universal_part?: { tolerance_mm?: number } }).universal_part?.tolerance_mm;
  const passRate = live + checking > 0 ? Math.round((live / (live + checking)) * 100) : 100;
  const ownerTitle = owner ? undefined : "Only the owner can run this.";
  const auditLabel = health?.lastRun?.error ? "DEGRADED" : "ACTIVE";

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
    try {
      await keepDerivedBatch(token, batchIds, "Batch validation commit from Find parts");
      toast.success("Active fitments committed");
      setBatchIds([]);
      setBatchMode(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not commit");
    }
  }

  return (
    <div className="find-parts-flow w-full max-w-5xl mx-auto flex flex-col gap-space-lg">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="font-mono-sm text-mono-sm uppercase text-secondary">FIND PARTS</nav>
        <div className="flex flex-wrap gap-2">
          <details className="rounded-[0.25rem] border border-outline-variant px-3 py-1.5 text-sm">
            <summary className="cursor-pointer font-semibold">Filter tiers</summary>
            <div className="mt-2 flex flex-col gap-2">
              {[1, 2, 3, 4, 5].map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={tierFilter.includes(t)}
                    onChange={() => setTierFilter((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].sort()))}
                  />
                  Tier {t}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm">
                Status
                <select className="rounded border px-1 py-0.5" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
                  <option value="all">All</option>
                  <option value="live">Live</option>
                  <option value="needs_checking">Needs checking</option>
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm">
                Source
                <select className="rounded border px-1 py-0.5" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as typeof sourceFilter)}>
                  <option value="all">All</option>
                  <option value="derived">Derived</option>
                  <option value="listed">Listed</option>
                </select>
              </label>
            </div>
          </details>
          <button type="button" className="rounded-[0.25rem] border border-outline-variant px-3 py-1.5 text-sm disabled:opacity-40" disabled={!vehicleId || exportBusy} onClick={() => { void exportMatrix(); }}>
            Export Matrix
          </button>
          <button type="button" className="rounded-[0.25rem] border border-outline-variant px-3 py-1.5 text-sm" onClick={() => setBatchMode((v) => !v)}>
            {batchMode ? "Exit batch mode" : "Batch Validation Mode"}
          </button>
          <button type="button" className="rounded-[0.25rem] bg-primary-container px-3 py-1.5 text-sm font-semibold text-on-primary disabled:opacity-40" disabled={!owner} title={ownerTitle} onClick={onRematch}>
            Run Engine Re-match
          </button>
        </div>
      </div>

      <div className="rounded-[0.5rem] border border-outline-variant/50 bg-surface-container-low px-4 py-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{title}</span>
        <span className="text-secondary">›</span>
        <span>{candidates[0]?.plainLabel ?? "Part"}</span>
        {codeLine ? <span className="font-mono-sm text-mono-sm text-secondary">· PLATFORM / AXLE · {codeLine}</span> : null}
        <span className="ml-auto font-mono-sm font-bold">{total} FITS IDENTIFIED</span>
      </div>

      {engineEnabled ? (
        <div className="rounded-[0.5rem] border border-blue-200 bg-blue-50/60 px-4 py-3 text-sm">
          <span className="font-semibold">Auto-matching engine active</span>
          <span className="ml-3">Pass rate {passRate}%</span>
          <span className="ml-3 font-mono-sm">Engine hash v{health?.engineVersion ?? "—"} · {String(health?.lastRun?.run_id ?? "").slice(0, 8)}</span>
          {vehicleId ? (
            <a className="ml-3 text-primary font-semibold" href={`/?page=pending-motor-vehicles&tab=conflicts&vehicle=${encodeURIComponent(vehicleId)}`}>
              {pendingInspect} Pending inspect ↗
            </a>
          ) : (
            <span className="ml-3">{pendingInspect} Pending inspect</span>
          )}
        </div>
      ) : null}

      {batchMode ? (
        <div className="flex flex-wrap items-center gap-2 rounded border border-primary/30 bg-primary-fixed/20 px-3 py-2 text-sm">
          <span>{batchIds.length} selected for batch validation</span>
          <button type="button" className="ml-auto rounded bg-primary-container px-3 py-1 font-semibold text-on-primary disabled:opacity-40" disabled={!owner || !batchIds.length} onClick={() => { void commitBatch(); }}>
            Commit Active Fitments
          </button>
        </div>
      ) : null}

      {result.mode === "legacy" ? (
        <PartsMatchTypesOff tierOneCount={sections.reduce((s, x) => s + (x.tier === 1 ? x.items.length : 0), 0)} offlineTiers={result.emptyTiers ?? [2, 3, 4, 5]} />
      ) : null}

      {sections.map((section) => {
        const sisterNames = section.plainReason || "";
        const criteria = section.tier === 2
          ? fillPlainReason(2, { sisters: sisterNames })
          : (TIER_MATCH_CRITERIA[section.tier]?.({ sisterNames }) ?? "");
        const needsChecking = section.items.filter((i) => i.status === "needs_checking").length;
        return (
          <section key={section.tier} className="bg-surface-container-lowest rounded-[0.5rem] shadow-sm overflow-hidden flex">
            <div className="w-1.5 shrink-0" style={{ backgroundColor: TIER_ACCENT[section.tier] }} />
            <div className="p-space-lg flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2 pb-space-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-headline-md text-headline-md font-bold">{section.plainLabel}</h3>
                  <span className="px-2 py-0.5 rounded-[0.75rem] font-mono-sm text-mono-sm font-semibold" style={{ color: TIER_ACCENT[section.tier] }}>
                    Tier {section.tier} · {section.items.length} Matches{section.tier === 3 && needsChecking ? ` (${needsChecking} Needs Checking)` : ""}
                  </span>
                </div>
                <span className="font-mono-sm text-mono-sm text-secondary max-w-xs text-right">MATCH CRITERIA: {criteria}</span>
              </div>
              <div className="flex flex-col gap-2">
                {section.items.map((item) => {
                  const meta = readItemFields(item as FoundPartRow & Record<string, unknown>);
                  const badge = dominionCategoryBadge({ via: meta.via, reasonCode: meta.reasonCode, tier: section.tier });
                  const posLabel = formatPartPositionSideLabel(meta.position, meta.side);
                  const isDerived = meta.fitSource === "derived" || meta.via === "engine" || meta.via === "sister";
                  return (
                    <div
                      key={item.partId + item.number}
                      className="flex flex-col gap-2 p-3 rounded-[0.25rem] bg-surface-container-low border border-outline-variant/30"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {batchMode && meta.derivedId ? (
                          <input
                            type="checkbox"
                            checked={batchIds.includes(meta.derivedId)}
                            onChange={() => setBatchIds((prev) => (prev.includes(meta.derivedId) ? prev.filter((id) => id !== meta.derivedId) : [...prev, meta.derivedId]))}
                          />
                        ) : null}
                        <span className="font-semibold">{item.brand}</span>
                        <span className="font-mono text-primary">{item.number}</span>
                        <span className="text-secondary">{item.name}</span>
                        <span className="px-2 py-0.5 rounded-[0.75rem] bg-surface-container text-xs font-semibold">{badge}</span>
                        {posLabel !== "Any position" ? <span className="px-1.5 py-0.5 rounded bg-surface text-xs">{posLabel}</span> : null}
                        {meta.wva ? <span className="font-mono-sm text-xs">WVA {meta.wva}</span> : null}
                      </div>
                      <p className="font-body-sm text-secondary">{item.reason}</p>
                      <div className="rounded border border-outline-variant/40 bg-surface-container-low px-2 py-1.5 text-xs grid sm:grid-cols-2 gap-1">
                        <span><strong>Your car:</strong> {title}</span>
                        <span><strong>This part:</strong> {[item.brand, item.number, item.name].filter(Boolean).join(" · ")}</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs items-center">
                        {item.status === "needs_checking" ? (
                          <a
                            className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded-[0.75rem]"
                            href="/?page=pending-motor-vehicles&tab=conflicts"
                          >
                            Needs checking · Review in Pending catalog ↗
                          </a>
                        ) : (
                          <span className="text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-[0.75rem]">Live</span>
                        )}
                        <span className="text-secondary">{meta.fitSource ?? "listed"} · {meta.via ?? "direct"}</span>
                        {isDerived ? (
                          <button type="button" className="ml-auto text-primary font-semibold" onClick={() => setWhyPart(item)}>Inspect fit</button>
                        ) : (
                          <button type="button" className="ml-auto text-primary font-semibold" onClick={() => onOpen(item)}>View drawer</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap gap-4 font-mono-sm text-mono-sm text-secondary border-t border-outline-variant/40 pt-4">
        <span>DATABASE NODES · {groupCount} groups</span>
        <span>AUTOMATCH TOLERANCE · {toleranceMm != null ? `±${toleranceMm} mm` : "Universal tolerance not on file"}</span>
        <span>ENGINE AUDIT · {auditLabel}</span>
      </div>
      {fitsEvery ? <p className="text-sm text-secondary">{fitsEvery}</p> : null}
      {whyPart ? <WhyItMatchesDrawer part={whyPart} onClose={() => setWhyPart(null)} /> : null}
    </div>
  );
}
