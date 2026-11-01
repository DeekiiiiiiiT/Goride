// Stitch: dominion-redesign/pending_catalog_vehicles_tab_car_version_review_drawer
import React, { useEffect, useMemo, useState } from "react";
import type { VehicleCatalogPendingRequest } from "../../../../types/vehicleCatalogPending";
import {
  fetchCatalogResearchJob,
  fetchCatalogResearchJobs,
} from "../../../../services/pendingPartsCatalogService";
import {
  buildVehicleProposalFields,
  firstSourceExcerpt,
  scanPayloadForPii,
  vehicleResearchGroupKey,
  vehicleSourcesAgreeLabel,
} from "./pendingCatalogViewModels";

type Props = {
  open: boolean;
  accessToken: string;
  row: VehicleCatalogPendingRequest | null;
  marketFilter: string;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  busy?: boolean;
};

export function PendingVehicleReviewDrawer({
  open,
  accessToken,
  row,
  marketFilter,
  onClose,
  onApprove,
  onReject,
  busy,
}: Props) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(null);
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const jobs = await fetchCatalogResearchJobs(accessToken);
        const key = vehicleResearchGroupKey(row);
        const match = jobs.find((j) => j.groupKey === key && j.state !== "failed");
        if (!match) {
          if (!cancelled) {
            setJobId(null);
            setProposal(null);
            setEvents([]);
          }
          return;
        }
        const detail = await fetchCatalogResearchJob(accessToken, match.jobId);
        if (cancelled) return;
        setJobId(match.jobId);
        setProposal((detail.vehicleProposals?.[0] as Record<string, unknown>) ?? null);
        setEvents((detail.events || []) as Array<Record<string, unknown>>);
      } catch {
        if (!cancelled) {
          setJobId(null);
          setProposal(null);
          setEvents([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, row, accessToken]);

  const specFields = useMemo(
    () => buildVehicleProposalFields(proposal, marketFilter === "all" ? null : marketFilter),
    [proposal, marketFilter],
  );

  const sources = (Array.isArray(proposal?.sources) ? proposal?.sources : []) as Array<{
    domain?: string;
    quote?: string;
    url?: string;
    dropped?: boolean;
  }>;

  const excerpt = firstSourceExcerpt(sources);
  const piiScan = useMemo(() => {
    if (!row) return { clean: true, findings: [] as string[] };
    const blob = JSON.stringify({
      notes: row.info_request_message,
      ocr: row.ocr_snapshot,
      make: row.proposed_make,
      model: row.proposed_model,
    });
    return scanPayloadForPii(blob);
  }, [row]);

  if (!open || !row) return null;

  const headline = `${row.proposed_make} ${row.proposed_model} ${row.proposed_production_start_year}${row.proposed_production_end_year ? `–${row.proposed_production_end_year}` : ""}`;

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-[#090d16]/40 backdrop-blur-[2px]" aria-label="Close" onClick={onClose} />
      <aside className="fixed top-0 right-0 z-50 flex h-screen w-full max-w-[560px] flex-col overflow-hidden border-l border-surface-variant bg-surface-container-lowest shadow-2xl">
        <div className="flex-none border-b border-surface-variant p-space-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-mono-sm text-mono-sm font-semibold uppercase tracking-wider text-on-surface-variant">
              VEHICLE REQUEST #{row.id.slice(0, 8).toUpperCase()}
            </span>
            <button type="button" className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container" onClick={onClose}>
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
          <h2 className="font-headline-xl text-headline-xl font-bold text-on-surface">{headline}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded bg-surface-container px-2 py-0.5 font-mono-sm text-label-xs font-medium text-on-surface hover:bg-surface-container-high"
              onClick={() => {
                const q = [row.proposed_make, row.proposed_model, proposal?.chassis_code].filter(Boolean).join(" ");
                void navigator.clipboard.writeText(q);
              }}
            >
              <span className="material-symbols-outlined text-[13px]">content_copy</span>
              Copy for search
            </button>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant">from {row.source}</p>
        </div>

        <div className="flex-1 space-y-space-lg overflow-y-auto p-space-lg">
          <div className="flex items-start gap-space-md rounded-lg bg-surface-container-low p-space-md">
            <span className="material-symbols-outlined text-primary">verified_user</span>
            <div>
              <p className="font-label-md font-semibold text-on-surface">Strict Dominion Catalog Policy</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Cars are never added automatically. Check what Roam found and approve. Once confirmed, this version becomes the canonical anchor for parts search.
              </p>
            </div>
          </div>

          <section className="space-y-space-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-label-md font-bold uppercase tracking-wide text-on-surface">Roam found</h3>
              <span className="font-mono-sm text-primary">{vehicleSourcesAgreeLabel(sources)}</span>
            </div>
            {loading ? (
              <div className="h-24 animate-pulse rounded-xl bg-surface-container" />
            ) : specFields.length === 0 ? (
              <p className="font-body-sm text-on-surface-variant">No verified proposal yet{jobId ? "" : " — research not linked"}.</p>
            ) : (
              <div className="grid grid-cols-2 gap-space-xs rounded-lg bg-surface-container-lowest p-space-sm shadow-sm">
                {specFields.map((field) => (
                  <div key={field.key} className="flex items-center justify-between rounded bg-surface-container-low p-space-sm">
                    <div>
                      <span className="font-label-xs uppercase text-on-surface-variant">{field.label}</span>
                      <span className="block font-mono-md font-semibold text-on-surface">{field.value}</span>
                    </div>
                    {field.sourceDomain ? (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono-sm text-[10px] text-primary">
                        {field.sourceDomain} ✓
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            {excerpt?.quote ? (
              <details className="rounded-lg bg-surface-container-lowest p-space-md shadow-sm">
                <summary className="cursor-pointer font-label-md font-semibold text-on-surface">
                  Catalogue Raw Excerpt ({excerpt.domain})
                </summary>
                <pre className="mt-space-md whitespace-pre-wrap rounded bg-surface-container-low p-space-md font-mono-sm text-[11px] leading-relaxed text-on-surface-variant">
                  {excerpt.quote}
                </pre>
                {excerpt.url ? (
                  <a className="mt-2 inline-flex items-center gap-1 font-mono-sm text-primary hover:underline" href={excerpt.url} target="_blank" rel="noreferrer">
                    Open page
                    <span className="material-symbols-outlined text-[13px]">north_east</span>
                  </a>
                ) : null}
              </details>
            ) : null}
          </section>

          <section className="space-y-space-sm">
            <h3 className="font-label-md font-bold uppercase tracking-wide text-on-surface">Audit Checks</h3>
            <div className="space-y-1 rounded-lg bg-surface-container-lowest p-space-sm shadow-sm">
              <div className="flex items-start gap-2 p-space-xs">
                <span className="material-symbols-outlined text-[#006e31]">check_circle</span>
                <span className="font-body-sm text-body-sm">
                  Chassis code verified — <span className="font-mono-sm font-semibold">{String(proposal?.chassis_code || row.proposed_full_model_code || "—")}</span>
                </span>
              </div>
              <div className="flex items-start gap-2 p-space-xs">
                <span className="material-symbols-outlined text-[#006e31]">check_circle</span>
                <span className="font-body-sm text-body-sm">
                  Engine code verified — <span className="font-mono-sm font-semibold">{String(proposal?.engine_code || row.proposed_engine_code || "—")}</span>
                </span>
              </div>
              <div className="flex items-start gap-2 p-space-xs">
                <span className={`material-symbols-outlined ${piiScan.clean ? "text-[#006e31]" : "text-error"}`}>
                  {piiScan.clean ? "check_circle" : "error"}
                </span>
                <span className="font-body-sm text-body-sm">
                  {piiScan.clean
                    ? "Zero customer PII or fleet identifiers in specification payload"
                    : `Possible PII patterns: ${piiScan.findings.join(", ")}`}
                </span>
              </div>
            </div>
          </section>

          {events.length > 0 ? (
            <section className="space-y-space-sm">
              <h3 className="font-label-md font-bold uppercase tracking-wide text-on-surface">Audit timeline</h3>
              <div className="space-y-2 rounded-lg bg-surface-container-lowest p-space-md font-mono-sm text-[12px] shadow-sm">
                {events.slice(-6).map((ev) => (
                  <div key={String(ev.id || ev.at)} className="flex justify-between text-on-surface-variant">
                    <span>{ev.at ? new Date(String(ev.at)).toLocaleString("en-GB") : "—"}</span>
                    <span className="text-on-surface">
                      {String(ev.step || "")} · {String(ev.outcome || "")}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex-none space-y-2 border-t border-surface-variant p-space-lg">
          <div className="flex items-center justify-between gap-space-md">
            <button
              type="button"
              className="h-9 rounded bg-surface-container-high px-space-md font-label-md text-on-surface"
              disabled={busy}
              onClick={onReject}
            >
              {"Couldn't find it"}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 rounded bg-primary-container px-space-lg font-label-md font-semibold text-white shadow"
              disabled={busy}
              onClick={onApprove}
            >
              <span className="material-symbols-outlined text-[17px]">add_circle</span>
              Approve and open Add vehicle
            </button>
          </div>
          <p className="font-body-sm text-[12px] text-on-surface-variant">
            When you approve and add this car version, every fleet that asked sees it in search and can request parts against it.
          </p>
        </div>
      </aside>
    </>
  );
}
