// Pending catalog (Dominion → Vehicles → Pending catalog). Research engine audit §4: S1 Parts, S2 Vehicles,
// S3 Auto-match conflicts (unchanged), S4 Settings and health. Stitch: docs/stitch/research-engine/.
// Never shows who asked, when, or how many companies asked (RE-23).
import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { researchApi } from "../../../services/researchEngineService";
import { fetchAutoMatchConflicts } from "../../../services/partsAutoMatchApi";
import { PendingCatalogShell, type PendingCatalogTabId } from "./pending-parts/PendingCatalogShell";
import { AutoMatchConflictsTab } from "./pending-parts/AutoMatchConflictsTab";
import { ResearchPartsTab } from "../research-engine/ResearchPartsTab";
import { ResearchVehiclesTab } from "../research-engine/ResearchVehiclesTab";
import { ResearchSettingsHealth } from "../research-engine/ResearchSettingsHealth";
import "./pending-parts/pendingParts.css";

function readCatalogTabFromUrl(): PendingCatalogTabId {
  if (typeof window === "undefined") return "parts";
  const tab = new URLSearchParams(window.location.search).get("tab");
  if (tab === "vehicles") return "vehicles";
  if (tab === "conflicts") return "conflicts";
  if (tab === "settings") return "settings";
  return "parts";
}

function writeCatalogTabToUrl(tab: PendingCatalogTabId) {
  const url = new URL(window.location.href);
  url.searchParams.set("page", "pending-motor-vehicles");
  url.searchParams.set("tab", tab);
  window.history.replaceState({}, "", `${url.pathname}?${url.searchParams.toString()}`);
}

export function PendingVehicleCatalogManager() {
  const { session } = useAuth();
  const token = session?.access_token;
  const [catalogTab, setCatalogTab] = useState<PendingCatalogTabId>(() => readCatalogTabFromUrl());
  const [conflictsHeaderActions, setConflictsHeaderActions] = useState<React.ReactNode>(null);
  const [partsCount, setPartsCount] = useState(0);
  const [vehiclesCount, setVehiclesCount] = useState(0);
  const [conflictsCount, setConflictsCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  // Tab counts: what needs the owner (needs review + open browser checks; vehicles needing review).
  const loadCounts = useCallback(async () => {
    if (!token) return;
    try {
      const s = await researchApi.summary(token);
      setPartsCount(s.needsReview + s.browserCheckOpen);
      setVehiclesCount(s.vehiclesNeedsReview);
    } catch {
      /* the tab bodies show their own errors */
    }
  }, [token]);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts, reloadKey, catalogTab]);

  useEffect(() => {
    if (!token) return;
    void fetchAutoMatchConflicts(token, { status: "open" })
      .then((res) => setConflictsCount(Number(res.totalsByStatus?.open ?? res.filteredCount ?? res.rows?.length ?? 0)))
      .catch(() => setConflictsCount(0));
  }, [token, catalogTab]);

  // The notice banner's "Open research settings" lands here with ?tab=settings.
  useEffect(() => {
    const onPop = () => setCatalogTab(readCatalogTabFromUrl());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const setTab = (tab: PendingCatalogTabId) => {
    setCatalogTab(tab);
    writeCatalogTabToUrl(tab);
  };

  return (
    <div className={`pending-parts-stitch min-h-[600px] flex-1${catalogTab === "conflicts" ? " auto-match-conflicts" : ""}`}>
      <PendingCatalogShell
        catalogTab={catalogTab}
        onTabChange={setTab}
        vehiclesCount={vehiclesCount}
        partsCount={partsCount}
        conflictsCount={conflictsCount}
        conflictsHeaderActions={conflictsHeaderActions}
        onAfterRerun={() => setReloadKey((k) => k + 1)}
      >
        {catalogTab === "parts" ? (
          <ResearchPartsTab key={`parts-${reloadKey}`} />
        ) : catalogTab === "conflicts" ? (
          <AutoMatchConflictsTab onHeaderActions={setConflictsHeaderActions} />
        ) : catalogTab === "settings" ? (
          <ResearchSettingsHealth key={`settings-${reloadKey}`} />
        ) : (
          <ResearchVehiclesTab key={`vehicles-${reloadKey}`} />
        )}
      </PendingCatalogShell>
    </div>
  );
}
