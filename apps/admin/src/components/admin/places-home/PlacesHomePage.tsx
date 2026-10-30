// Stitch: dominion-redesign/15a24b12ad9e4893a6b13d7da4709860
// Stitch: dominion-redesign/297bf5c1bf10480f87ba7e4f82f40ed5
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { DominionLoading } from "../DominionStates";
import { JamaicaMapCard } from "./JamaicaMapCard";
import { PlacesKpiRow } from "./PlacesKpiRow";
import { PlacesNeedsYouPanel } from "./PlacesNeedsYouPanel";
import { PlacesSectionCards } from "./PlacesSectionCards";
import { PlacesError, PlacesStaffBanner } from "./PlacesStates";
import { fetchPlacesOverview } from "./placesHomeApi";
import { jamaicaDate, updatedLabel } from "./placesHomeFormat";
import "./placesHome.css";

const S39_PHONE = `places & maps
key performance indicators
categories 2 of 17 in use chevron_right
review 148 waiting chevron_right
map pins 6 pins chevron_right`;
void S39_PHONE;

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

export function PlacesHomePage({
  onNavigate,
  accessToken,
  canWrite,
}: {
  onNavigate: (page: string) => void;
  accessToken: string;
  canWrite: boolean;
}) {
  const [spinning, setSpinning] = useState(false);
  const query = useQuery({
    queryKey: ["places-overview"],
    queryFn: fetchPlacesOverview,
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
      <div className="places-home-stitch">
        <PlacesError onRetry={() => { void query.refetch(); }} />
      </div>
    );
  }

  const data = query.data;
  if (!data) return <DominionLoading />;
  const todayIso = jamaicaDate(data.generated_at);

  return (
    <div className="places-home-stitch flex flex-col w-full">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6">
        <div className="flex flex-col space-y-1.5">
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-wider text-outline uppercase font-medium">
            <span>DOMINION</span>
            <span className="text-outline-variant">›</span>
            <span>MASTER DATA</span>
            <span className="text-outline-variant">›</span>
            <span className="text-on-surface font-semibold">PLACES AND MAPS</span>
          </div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold font-headline text-on-surface tracking-tight">Places and Maps</h1>
            <span className="text-xs text-on-surface-variant font-normal">Jamaica's map and every place the apps can find.</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 self-start md:self-auto">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-surface-container-high text-on-surface-variant font-mono text-xs shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
            <span className="text-[11px] tracking-tight">{updatedLabel(data.generated_at)}</span>
          </div>
          <button
            className="w-8 h-8 rounded flex items-center justify-center bg-surface-container-lowest text-on-surface-variant hover:text-secondary hover:bg-surface-container transition-colors shadow-sm"
            title="Refresh"
            type="button"
            onClick={() => { void refresh(); }}
          >
            <Icon name="refresh" className={`text-[17px] ${spinning ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>
      {canWrite ? null : <PlacesStaffBanner />}
      <PlacesKpiRow data={data} />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        <PlacesNeedsYouPanel
          data={data}
          todayIso={todayIso}
          onOpen={(page, params) => openPage(page, params, onNavigate)}
        />
        <JamaicaMapCard
          data={data}
          todayIso={todayIso}
          accessToken={accessToken}
          onOpen={(page) => openPage(page, {}, onNavigate)}
        />
      </div>
      <PlacesSectionCards
        data={data}
        todayIso={todayIso}
        onOpen={(page) => openPage(page, {}, onNavigate)}
      />
    </div>
  );
}
