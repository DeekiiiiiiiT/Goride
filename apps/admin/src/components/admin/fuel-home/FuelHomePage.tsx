// Stitch: dominion-redesign/433e0f61d6af4258983945cb6684a948
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DominionLoading } from "../DominionStates";
import { FuelKpiRow } from "./FuelKpiRow";
import { FuelSectionCards } from "./FuelSectionCards";
import { NeedsYouPanel } from "./NeedsYouPanel";
import { PumpVsBenchmarkCard } from "./PumpVsBenchmarkCard";
import { fetchFuelOverview } from "./fuelHomeApi";
import { jamaicaDate, updatedLabel } from "./fuelHomeFormat";
import "./fuelHome.css";

function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className || ""}`}>{name}</span>;
}

function openPage(page: string, params: Record<string, string>, onNavigate: (page: string) => void) {
  const url = new URL(window.location.href);
  const next = new URLSearchParams();
  next.set("page", page);
  for (const [key, value] of Object.entries(params)) {
    if (value) next.set(key, value);
  }
  window.history.pushState({ page }, "", `${url.pathname}?${next.toString()}`);
  onNavigate(page);
}

export function FuelHomePage({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [spinning, setSpinning] = useState(false);
  const query = useQuery({
    queryKey: ["fuel-overview"],
    queryFn: fetchFuelOverview,
    staleTime: 60_000,
  });

  async function refresh() {
    setSpinning(true);
    try {
      await query.refetch();
    } finally {
      window.setTimeout(() => setSpinning(false), 750);
    }
  }

  if (query.isLoading && !query.data) return <DominionLoading />;

  if (query.isError && !query.data) {
    return (
      <div className="fuel-home-stitch bg-surface-container-lowest rounded-xl p-4 shadow-sm">
        <div className="p-4 rounded-xl bg-error/5 flex flex-col items-center text-center">
          <div className="w-8 h-8 rounded-full bg-error/10 text-error flex items-center justify-center mb-2">
            <Icon name="cloud_off" className="text-[18px]" />
          </div>
          <p className="text-xs font-semibold text-on-surface">Could not load fuel overview</p>
          <p className="text-[11px] text-on-surface-variant mt-1 leading-normal">Nothing was changed. Master data transaction aborted cleanly.</p>
          <button
            className="mt-3 px-3 py-1 bg-surface-container-lowest text-xs font-medium rounded text-on-surface hover:bg-surface-container shadow-sm transition-all"
            type="button"
            onClick={() => { void query.refetch(); }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const data = query.data;
  if (!data) return <DominionLoading />;
  const todayIso = jamaicaDate(data.generated_at);

  return (
    <div className="fuel-home-stitch flex flex-col w-full pb-16">
      <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <nav className="flex items-center gap-1.5 text-[11px] font-label font-medium text-on-surface-variant uppercase tracking-wider mb-1">
            <span>Dominion</span>
            <span className="text-outline-variant">›</span>
            <span>Master data</span>
            <span className="text-outline-variant">›</span>
            <span className="text-secondary font-semibold">Fuel</span>
          </nav>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-headline font-bold tracking-tight text-on-surface">Fuel</h1>
            <p className="text-xs text-on-surface-variant">Stations, pump prices, refineries and gas-card programs.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          <span className="font-mono text-xs text-on-surface-variant bg-surface-container-high px-2 py-1 rounded">{updatedLabel(data.generated_at)}</span>
          <button
            className="h-8 w-8 rounded-lg bg-surface-container-lowest text-on-surface-variant hover:text-secondary hover:bg-surface-container transition-all flex items-center justify-center shadow-sm"
            title="Refresh"
            type="button"
            onClick={() => { void refresh(); }}
          >
            <Icon name="sync" className={`text-[18px] ${spinning ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      <FuelKpiRow data={data} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        <NeedsYouPanel
          data={data}
          todayIso={todayIso}
          onOpen={(page, params) => openPage(page, params, onNavigate)}
        />
        <PumpVsBenchmarkCard data={data} todayIso={todayIso} />
      </div>
      <FuelSectionCards data={data} onOpen={(page) => openPage(page, {}, onNavigate)} />
    </div>
  );
}
