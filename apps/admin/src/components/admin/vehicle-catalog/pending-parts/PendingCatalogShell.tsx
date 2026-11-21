// Stitch: docs/stitch/research-engine/pending_catalog_roam_dominion_admin_console (screen 1 header + tabs).
// Audit §4b: no invented "Ingestion engine / sync" status; the real Dominion sidebar and top bar are unchanged.
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useAuth } from "../../../auth/AuthContext";
import { researchApi } from "../../../../services/researchEngineService";
import { D_MUTED, D_TXT, DIcon, PartsButton, RE_PAGE } from "../../research-engine/ReKit";
import { ResearchNoticeBanners } from "../../research-engine/ResearchNoticeBanners";

export type PendingCatalogTabId = "vehicles" | "parts" | "conflicts" | "settings";

export function PendingCatalogShell({
  catalogTab,
  onTabChange,
  vehiclesCount,
  partsCount,
  conflictsCount,
  conflictsHeaderActions,
  onAfterRerun,
  onOpenSettings,
  onOpenTrustedSources,
  children,
}: {
  catalogTab: PendingCatalogTabId;
  onTabChange: (tab: PendingCatalogTabId) => void;
  vehiclesCount: number;
  partsCount: number;
  conflictsCount: number;
  /** @deprecated kept for callers; the new header shows no sync clock. */
  syncSeconds?: number;
  conflictsHeaderActions?: ReactNode;
  onRefreshVehicles?: () => void;
  vehiclesRefreshing?: boolean;
  onAfterRerun?: () => void;
  onOpenSettings?: () => void;
  onOpenTrustedSources?: () => void;
  children: ReactNode;
}) {
  const { session } = useAuth();
  const token = session?.access_token ?? "";
  const [busy, setBusy] = useState(false);

  async function exportCsv() {
    setBusy(true);
    try {
      await researchApi.exportCsv(token);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't export");
    } finally {
      setBusy(false);
    }
  }

  async function rerun() {
    setBusy(true);
    try {
      const r = await researchApi.reprocessQueued(token);
      toast.success(`${r.requeued} waiting ${r.requeued === 1 ? "job" : "jobs"} sent again`);
      onAfterRerun?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't re-run");
    } finally {
      setBusy(false);
    }
  }

  const tabs: Array<{ id: PendingCatalogTabId; label: string; count: number | null; red?: boolean }> = [
    { id: "parts", label: "Parts", count: partsCount },
    { id: "vehicles", label: "Vehicles", count: vehiclesCount },
    { id: "conflicts", label: "Auto-match conflicts", count: conflictsCount, red: true },
    { id: "settings", label: "Settings and health", count: null },
  ];

  return (
    <div className={`${RE_PAGE} flex w-full flex-col`}>
      <div className="mx-auto flex w-full max-w-[1120px] flex-col px-6 py-8">
        <div className="mb-6 flex flex-col gap-1">
          <nav aria-label="Breadcrumb" className={`flex items-center gap-2 text-[12px] font-medium ${D_MUTED}`}>
            <span>Vehicles</span>
            <DIcon name="chevron_right" className="text-[14px]" />
            <span className={`font-semibold ${D_TXT}`}>Pending catalog</span>
          </nav>
          <div className="mt-1 flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h1 className={`text-[26px] font-semibold leading-[34px] tracking-tight ${D_TXT}`}>Pending catalog</h1>
              <p className={`mt-0.5 text-[13px] ${D_MUTED}`}>What Roam is researching, and what needs you.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {catalogTab === "conflicts" && conflictsHeaderActions ? conflictsHeaderActions : null}
              {catalogTab !== "conflicts" ? (
                <>
                  <PartsButton variant="secondary" className="!min-h-[40px]" disabled={busy} onClick={() => void exportCsv()} data-testid="export-csv">
                    <DIcon name="download" className="text-[18px]" /> Export CSV
                  </PartsButton>
                  <PartsButton variant="secondary" className="!min-h-[40px]" disabled={busy} onClick={() => void rerun()} data-testid="rerun-waiting">
                    <DIcon name="sync" className="text-[18px] text-[#0153dc]" /> Re-run waiting jobs (up to 50)
                  </PartsButton>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <ResearchNoticeBanners onOpenSettings={onOpenSettings ?? (() => onTabChange("settings"))} onOpenTrustedSources={onOpenTrustedSources} />

        <div
          className="mb-6 flex items-center gap-4 overflow-x-auto rounded-xl border border-[#e6e7ee] bg-white px-4 py-1 shadow-sm dark:border-[#1e293b] dark:bg-[#111a2e]"
          role="tablist"
        >
          {tabs.map((t) => {
            const active = catalogTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                data-testid={`pending-tab-${t.id}`}
                onClick={() => onTabChange(t.id)}
                className={`relative flex items-center gap-2 whitespace-nowrap px-2 py-3 text-[13px] font-medium transition-colors ${
                  active ? "font-semibold text-[#0153dc] dark:text-[#93b4ff]" : `${D_MUTED} hover:text-[#30323b] dark:hover:text-[#e2e8f0]`
                }`}
              >
                <span>{t.label}</span>
                {t.count != null ? (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                      t.red && t.count > 0
                        ? "bg-[#fdecec] text-[#a83836] dark:bg-[#450a0a] dark:text-[#f87171]"
                        : active
                          ? "bg-[#dbe1ff] text-[#0153dc] dark:bg-[#1e3a8a]/50 dark:text-[#93b4ff]"
                          : "bg-[#ededf9] text-[#5d5f68] dark:bg-[#1e293b] dark:text-[#94a3b8]"
                    }`}
                  >
                    {t.count.toLocaleString("en-GB")}
                  </span>
                ) : null}
                {active ? <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#0153dc]" /> : null}
              </button>
            );
          })}
        </div>

        {children}
      </div>
    </div>
  );
}
