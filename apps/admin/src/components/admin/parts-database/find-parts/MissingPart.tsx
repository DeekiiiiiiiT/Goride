// Stitch: find_parts_not_on_file_yet / S42g
import { useQuery } from "@tanstack/react-query";
import { fetchPartDemand } from "./findPartsApi";

function posCode(position: string, side: string) {
  const axle = position === "rear" ? "REAR" : position === "front" ? "FRONT" : "ALL";
  const sideCode = side === "left" ? "LH" : side === "right" ? "RH" : "LH_RH";
  return `${axle}_${sideCode}`;
}

function categoryPath(partName: string) {
  const name = partName.toLowerCase();
  if (name.includes("brake pad")) return "Braking › Disc brake pads";
  if (name.includes("brake")) return "Braking";
  if (name.includes("filter")) return "Filters & service";
  return partName || "Maintenance";
}

function placementLabel(position: string, sideLabel: string) {
  if (position === "front") return "Front (Ventilated rotor)";
  if (position === "rear") return "Rear (Drum / shoes)";
  if (sideLabel) return sideLabel;
  return "All placements";
}

export function MissingPart({
  headline,
  partName,
  carLabel,
  versionLabel,
  sideLabel,
  position,
  side,
  vehicleChip,
  chassisLabel,
  componentId,
  variantId,
  owner,
  onAdd,
  onSearch,
}: {
  headline: string;
  partName: string;
  carLabel: string;
  versionLabel: string;
  sideLabel: string;
  position: string;
  side: string;
  vehicleChip: string;
  chassisLabel: string;
  componentId: string;
  variantId: string;
  owner: boolean;
  onAdd: () => void;
  onSearch: () => void;
}) {
  const demand = useQuery({
    queryKey: ["part-demand", variantId, componentId],
    queryFn: () => fetchPartDemand(variantId, componentId),
    enabled: Boolean(variantId && componentId),
  });
  const ownerTitle = owner ? undefined : "Only the owner can change parts.";
  const axleChip = position === "front" ? "Front axle" : position === "rear" ? "Rear axle" : sideLabel || "Both axles";
  const placement = placementLabel(position, sideLabel);
  const classId = componentId ? componentId.slice(0, 8).toUpperCase() : "PENDING";

  return (
    <div className="w-full max-w-[1440px] mx-auto flex flex-col gap-space-xl">
      <div className="bg-surface-container-lowest rounded-xl shadow-md p-space-xl flex flex-col items-center text-center">
        <div className="relative w-20 h-20 rounded-full bg-secondary-container/40 flex items-center justify-center text-primary mb-space-lg">
          <svg className="w-10 h-10 text-primary" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" viewBox="0 0 24 24" aria-hidden>
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" x2="12" y1="22.08" y2="12" />
          </svg>
          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center shadow-sm">
            <span className="material-symbols-outlined text-[18px]">search_off</span>
          </div>
        </div>
        <h2 className="font-headline-lg text-headline-lg font-semibold text-on-surface max-w-2xl">{headline}</h2>
        <p className="font-body-md text-body-md text-on-surface-variant mt-2 max-w-xl">
          Customers searching for this see{" "}
          <span className="font-medium text-on-surface bg-surface-container px-1.5 py-0.5 rounded">“Ask Roam to find it”</span>.
        </p>
        {demand.data ? (
          <div className="mt-space-lg flex flex-col items-center gap-space-xs max-w-xl w-full">
            <div className="w-full bg-surface-container-low px-space-md py-space-sm rounded-xl flex flex-wrap items-center justify-between gap-space-sm shadow-sm">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-tertiary" />
                <span className="font-label-md text-label-md font-semibold text-on-surface">
                  Asked for by {demand.data.fleetCount} fleets · {demand.data.openCount} open requests
                </span>
              </div>
              <span className="font-mono-sm text-mono-sm text-on-surface-variant bg-surface-container-lowest px-2 py-0.5 rounded shadow-sm">
                {demand.data.openCount >= 3 ? "PRIORITY: HIGH" : "PRIORITY: NORMAL"}
              </span>
            </div>
            <p className="font-body-sm text-body-sm text-outline flex items-center gap-1.5 flex-wrap justify-center">
              <span className="material-symbols-outlined text-[15px]">info</span>
              <span>Open fleet requests are queued for this fitment gap.</span>
            </p>
          </div>
        ) : null}
        <div className="mt-space-xl flex flex-wrap items-center justify-center gap-space-md">
          <button
            type="button"
            className="h-10 px-space-lg rounded-xl bg-primary-container text-on-primary hover:bg-primary transition-all flex items-center gap-2 font-label-md text-label-md font-semibold shadow-md disabled:opacity-40"
            disabled={!owner}
            title={ownerTitle}
            onClick={onAdd}
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Add it now
          </button>
          <button
            type="button"
            className="h-10 px-space-lg rounded-xl bg-surface-container-lowest text-on-surface hover:bg-surface-container-low transition-colors font-label-md text-label-md font-medium shadow-sm"
            onClick={onSearch}
          >
            Search a different part
          </button>
        </div>

        <div className="mt-space-xl w-full bg-surface-container-low/60 rounded-xl p-space-lg text-left shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-md mb-space-md gap-space-sm border-b border-outline-variant/20">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[20px] text-primary">auto_fix_high</span>
              <span className="font-headline-md text-headline-md text-on-surface">Quick add preview — Ingestion form ready</span>
            </div>
            <span className="font-mono-sm text-mono-sm text-on-surface-variant bg-surface-container px-2 py-1 rounded w-fit">Drawer ready staged</span>
          </div>
          <div className="flex flex-wrap items-center gap-space-sm mb-space-lg">
            {vehicleChip ? (
              <span className="h-[22px] px-2 rounded-full bg-primary-container/10 text-primary font-mono-sm text-mono-sm font-semibold inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">directions_car</span>
                {vehicleChip}
              </span>
            ) : null}
            {partName ? (
              <span className="h-[22px] px-2 rounded-full bg-tertiary-container/10 text-tertiary font-mono-sm text-mono-sm font-semibold inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">category</span>
                {partName}
              </span>
            ) : null}
            <span className="h-[22px] px-2 rounded-full bg-surface-container-highest text-on-surface font-mono-sm text-mono-sm font-semibold inline-flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">swap_horiz</span>
              {axleChip}
            </span>
            {chassisLabel ? (
              <span className="h-[22px] px-2 rounded-full bg-secondary-fixed text-on-secondary-fixed font-mono-sm text-mono-sm font-semibold inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">fingerprint</span>
                Chassis: {chassisLabel}
              </span>
            ) : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
            <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex flex-col justify-between min-h-[88px]">
              <span className="font-label-xs text-label-xs uppercase text-outline">Target category</span>
              <div className="flex items-center justify-between mt-1 gap-2">
                <span className="font-body-md text-body-md font-semibold text-on-surface">{categoryPath(partName)}</span>
                <span className="material-symbols-outlined text-[16px] text-outline shrink-0">lock</span>
              </div>
              <span className="font-mono-sm text-mono-sm text-secondary mt-2">Class: {classId}</span>
            </div>
            <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex flex-col justify-between min-h-[88px]">
              <span className="font-label-xs text-label-xs uppercase text-outline">Axle & placement</span>
              <div className="flex items-center justify-between mt-1 gap-2">
                <span className="font-body-md text-body-md font-semibold text-on-surface">{placement}</span>
                <span className="material-symbols-outlined text-[16px] text-outline shrink-0">lock</span>
              </div>
              <span className="font-mono-sm text-mono-sm text-secondary mt-2">Pos: {posCode(position, side)}</span>
            </div>
            <div className="bg-surface-container-lowest p-space-md rounded-lg shadow-sm flex flex-col justify-between min-h-[88px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-label-xs text-label-xs uppercase text-outline">Fitment tier classification</span>
                <span className="font-mono-sm text-mono-sm text-primary font-medium">Auto-mapped</span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="h-[22px] px-2 rounded-full bg-primary-container/10 text-primary font-mono-sm text-mono-sm font-semibold">Tier 1: Direct OEM</span>
                <span className="font-label-xs text-label-xs text-on-surface-variant font-medium">(Recommended)</span>
              </div>
              <span className="font-mono-sm text-mono-sm text-secondary mt-2">{carLabel}{versionLabel ? ` · ${versionLabel}` : ""}</span>
            </div>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-md flex items-start gap-2 text-left">
            <span className="material-symbols-outlined text-[16px] text-primary shrink-0 mt-0.5">verified_user</span>
            <span>
              Clicking <strong className="font-semibold text-on-surface">“Add it now”</strong> opens catalog ingestion with these vehicle specifications pre-locked, preserving the match trail.
            </span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-lg">
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-start gap-space-md">
          <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-primary">
            <span className="material-symbols-outlined text-[20px]">hub</span>
          </div>
          <div className="flex flex-col text-left">
            <h3 className="font-headline-md text-headline-md text-on-surface">Sister platform search</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">No shared catalog baseline verified for this exact variant yet.</p>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-start gap-space-md">
          <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-primary">
            <span className="material-symbols-outlined text-[20px]">speed</span>
          </div>
          <div className="flex flex-col text-left">
            <h3 className="font-headline-md text-headline-md text-on-surface">Ingestion SLA</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Parts added in Dominion Admin are indexed for fleet search after publish.</p>
          </div>
        </div>
        <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm flex items-start gap-space-md">
          <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0 text-primary">
            <span className="material-symbols-outlined text-[20px]">shield</span>
          </div>
          <div className="flex flex-col text-left">
            <h3 className="font-headline-md text-headline-md text-on-surface">Clean telemetry</h3>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">Consumer search queries stay anonymous. Fleet request IDs can be notified when the part is published.</p>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm flex flex-col md:flex-row items-center justify-between gap-space-md">
        <div className="flex items-center gap-space-md text-left">
          <div className="w-9 h-9 rounded-full bg-secondary-container/60 text-secondary flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
          </div>
          <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
            <strong className="font-semibold text-on-surface">Staff note:</strong> You are viewing customer-facing match logic. Customer identity profiles and pricing metrics are stripped. Every fitment gap directly enables the{" "}
            <span className="font-semibold text-primary">Add it now</span> ingestion workflow.
          </p>
        </div>
        <button type="button" className="px-space-md py-2 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors font-label-md text-label-md text-on-surface shrink-0 flex items-center gap-1.5 shadow-sm">
          <span className="material-symbols-outlined text-[16px]">unfold_more_double</span>
          Audit fit matrix
        </button>
      </div>
    </div>
  );
}
