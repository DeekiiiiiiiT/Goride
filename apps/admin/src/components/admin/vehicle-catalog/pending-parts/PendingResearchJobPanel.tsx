import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  fetchCatalogResearchJob,
  postCatalogResearchJobAction,
  type CatalogResearchJobDetail,
} from "../../../../services/pendingPartsCatalogService";

type PendingResearchJobPanelProps = {
  accessToken: string;
  jobId: string | null | undefined;
  /** When set, the parent owns fetch (e.g. request drawer) — avoids duplicate API calls. */
  jobDetail?: CatalogResearchJobDetail | null;
  jobDetailLoading?: boolean;
  onJobDetailReload?: () => Promise<void>;
};

export function PendingResearchJobPanel({
  accessToken,
  jobId,
  jobDetail: externalDetail,
  jobDetailLoading = false,
  onJobDetailReload,
}: PendingResearchJobPanelProps) {
  const [detail, setDetail] = useState<CatalogResearchJobDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editSourceUrl, setEditSourceUrl] = useState("");

  const usesExternal = onJobDetailReload !== undefined;
  const shownDetail = usesExternal ? (externalDetail ?? null) : detail;
  const shownLoading = usesExternal ? jobDetailLoading : loading;

  const reload = useCallback(async () => {
    if (!jobId) {
      if (!usesExternal) setDetail(null);
      return;
    }
    if (usesExternal) {
      await onJobDetailReload();
      return;
    }
    setLoading(true);
    try {
      setDetail(await fetchCatalogResearchJob(accessToken, jobId));
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [accessToken, jobId, onJobDetailReload, usesExternal]);

  useEffect(() => {
    if (usesExternal) return;
    void reload();
  }, [reload, usesExternal]);

  if (!jobId) return null;

  const job = shownDetail?.job;
  const proposal = (shownDetail?.proposals || [])[0];
  const checks = (proposal?.checks || {}) as Record<string, unknown>;
  const shadowWouldAuto = checks.shadowWouldAuto === true;

  async function act(action: string, body?: Record<string, unknown>) {
    if (!jobId) return;
    setBusy(true);
    try {
      await postCatalogResearchJobAction(accessToken, jobId, action, body);
      toast.success("Research updated");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update research");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-space-sm rounded-xl border border-outline-variant/40 bg-surface-container-low p-space-md">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 font-label-xs text-label-xs font-semibold uppercase tracking-wider text-on-surface-variant">
          <span className="material-symbols-outlined text-[14px]">smart_toy</span>
          Catalog research
        </span>
        {job ? (
          <span className="rounded-full bg-surface-container px-2 py-0.5 font-mono-sm text-[10px] font-semibold text-on-surface">
            {String(job.state || "—")}
          </span>
        ) : null}
      </div>
      {shownLoading ? (
        <div className="h-16 animate-pulse rounded-lg bg-surface-container" />
      ) : !job ? (
        <p className="font-body-sm text-body-sm text-on-surface-variant">No research job linked yet.</p>
      ) : (
        <>
          {proposal ? (
            <div className="space-y-2 rounded-lg border border-surface-variant bg-surface-container-lowest p-3">
              <div className="font-body-sm text-body-sm font-semibold text-on-surface">
                {proposal.part_number || "—"} · {proposal.brand || "—"}
              </div>
              <div className="font-caption text-caption text-on-surface-variant">
                Route: {String(proposal.route || "—")}
                {shadowWouldAuto ? " · would auto-add in live mode" : ""}
              </div>
              <ul className="max-h-24 overflow-y-auto font-mono-sm text-[10px] text-on-surface-variant">
                {(proposal.sources || []).slice(0, 5).map((s, i) => (
                  <li key={i} className="truncate">
                    {(s as { url?: string }).url || "—"}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="font-body-sm text-body-sm text-on-surface-variant">No proposal yet — queued or researching.</p>
          )}
          {(shownDetail?.events || []).length > 0 ? (
            <div className="max-h-28 overflow-y-auto font-mono-sm text-[10px] text-on-surface-variant">
              {(shownDetail?.events || []).slice(-6).map((ev) => (
                <div key={String(ev.id || ev.at)}>
                  {String(ev.step || "")} · {String(ev.outcome || "")}
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              disabled={busy || !proposal}
              className="rounded-lg bg-primary-container px-3 py-1.5 font-label-md text-label-md font-semibold text-white disabled:opacity-50"
              onClick={() => void act("looks-right", { proposalId: proposal.id })}
            >
              Looks right
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-outline-variant px-3 py-1.5 font-label-md text-label-md font-semibold text-on-surface disabled:opacity-50"
              onClick={() => void act("research-next")}
            >
              Research next
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-outline-variant px-3 py-1.5 font-label-md text-label-md font-semibold text-on-surface disabled:opacity-50"
              onClick={() => void act("undo")}
            >
              Undo auto-add
            </button>
            <button
              type="button"
              disabled={busy}
              className="rounded-lg border border-error/40 px-3 py-1.5 font-label-md text-label-md font-semibold text-error disabled:opacity-50"
              onClick={() => void act("not-found")}
            >
              Couldn&apos;t find it
            </button>
          </div>
          {proposal ? (
            <div className="flex flex-col gap-1 pt-1">
              <input
                className="rounded-lg border border-surface-variant bg-surface px-2 py-1 font-body-sm text-body-sm"
                placeholder="Source URL (required to edit and add)"
                value={editSourceUrl}
                onChange={(e) => setEditSourceUrl(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !editSourceUrl.trim()}
                className="self-start rounded-lg bg-surface-container-high px-3 py-1.5 font-label-md text-label-md font-semibold text-on-surface disabled:opacity-50"
                onClick={() =>
                  void act("edit-and-add", {
                    sourceUrl: editSourceUrl.trim(),
                    partNumber: proposal.part_number,
                    brand: proposal.brand,
                    partName: proposal.part_name,
                  })
                }
              >
                Edit and add
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
