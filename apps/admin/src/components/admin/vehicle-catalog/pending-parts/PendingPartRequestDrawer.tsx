// Stitch: dominion-redesign/pending_catalog_drawer_needs_review + pending_catalog_drawer_added_automatically
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CatalogResearchJobListItem,
  PendingPartsGroupDetail,
  PendingPartsPatchAction,
  PendingPartsQueueGroup,
  PartsBrowseNameMap,
  VehicleCatalogBrief,
} from "../../../../services/pendingPartsCatalogService";
import {
  componentPositionAware,
  fetchCatalogResearchJob,
  partPlainName,
  postCatalogResearchJobAction,
} from "../../../../services/pendingPartsCatalogService";
import { buildPartSearchText } from "./buildPartSearchText";
import {
  buildPartProposalChecks,
  buildResearchStepBar,
  formatFitsLine,
  formatHistoryEvents,
  parseProposalRow,
  partDrawerVariantFromJobState,
  type PartDrawerVariant,
} from "./pendingCatalogViewModels";

export type PendingPartDrawerDisplay = {
  partTitle: string;
  vehicleHeadline: string;
  vehicleSubline: string;
  statusLabel: string;
  firstAskedLabel: string;
  fleetLabel: string;
  reqShortId: string;
};

type PendingPartRequestDrawerProps = {
  open: boolean;
  accessToken: string;
  group: PendingPartsQueueGroup | null;
  job: CatalogResearchJobListItem | null;
  display: PendingPartDrawerDisplay | null;
  detail: PendingPartsGroupDetail | null;
  detailLoading: boolean;
  busy: boolean;
  vehicleBrief: VehicleCatalogBrief | null;
  partNames: PartsBrowseNameMap;
  onClose: () => void;
  onPatch: (action: PendingPartsPatchAction) => Promise<void>;
  onReload: () => Promise<void>;
};

export function PendingPartRequestDrawer({
  open,
  accessToken,
  group,
  job,
  display,
  detail,
  detailLoading,
  busy,
  vehicleBrief,
  partNames,
  onClose,
  onPatch,
  onReload,
}: PendingPartRequestDrawerProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [researchBusy, setResearchBusy] = useState(false);
  const [jobDetail, setJobDetail] = useState<Awaited<ReturnType<typeof fetchCatalogResearchJob>> | null>(null);
  const [jobLoading, setJobLoading] = useState(false);

  const jobId = detail?.researchJobId || job?.jobId || null;
  const variant: PartDrawerVariant = partDrawerVariantFromJobState(job?.state ?? jobDetail?.job?.state as string);

  const reloadJob = useCallback(async () => {
    if (!jobId || !accessToken) {
      setJobDetail(null);
      return;
    }
    setJobLoading(true);
    try {
      setJobDetail(await fetchCatalogResearchJob(accessToken, jobId));
    } catch {
      setJobDetail(null);
    } finally {
      setJobLoading(false);
    }
  }, [accessToken, jobId]);

  useEffect(() => {
    if (!open) return;
    void reloadJob();
  }, [open, reloadJob]);

  useEffect(() => {
    if (!open) return;
    setCopyState("idle");
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (copyState === "idle") return;
    const t = window.setTimeout(() => setCopyState("idle"), 2000);
    return () => window.clearTimeout(t);
  }, [copyState]);

  const proposal = useMemo(() => {
    const row = (jobDetail?.proposals || [])[0] as Record<string, unknown> | undefined;
    return row ? parseProposalRow(row) : null;
  }, [jobDetail]);

  const checks = useMemo(
    () => (proposal ? buildPartProposalChecks(proposal, detail?.onFile?.length ?? 0) : null),
    [proposal, detail?.onFile],
  );

  const stepBar = useMemo(
    () => buildResearchStepBar((jobDetail?.events || []) as Array<Record<string, unknown>>),
    [jobDetail],
  );

  const history = useMemo(
    () => formatHistoryEvents((jobDetail?.events || []) as Array<Record<string, unknown>>).slice(-8),
    [jobDetail],
  );

  if (!open || !group || !display) return null;

  const partPlain = partPlainName(group.componentId, partNames);
  const positionAware = componentPositionAware(group.componentId, partNames);

  const copyForSearch = async () => {
    const text = buildPartSearchText(
      group,
      vehicleBrief ?? undefined,
      partPlain,
      detail?.notes ?? [],
      positionAware,
    );
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const copyButtonLabel =
    copyState === "copied" ? "Copied ✓" : copyState === "failed" ? "Couldn't copy" : "Copy for search";

  async function researchAct(action: string, body?: Record<string, unknown>) {
    if (!jobId) return;
    setResearchBusy(true);
    try {
      await postCatalogResearchJobAction(accessToken, jobId, action, body);
      await reloadJob();
      await onReload();
    } finally {
      setResearchBusy(false);
    }
  }

  const statusChipClass =
    variant === "auto_added"
      ? "bg-emerald-50 text-emerald-700"
      : variant === "needs_review"
        ? "bg-amber-100 text-amber-900"
        : "border border-outline-variant/40 bg-surface-container text-on-surface-variant";

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-[#090d16]/40 backdrop-blur-[2px]"
        aria-label="Close drawer"
        onClick={onClose}
      />
      <aside
        className="fixed top-0 right-0 z-50 flex h-screen w-full max-w-[560px] flex-col overflow-hidden border-l border-surface-variant bg-surface-container-lowest shadow-2xl"
        aria-modal
        role="dialog"
      >
        <div className="flex-none border-b border-surface-variant bg-surface-container-lowest p-space-lg">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono-sm text-mono-sm font-semibold uppercase tracking-wider text-on-surface-variant">
                REQUEST GROUP #REQ-{display.reqShortId}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-label-xs text-label-xs font-semibold ${statusChipClass}`}>
                {variant === "needs_review" ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-600" />
                ) : null}
                {display.statusLabel}
              </span>
            </div>
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container" onClick={onClose}>
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
          <h2 className="font-headline-xl text-headline-xl font-bold tracking-tight text-on-surface">{display.partTitle}</h2>
          <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
            {display.vehicleHeadline}
            {display.vehicleSubline ? ` · ${display.vehicleSubline}` : ""}
          </p>
          <div className="mt-space-md flex flex-wrap items-center gap-space-sm border-t border-surface-container-high pt-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-primary-fixed px-2.5 py-1 font-mono-sm text-mono-sm font-semibold text-primary">
              {display.fleetLabel}
            </span>
            <span className="font-mono-sm text-mono-sm text-on-surface-variant">first asked {display.firstAskedLabel}</span>
            <button
              type="button"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-outline-variant/60 px-2.5 font-label-md text-label-md font-semibold"
              onClick={() => void copyForSearch()}
            >
              <span className="material-symbols-outlined text-[16px]">content_copy</span>
              {copyButtonLabel}
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-space-lg overflow-y-auto bg-surface p-space-lg">
          {variant === "needs_review" && proposal ? (
            <div className="flex items-start gap-space-sm rounded-xl bg-amber-50 p-space-md shadow-sm">
              <span className="material-symbols-outlined mt-0.5 text-[20px] text-amber-700">warning</span>
              <p className="font-body-sm text-body-sm font-medium text-amber-900">
                Only one trusted catalogue confirmed this part. Check it and approve, or fix it.
              </p>
            </div>
          ) : null}
          {variant === "auto_added" && proposal ? (
            <div className="flex items-start gap-space-md rounded-xl bg-emerald-50 p-space-md text-emerald-900 shadow-sm">
              <span className="material-symbols-outlined text-[20px] text-emerald-600">done_all</span>
              <div>
                <p className="font-body-sm font-semibold text-emerald-950">Autonomous Catalog Ingestion</p>
                <p className="font-body-sm text-emerald-800">
                  Two trusted catalogues agreed, so Roam added this part on its own.
                </p>
              </div>
            </div>
          ) : null}

          {proposal ? (
            <section className="space-y-space-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-label-xs text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant">
                  {variant === "auto_added" ? "Added" : "Roam found"}
                </h3>
                <span className="font-mono-sm text-mono-sm text-on-surface-variant">1 active candidate</span>
              </div>
              <div className="relative space-y-space-md overflow-hidden rounded-xl bg-surface-container-lowest p-space-md shadow-md">
                <div className="absolute bottom-0 left-0 top-0 w-1 bg-primary-container" />
                <div className="pl-space-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono-lg text-mono-lg font-bold text-on-surface">
                        {proposal.brand} {proposal.partNumber}
                      </div>
                      <div className="font-body-sm text-body-sm text-on-surface-variant">{proposal.partName || display.partTitle}</div>
                    </div>
                    {proposal.matchType ? (
                      <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-mono-sm text-mono-sm font-semibold text-primary">
                        Made for your car
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 rounded-lg bg-surface-container-low px-space-sm py-1.5 font-mono-sm text-mono-sm text-on-surface-variant">
                    Fits: {formatFitsLine(vehicleBrief)}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {proposal.sources.slice(0, 4).map((s, i) => {
                      const ok = s.number_found && s.car_found && !s.dropped;
                      return (
                        <span
                          key={i}
                          className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-mono-sm text-mono-sm ${
                            ok ? "bg-emerald-50 text-emerald-800" : "bg-surface-container-high text-secondary"
                          }`}
                        >
                          {s.domain || "source"} {ok ? "✓" : "✗"}
                        </span>
                      );
                    })}
                  </div>
                  {proposal.sources[0]?.quote ? (
                    <div className="mt-2 rounded-lg bg-inverse-surface p-space-sm font-mono-sm text-[11px] leading-relaxed text-inverse-on-surface">
                      {proposal.sources[0].quote}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>
          ) : jobLoading ? (
            <div className="h-24 animate-pulse rounded-xl bg-surface-container" />
          ) : null}

          {checks ? (
            <section className="space-y-space-sm">
              <div className="flex items-center justify-between">
                <h3 className="font-label-xs text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant">Checks</h3>
                <span className="font-mono-sm text-mono-sm font-semibold text-emerald-700">
                  {checks.passed} of {checks.total} passed
                </span>
              </div>
              <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm">
                {checks.rows.map((row, i) => (
                  <div
                    key={row.label}
                    className={`flex items-center justify-between px-space-md py-2.5 ${i % 2 ? "bg-surface-container-low/50" : ""} ${!row.ok ? "bg-error-container/20" : ""}`}
                  >
                    <div className="flex items-center gap-2 font-body-sm text-body-sm">
                      <span className={`material-symbols-outlined text-[18px] ${row.ok ? "text-emerald-600" : "text-error"}`}>
                        {row.ok ? "check" : "close"}
                      </span>
                      {row.label}
                    </div>
                    <span className="font-mono-sm text-mono-sm text-on-surface-variant">{row.detail}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-space-sm">
            <h3 className="font-label-xs text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant">What they asked</h3>
            {detailLoading ? (
              <div className="h-16 animate-pulse rounded-xl bg-surface-container" />
            ) : (
              <div className="space-y-2 rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
                {(detail?.notes || []).length === 0 ? (
                  <p className="font-mono-sm text-mono-sm text-on-surface-variant">No custom notes submitted</p>
                ) : (
                  (detail?.notes || []).map((note, index) => (
                    <div key={note.id} className="rounded-lg bg-surface-container-low p-2 font-mono-sm text-mono-sm text-on-surface">
                      Note {index + 1}: {note.text?.trim() ? `"${note.text}"` : "—"}
                    </div>
                  ))
                )}
              </div>
            )}
          </section>

          <section className="space-y-space-sm">
            <h3 className="font-label-xs text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant">
              Already on file for this car
            </h3>
            {(detail?.onFile || []).length === 0 ? (
              <div className="rounded-xl bg-surface-container-lowest p-space-md shadow-sm">
                <p className="font-headline-md font-semibold text-on-surface">Nothing yet</p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  No {partPlain.toLowerCase()} on file for this car version yet.
                </p>
              </div>
            ) : (
              <ul className="rounded-xl border border-surface-variant bg-surface-container-lowest p-3">
                {(detail?.onFile || []).map((row, index) => (
                  <li key={`${row.partNumber}-${index}`} className="font-body-sm text-body-sm">
                    {row.brand} · {row.partNumber}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(stepBar.asked || stepBar.research) && (
            <section className="space-y-space-sm">
              <h3 className="font-label-xs text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant">History</h3>
              <div className="flex items-center justify-between rounded-lg bg-surface-container-low/50 p-2.5">
                {["Asked", "Research", "Confirmed", "Added"].map((label, idx) => {
                  const done =
                    (idx === 0 && stepBar.asked) ||
                    (idx === 1 && stepBar.research) ||
                    (idx === 2 && stepBar.confirmed) ||
                    (idx === 3 && stepBar.added);
                  return (
                    <React.Fragment key={label}>
                      <div className="flex flex-col items-center gap-1 text-center">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full font-mono-sm text-[10px] font-bold ${
                            done ? "bg-emerald-600 text-white" : "bg-slate-900 text-white"
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="font-mono-sm text-[10px] text-on-surface-variant">{label}</span>
                      </div>
                      {idx < 3 ? <span className="mx-1 h-0.5 flex-1 bg-emerald-600" /> : null}
                    </React.Fragment>
                  );
                })}
              </div>
              {stepBar.fleetsNotified != null ? (
                <p className="font-mono-sm text-mono-sm text-on-surface-variant">{stepBar.fleetsNotified} fleets notified</p>
              ) : null}
              <div className="space-y-1 font-mono-sm text-[11px] text-on-surface-variant">
                {history.map((h) => (
                  <div key={`${h.at}-${h.label}`}>{h.at ? new Date(h.at).toLocaleString("en-GB") : "—"} · {h.label}</div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="flex-none space-y-2 border-t border-surface-variant bg-surface-container-lowest p-space-lg">
          {variant === "needs_review" && proposal ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy || researchBusy}
                  className="h-10 rounded-xl border border-outline-variant font-label-md font-semibold text-on-surface-variant"
                  onClick={() => void onPatch({ action: "looking" })}
                >
                  Edit and add
                </button>
                <button
                  type="button"
                  disabled={busy || researchBusy}
                  className="h-10 rounded-xl bg-primary-container font-label-md font-semibold text-white"
                  onClick={() => void researchAct("looks-right", { proposalId: proposal.id })}
                >
                  Approve and add
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={busy || researchBusy}
                  className="h-10 rounded-xl border border-outline-variant font-label-md font-semibold text-on-surface-variant"
                  onClick={() => void researchAct("not-found")}
                >
                  {"Couldn't find it"}
                </button>
                <button
                  type="button"
                  disabled={busy || researchBusy}
                  className="h-10 rounded-xl border border-primary/30 font-label-md font-semibold text-primary"
                  onClick={() => void researchAct("looks-right", { proposalId: proposal.id })}
                >
                  Looks right
                </button>
              </div>
            </div>
          ) : variant === "auto_added" ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy || researchBusy}
                className="h-10 rounded-xl border border-outline-variant font-label-md font-semibold text-on-surface"
                onClick={() => void researchAct("undo")}
              >
                Undo
              </button>
              <button
                type="button"
                disabled={busy || researchBusy}
                className="h-10 rounded-xl bg-primary-container font-label-md font-semibold text-white"
                onClick={() => void researchAct("looks-right", { proposalId: proposal?.id })}
              >
                Looks right
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-2">
              <button
                type="button"
                disabled={busy}
                className="col-span-4 h-10 rounded-xl border border-outline-variant font-label-md font-semibold"
                onClick={() => void onPatch({ action: "cant_find" })}
              >
                Can&apos;t find it
              </button>
              <button
                type="button"
                disabled={busy}
                className="col-span-8 h-10 rounded-xl bg-primary-container font-label-md font-semibold text-white"
                onClick={() => void onPatch({ action: "looking" })}
              >
                Mark as looking
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
