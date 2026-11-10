import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthContext";
import { listVehicleCatalog } from "../../../services/vehicleCatalogService";
import type { MaintenanceServiceCategory } from "../../../types/maintenance";
import type { VehicleCatalogRecord } from "../../../types/vehicleCatalog";
import "./maintenanceMasterTheme.css";
import {
  createMaintenanceRule,
  fetchAllMaintenanceCategories,
  fetchGlobalPackages,
  fetchMaintenanceGovernanceFlag,
  fetchMaintenanceHistory,
  fetchMaintenanceRules,
  fetchMaintenanceSummary,
  fetchPartSchedulesIndex,
  fetchPreviewSchedule,
  fetchReviewList,
  historyExportUrl,
  patchMaintenanceRule,
  retireBothConflictRules,
  approveProposal,
  rejectProposal,
  retireMaintenanceRule,
  resolveConflict,
  downloadCsv,
  type MaintenanceRule,
  type MaintenanceSummary,
  type PartScheduleIndexRow,
  type PreviewScheduleResponse,
} from "./maintenanceMasterApi";
import { MaintenanceMasterImpactDialog } from "./MaintenanceMasterImpactDialog";
import { MaintenanceMasterPackageDrawer } from "./MaintenanceMasterPackageDrawer";
import { MaintenanceMasterPreviewPanel } from "./MaintenanceMasterPreviewPanel";
import { MaintenanceMasterScheduleDrawer, SAVE_ERROR } from "./MaintenanceMasterScheduleDrawer";
import { NIGHTLY_COPY } from "./maintenanceMasterFormat";
import { HistoryTab } from "./HistoryTab";
import { PackagesTab } from "./PackagesTab";
import { PartScheduleLadderView } from "./PartScheduleLadderView";
import { PartSchedulesTab } from "./PartSchedulesTab";
import { JobsTab } from "./jobs/JobsTab";
import { ReviewTab } from "./ReviewTab";

type Tab = "schedules" | "packages" | "jobs" | "review" | "history";

const WRITE_ROLES = new Set(["platform_owner", "platform_support", "platform_catalog_editor"]);

export function MaintenanceMasterPage() {
  const { session, role } = useAuth();
  const token = session?.access_token ?? "";
  const canWrite = WRITE_ROLES.has(String(role ?? ""));
  const analystReadOnly = role === "platform_analyst";

  const [tab, setTab] = useState<Tab>("schedules");
  const [governanceOn, setGovernanceOn] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<MaintenanceSummary | null>(null);
  const [rules, setRules] = useState<MaintenanceRule[]>([]);
  const [indexRows, setIndexRows] = useState<PartScheduleIndexRow[]>([]);
  const [packages, setPackages] = useState<Record<string, unknown>[]>([]);
  const [categories, setCategories] = useState<MaintenanceServiceCategory[]>([]);
  const [catalog, setCatalog] = useState<VehicleCatalogRecord[]>([]);
  const [review, setReview] = useState<{ conflicts: Record<string, unknown>[]; proposals: Record<string, unknown>[] }>({
    conflicts: [],
    proposals: [],
  });
  const [history, setHistory] = useState<Record<string, unknown>[]>([]);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [detailComponentId, setDetailComponentId] = useState<string | null>(null);
  const [drawerScopePreset, setDrawerScopePreset] = useState<string | undefined>();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<MaintenanceRule | null>(null);
  const [drawerComponentPreset, setDrawerComponentPreset] = useState<string | undefined>();
  const [packageDrawerOpen, setPackageDrawerOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<Record<string, unknown> | null>(null);

  const [impactOpen, setImpactOpen] = useState(false);
  const [impactMode, setImpactMode] = useState<"confirm" | "draft_preview">("confirm");
  const [impactBeforeAfter, setImpactBeforeAfter] = useState<{
    before_km: number | null;
    before_months: number | null;
    after_km: number | null;
    after_months: number | null;
  } | null>(null);
  const [impactBusy, setImpactBusy] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<Record<string, unknown> | null>(null);
  const [pendingRuleId, setPendingRuleId] = useState<string | null>(null);


  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewCatalogId, setPreviewCatalogId] = useState("");
  const [previewSevere, setPreviewSevere] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewScheduleResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!token) return;
    setLoadError("");
    try {
      const [flag, sum, ruleList, idx, pkgList, cats, catList, rev, hist] = await Promise.all([
        fetchMaintenanceGovernanceFlag(token),
        fetchMaintenanceSummary(token).catch(() => null),
        fetchMaintenanceRules(token),
        fetchPartSchedulesIndex(token),
        fetchGlobalPackages(token),
        fetchAllMaintenanceCategories(token),
        listVehicleCatalog(token),
        fetchReviewList(token),
        fetchMaintenanceHistory(token),
      ]);
      setGovernanceOn(flag);
      setSummary(sum);
      setRules(ruleList);
      setIndexRows(idx);
      setPackages(pkgList);
      setCategories(cats as unknown as MaintenanceServiceCategory[]);
      setCatalog(catList.items);
      setReview(rev);
      setHistory(hist);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : "Could not load maintenance master");
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const partRulesByComponent = useMemo(() => {
    const map = new Map<string, MaintenanceRule>();
    for (const r of rules) {
      if (r.status !== "active") continue;
      const cid = String(r.component_id ?? "");
      if (!cid) continue;
      const existing = map.get(cid);
      if (!existing || String(r.template_scope) === "global") {
        if (String(r.template_scope) === "global" || !existing) map.set(cid, r);
      }
    }
    for (const r of rules) {
      if (r.status === "active" && String(r.template_scope) !== "global") {
        const cid = String(r.component_id ?? "");
        if (cid) map.set(cid, r);
      }
    }
    return map;
  }, [rules]);

  const indexByComponent = useMemo(() => {
    const m = new Map<string, PartScheduleIndexRow>();
    for (const r of indexRows) m.set(r.component_id, r);
    return m;
  }, [indexRows]);

  const reviewBadge = review.conflicts.length + review.proposals.length;

  // Dominion never counts Roam Fleet cars: the box only shows the schedule before → after.
  const openImpactForRule = async (ruleId: string, draftPreview: boolean) => {
    if (!token) return;
    setImpactMode(draftPreview ? "draft_preview" : "confirm");
    setPendingRuleId(ruleId);
    setPendingPayload(null);
    setImpactOpen(true);
  };

  const handleRequestImpact = async (payload: Record<string, unknown>, mode: "draft" | "active") => {
    if (!token) return;
    setPendingPayload(payload);
    const ruleId = String(payload.id ?? editingRule?.id ?? "");
    setPendingRuleId(ruleId || null);
    const afterKm = payload.interval_km != null && payload.interval_km !== "" ? Number(payload.interval_km) : null;
    const afterMo =
      payload.interval_months != null && payload.interval_months !== "" ? Number(payload.interval_months) : null;
    const beforeKm =
      editingRule?.interval_km != null ? Number(editingRule.interval_km) : null;
    const beforeMo =
      editingRule?.interval_months != null ? Number(editingRule.interval_months) : null;
    setImpactBeforeAfter({
      before_km: beforeKm,
      before_months: beforeMo,
      after_km: afterKm,
      after_months: afterMo,
    });
    if (mode === "draft") {
      if (ruleId) await openImpactForRule(ruleId, true);
      else {
        setImpactMode("draft_preview");
        setImpactOpen(true);
      }
      return;
    }
    setImpactMode("confirm");
    setImpactOpen(true);
  };

  const confirmImpactSave = async () => {
    if (!token || !pendingPayload) return;
    setImpactBusy(true);
    try {
      const id = pendingRuleId || String(pendingPayload.id ?? "");
      if (id && id.length > 8) {
        await patchMaintenanceRule(token, id, { ...pendingPayload, status: "active" });
      } else {
        await createMaintenanceRule(token, { ...pendingPayload, status: "active" });
      }
      toast.success("Schedule saved. Apps pick it up tonight.", { duration: 8000 });
      setImpactOpen(false);
      setDrawerOpen(false);
      setPendingPayload(null);
      await reload();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : SAVE_ERROR);
    } finally {
      setImpactBusy(false);
    }
  };

  const loadPreview = async (catalogId: string, severe = previewSevere) => {
    if (!token || !catalogId) return;
    setPreviewCatalogId(catalogId);
    setPreviewLoading(true);
    try {
      const data = await fetchPreviewSchedule(token, catalogId, severe);
      setPreviewData(data);
      setPreviewOpen(true);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };


  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "schedules", label: "Part schedules" },
    { id: "packages", label: "Service packages" },
    { id: "jobs", label: "Jobs" },
    { id: "review", label: "Review list", badge: reviewBadge || summary?.reviewCount },
    { id: "history", label: "History" },
  ];

  if (!token) {
    return <p className="p-8 text-sm text-on-surface-variant">Sign in to manage maintenance templates.</p>;
  }

  if (governanceOn === false) {
    return (
      <div className="maintenance-master-stitch p-8">
        <p className="text-sm text-on-surface-variant">
          Maintenance master governance is off. Turn on the flag to use this screen.
        </p>
      </div>
    );
  }

  const detailCategory = detailComponentId
    ? categories.find((c) => c.id === detailComponentId && c.kind === "component")
    : null;

  return (
    <div
      className="maintenance-master-stitch font-body text-on-surface antialiased bg-surface-container-low w-full px-4 py-6 md:px-8 md:py-8 min-h-[70vh]"
    >
      <nav className="font-code text-[11px] uppercase tracking-widest text-on-surface-variant">
        DOMINION › MASTER DATA › VEHICLES › MAINTENANCE TEMPLATES
      </nav>
      <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-headline text-headline-lg text-on-surface">Maintenance templates</h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            How often each part is serviced, for which cars, and why.
          </p>
        </div>
      </div>

      {analystReadOnly ? (
        <p className="mt-4 rounded-lg border border-secondary-container bg-secondary-container/40 px-3 py-2 text-sm text-on-secondary-container">
          You can look but not change schedules.
        </p>
      ) : null}

      {loadError ? (
        <p className="mt-4 rounded-lg bg-error-container/20 px-3 py-2 text-sm text-error">{loadError}</p>
      ) : null}

      {!detailCategory ? (
        <div className="mt-6 flex flex-wrap gap-4 border-b border-outline-variant/30">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`relative pb-3 text-sm font-medium ${
                tab === t.id ? "text-secondary border-b-2 border-secondary" : "text-on-surface-variant"
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.badge != null && t.badge > 0 ? (
                <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}

      {detailCategory ? (
        <PartScheduleLadderView
          category={detailCategory}
          indexRow={indexByComponent.get(detailCategory.id) ?? null}
          rules={rules}
          readOnly={analystReadOnly}
          canWrite={canWrite && !analystReadOnly}
          onBack={() => setDetailComponentId(null)}
          onAddForScope={(scope) => {
            setEditingRule(null);
            setDrawerComponentPreset(detailCategory.id);
            setDrawerScopePreset(scope);
            setDrawerOpen(true);
          }}
          onEditRule={(rule) => {
            setEditingRule(rule);
            setDrawerOpen(true);
          }}
          onRetireRule={(ruleId) => {
            if (!token) return;
            void retireMaintenanceRule(token, ruleId)
              .then(() => reload())
              .catch((e: Error) => toast.error(e.message));
          }}
        />
      ) : null}

      {!detailCategory && tab === "schedules" ? (
        <>
          <PartSchedulesTab
            summary={summary}
            indexRows={indexRows}
            categories={categories}
            search={search}
            onSearch={setSearch}
            sourceFilter={sourceFilter}
            onSourceFilter={setSourceFilter}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            scopeFilter={scopeFilter}
            onScopeFilter={setScopeFilter}
            bannerDismissed={bannerDismissed}
            onDismissBanner={() => setBannerDismissed(true)}
            onOpenPart={(id) => setDetailComponentId(id)}
            onPreviewCar={() => {
              const first = catalog[0]?.id;
              if (first) void loadPreview(first);
              else setPreviewOpen(true);
            }}
            onAddSchedule={() => {
              setEditingRule(null);
              setDrawerComponentPreset(undefined);
              setDrawerOpen(true);
            }}
            canWrite={canWrite && !analystReadOnly}
          />
          <div className="md:hidden space-y-3 mt-6">
            <p className="text-sm text-on-surface-variant">Read-only on phone — edit on a larger screen.</p>
          </div>
        </>
      ) : null}

      {!detailCategory && tab === "packages" ? (
        <PackagesTab
          token={token}
          packages={packages as Parameters<typeof PackagesTab>[0]["packages"]}
          partRulesByComponent={partRulesByComponent}
          canWrite={canWrite && !analystReadOnly}
          onEditPackage={(pkg) => {
            setEditingPackage(pkg);
            setPackageDrawerOpen(true);
          }}
        />
      ) : null}

      {!detailCategory && tab === "jobs" ? (
        <JobsTab token={token} canWrite={canWrite && !analystReadOnly} />
      ) : null}

      {!detailCategory && tab === "review" ? (
        <ReviewTab
          conflicts={review.conflicts}
          proposals={review.proposals}
          rules={rules}
          canWrite={canWrite && !analystReadOnly}
          onKeep={(id, ruleId) => void resolveConflict(token, id, ruleId).then(() => reload())}
          onRetireBoth={(id) => void retireBothConflictRules(token, id).then(() => reload())}
          onApprove={async (id) => {
            try {
              await approveProposal(token, id);
              toast.success("Approved and applied");
              await reload();
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : "Couldn't approve");
            }
          }}
          onReject={async (id, note) => {
            try {
              await rejectProposal(token, id, note);
              toast.success("Request rejected");
              await reload();
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : "Couldn't reject");
            }
          }}
        />
      ) : null}

      {!detailCategory && tab === "history" ? (
        <HistoryTab
          token={token}
          onExport={() => void downloadCsv(historyExportUrl(token), token, "maintenance-history.csv")}
        />
      ) : null}

      <MaintenanceMasterScheduleDrawer
        open={drawerOpen}
        token={token}
        canWrite={canWrite && !analystReadOnly}
        rule={editingRule}
        categories={categories.filter((c) => c.kind === "component")}
        catalog={catalog}
        presetComponentId={drawerComponentPreset}
        presetScope={drawerScopePreset}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerScopePreset(undefined);
          setDrawerComponentPreset(undefined);
        }}
        onSaved={() => void reload()}
        onRequestImpact={(payload, mode) => void handleRequestImpact(payload, mode)}
        onStarterLoaded={() => void reload()}
      />

      <MaintenanceMasterPackageDrawer
        open={packageDrawerOpen}
        token={token}
        canWrite={canWrite && !analystReadOnly}
        pkg={editingPackage as { id: string; task_name: string } | null}
        categories={categories.filter((c) => c.kind === "component")}
        partRulesByComponent={partRulesByComponent}
        onClose={() => setPackageDrawerOpen(false)}
        onSaved={() => void reload()}
      />

      <MaintenanceMasterImpactDialog
        open={impactOpen}
        mode={impactMode}
        beforeAfter={impactBeforeAfter}
        onClose={() => setImpactOpen(false)}
        onConfirm={impactMode === "confirm" ? () => void confirmImpactSave() : undefined}
        busy={impactBusy}
        supportProposal={role === "platform_support"}
      />

      <MaintenanceMasterPreviewPanel
        open={previewOpen}
        token={token}
        catalog={catalog}
        preview={previewData}
        catalogId={previewCatalogId}
        severe={previewSevere}
        loading={previewLoading}
        onClose={() => setPreviewOpen(false)}
        onSelectCar={(id) => void loadPreview(id, previewSevere)}
        onToggleSevere={(v) => {
          setPreviewSevere(v);
          if (previewCatalogId) void loadPreview(previewCatalogId, v);
        }}
      />
    </div>
  );
}
