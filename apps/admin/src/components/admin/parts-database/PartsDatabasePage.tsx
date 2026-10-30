// Stitch: dominion-redesign/ef01fa01e52f4c06b14c3f26887a3b07
// Stitch: dominion-redesign/86d7d8868d684085b4c831f9c0ece4cb
import { useEffect, useState } from "react";
import { AddPartDialog } from "./AddPartDialog";
import { FindPartsTab } from "./FindPartsTab";
import { ImportAdvancedTab } from "./ImportAdvancedTab";
import { SisterVehiclesTab } from "./SisterVehiclesTab";
import { UniversalPartsTab } from "./UniversalPartsTab";
import { VehiclePartsTab } from "./VehiclePartsTab";
import "./partsDatabase.css";

const TABS = ["Find parts", "Vehicle parts", "Sister vehicles", "Universal parts", "Import"] as const;
type Tab = (typeof TABS)[number] | "Advanced";

function tabFromQuery(): Tab {
  const value = new URLSearchParams(window.location.search).get("tab");
  if (value === "vehicle") return "Vehicle parts";
  if (value === "sisters") return "Sister vehicles";
  if (value === "universal") return "Universal parts";
  if (value === "import") return "Import";
  if (value === "advanced") return "Advanced";
  return "Find parts";
}

export function PartsDatabasePage() {
  const [tab, setTab] = useState<Tab>(tabFromQuery);
  const [variantId, setVariantId] = useState(() => new URLSearchParams(window.location.search).get("variant") ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"job" | "any">("job");

  useEffect(() => {
    function sync() {
      setTab(tabFromQuery());
      setVariantId(new URLSearchParams(window.location.search).get("variant") ?? "");
    }
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  function openVehicle(id: string) {
    setVariantId(id);
    setTab("Vehicle parts");
  }

  return (
    <div className="parts-database-stitch flex flex-col w-full">
      <div className="px-8 py-6 space-y-6">
        <nav className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-on-surface-variant">
          <span>Dominion</span>
          <span className="text-outline-variant">›</span>
          <span>Master Data</span>
          <span className="text-outline-variant">›</span>
          <span>Vehicles</span>
          <span className="text-outline-variant">›</span>
          <span className="text-secondary font-semibold">Parts Database</span>
        </nav>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-headline font-bold text-on-surface tracking-tight">Parts database</h1>
            <p className="text-sm text-on-surface-variant mt-1">Every part that fits a car, in five match types.</p>
          </div>
        </div>
        <div className="flex items-center justify-between border-b border-outline-variant/20 pt-1">
          <div className="flex items-center gap-8 -mb-px overflow-x-auto">
            {TABS.map((name) => (
              <button
                key={name}
                type="button"
                className={tab === name
                  ? "relative pb-3 text-sm font-semibold text-secondary"
                  : "pb-3 text-sm font-medium text-on-surface-variant"}
                onClick={() => setTab(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <button type="button" className="text-xs font-medium text-secondary pb-3 flex items-center gap-1" onClick={() => setTab("Advanced")}>
            Advanced tune
          </button>
        </div>
        {tab === "Find parts" ? (
          <FindPartsTab
            initialVariantId={variantId}
            onOpenVehicle={openVehicle}
            onAdd={(id) => { setVariantId(id); setDialogMode("job"); setDialogOpen(true); }}
          />
        ) : null}
        {tab === "Vehicle parts" ? (
          <VehiclePartsTab variantId={variantId} onAdd={() => { setDialogMode("any"); setDialogOpen(true); }} onBack={() => setTab("Find parts")} />
        ) : null}
        {tab === "Sister vehicles" ? <SisterVehiclesTab /> : null}
        {tab === "Universal parts" ? <UniversalPartsTab /> : null}
        {tab === "Import" || tab === "Advanced" ? <ImportAdvancedTab advanced={tab === "Advanced"} onOpenVehicle={openVehicle} /> : null}
      </div>
      {dialogOpen ? (
        <AddPartDialog variantId={variantId} categoryMode={dialogMode === "any"} onClose={() => setDialogOpen(false)} />
      ) : null}
    </div>
  );
}
