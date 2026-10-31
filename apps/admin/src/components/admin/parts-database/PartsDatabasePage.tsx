// Stitch: dominion-redesign/S42l
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "../../auth/AuthContext";
import { AddPartDialog } from "./AddPartDialog";
import { FindPartsTab } from "./FindPartsTab";
import { FindPartsChrome } from "./find-parts/FindPartsChrome";
import { FullDatabaseTab } from "./full-database/FullDatabaseTab";
import { ImportAdvancedTab } from "./ImportAdvancedTab";
import { exportMasterCsv, fetchPartsOverview } from "./partsDatabaseApi";
import {
  goDominionPage,
  readCatalogFilters,
  readCatalogTab,
  writeCatalogSearch,
  type CatalogSectionTab,
  type CatalogTab,
} from "./partsCatalogUrl";
import "./partsDatabase.css";

export function PartsDatabasePage() {
  const { role } = useAuth();
  const owner = role === "platform_owner";
  const [tab, setTab] = useState<CatalogTab>(readCatalogTab);
  const [variantId, setVariantId] = useState(() => new URLSearchParams(window.location.search).get("variant") ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"job" | "any">("job");
  const [editGroup, setEditGroup] = useState<string | null>(null);
  const [problemsOpen, setProblemsOpen] = useState(false);
  const overview = useQuery({ queryKey: ["parts-overview"], queryFn: fetchPartsOverview, retry: false });

  useEffect(() => {
    function sync() {
      const params = new URLSearchParams(window.location.search);
      const raw = params.get("tab");
      if (raw === "vehicle" || raw === "sisters" || raw === "universal") {
        writeCatalogSearch({ tab: "Full database" }, "replace");
      }
      if (raw === "verify") {
        writeCatalogSearch({ tab: "Full database", status: "needs_checking" }, "replace");
      }
      setTab(readCatalogTab());
      setVariantId(new URLSearchParams(window.location.search).get("variant") ?? "");
    }
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function selectTab(next: CatalogTab) {
    setTab(next);
    if (next !== "Advanced") setProblemsOpen(false);
    writeCatalogSearch({
      tab: next,
      ...(next === "Full database" ? { variant: null, make: null, model: null, year: null } : {}),
    }, "push");
  }

  async function exportCsv() {
    const filters = readCatalogFilters();
    try {
      const { csv } = await exportMasterCsv(filters);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "parts-database.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export");
    }
  }

  function openDatabase(id: string) {
    setVariantId(id);
    setTab("Full database");
    setProblemsOpen(false);
    writeCatalogSearch({ tab: "Full database", variant: id, make: null, model: null, year: null }, "push");
  }

  const sectionTab: CatalogSectionTab | null = tab === "Advanced" ? null : tab;
  const matchTypesLabel = typeof overview.data?.matchTypesOff === "boolean"
    ? (overview.data.matchTypesOff ? "Match types off" : "Match types on")
    : "—";
  const breadcrumbSuffix: Array<"ADVANCED TUNE" | "PROBLEMS"> = tab === "Advanced"
    ? (problemsOpen ? ["ADVANCED TUNE", "PROBLEMS"] : ["ADVANCED TUNE"])
    : [];

  return (
    <div className="parts-database-stitch flex flex-col w-full">
      <FindPartsChrome
        fitmentCount={overview.data?.fitmentsOnFile ?? null}
        matchTypesLabel={matchTypesLabel}
        activeTab={sectionTab}
        advancedActive={tab === "Advanced"}
        breadcrumbSuffix={breadcrumbSuffix}
        onTab={selectTab}
        onAdvanced={() => selectTab("Advanced")}
        onAddPart={() => { setEditGroup(null); setDialogMode(variantId ? "job" : "any"); setDialogOpen(true); }}
        onImport={() => selectTab("Import")}
        onExport={() => { void exportCsv(); }}
        owner={owner}
        onNavigateDominion={() => goDominionPage("dashboard")}
        onNavigateVehicles={() => goDominionPage("vehicles-home")}
      >
        {tab === "Find parts" ? (
          <FindPartsTab
            initialVariantId={variantId}
            onOpenVehicle={openDatabase}
            onAdd={(id) => { setVariantId(id); setDialogMode("job"); setDialogOpen(true); }}
          />
        ) : null}
        {tab === "Full database" ? (
          <FullDatabaseTab
            onAddPart={() => { setEditGroup(null); setDialogMode("any"); setDialogOpen(true); }}
            onEditPart={(groupId) => { setEditGroup(groupId); setDialogMode("any"); setDialogOpen(true); }}
          />
        ) : null}
        {tab === "Import" || tab === "Advanced" ? (
          <ImportAdvancedTab
            advanced={tab === "Advanced"}
            onOpenVehicle={openDatabase}
            onProblemsOpenChange={setProblemsOpen}
          />
        ) : null}
      </FindPartsChrome>
      {dialogOpen ? (
        <AddPartDialog variantId={variantId} categoryMode={dialogMode === "any"} groupId={editGroup} onClose={() => { setDialogOpen(false); setEditGroup(null); }} />
      ) : null}
    </div>
  );
}
