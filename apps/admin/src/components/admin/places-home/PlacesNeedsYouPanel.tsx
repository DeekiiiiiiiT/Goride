// Stitch: dominion-redesign/15a24b12ad9e4893a6b13d7da4709860
import type { PlacesOverview } from "./placesHomeApi";
import { EMPTY_NEEDS, itemsLabel, needCounts, oldestReviewLine, orderNeeds, type NeedKey } from "./placesHomeFormat";

function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className || ""}`}>{name}</span>;
}

type Row = {
  key: NeedKey;
  icon: string;
  title: string;
  detail: string;
  action: "Review" | "Open";
  urgent: boolean;
  page: string;
  params: Record<string, string>;
};

function catalog(data: PlacesOverview, todayIso: string): Record<NeedKey, Row> {
  return {
    new_places: {
      key: "new_places",
      icon: "rate_review",
      title: "New places waiting for review",
      detail: oldestReviewLine(data.review.oldest_at, todayIso),
      action: "Review",
      urgent: true,
      page: "places-review",
      params: {},
    },
    learnt: {
      key: "learnt",
      icon: "school",
      title: "Learnt places",
      detail: "Learnt from an app and still waiting",
      action: "Review",
      urgent: true,
      page: "places-review",
      params: { chip: "learnt" },
    },
    suggestions: {
      key: "suggestions",
      icon: "edit_note",
      title: "Hand edits and facility suggestions",
      detail: "Changes waiting for a decision",
      action: "Review",
      urgent: true,
      page: "places-review",
      params: { chip: "hand" },
    },
    evidence: {
      key: "evidence",
      icon: "description",
      title: "Evidence",
      detail: "Notes waiting to be read",
      action: "Review",
      urgent: false,
      page: "places-review",
      params: { chip: "evidence" },
    },
    pin_unchecked: {
      key: "pin_unchecked",
      icon: "location_searching",
      title: "Pins not checked on the map",
      detail: "Coordinates need a person to confirm them",
      action: "Open",
      urgent: false,
      page: "places-register",
      params: { issue: "pin_unchecked" },
    },
    verified_pin_unchecked: {
      key: "verified_pin_unchecked",
      icon: "notification_important",
      title: "Verified, but the pin was never checked",
      detail: "These already show on Plug",
      action: "Open",
      urgent: true,
      page: "places-register",
      params: { issue: "verified_pin_unchecked" },
    },
    no_brand: {
      key: "no_brand",
      icon: "local_gas_station",
      title: "Stations without a brand",
      detail: "Not linked to TotalEnergies, Rubis, Texaco or another brand",
      action: "Open",
      urgent: false,
      page: "places-register",
      params: { issue: "no_brand" },
    },
    area_parish_only: {
      key: "area_parish_only",
      icon: "signpost",
      title: "Tagged to a parish only",
      detail: "No town or community set, so 'near this town' search can't find them",
      action: "Open",
      urgent: false,
      page: "places-register",
      params: { issue: "area_parish_only" },
    },
  };
}

export function PlacesNeedsYouPanel({
  data,
  todayIso,
  onOpen,
}: {
  data: PlacesOverview;
  todayIso: string;
  onOpen: (page: string, params: Record<string, string>) => void;
}) {
  const counts = needCounts(data);
  const keys = orderNeeds(counts);
  const rows = catalog(data, todayIso);

  return (
    <div className="lg:col-span-8 flex flex-col">
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col h-full">
        <div className="px-6 py-4 flex items-center justify-between bg-surface-container-low/30">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold font-headline text-on-surface">Needs you</h2>
            <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-mono text-[11px] font-medium">{itemsLabel(keys.length)}</span>
          </div>
          <span className="text-xs text-outline font-body">Places and map work</span>
        </div>
        <div className="p-4 space-y-2.5 flex-1">
          {keys.length === 0 ? (
            <div className="p-8 rounded-xl bg-surface-container-low flex flex-col items-center text-center justify-center gap-3">
              <div className="w-14 h-14 rounded-full bg-tertiary-container/40 flex items-center justify-center text-tertiary shadow-sm">
                <Icon name="check_circle" className="text-3xl" />
              </div>
              <h3 className="text-base font-bold font-headline text-on-surface tracking-tight">{EMPTY_NEEDS}</h3>
            </div>
          ) : keys.map((key) => {
            const row = rows[key];
            return (
              <div key={key} className="p-3.5 rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors flex items-center justify-between gap-4">
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-secondary-fixed flex items-center justify-center shrink-0">
                    <Icon name={row.icon} className="text-secondary text-[20px]" />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-on-surface truncate font-headline">{row.title}</span>
                    <span className="text-xs text-outline truncate font-body">{row.detail}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`px-2.5 py-0.5 rounded font-mono text-xs ${row.urgent ? "font-semibold bg-amber-100 text-amber-800" : "font-medium bg-surface-container-highest text-on-surface-variant"}`}>{counts[key]}</span>
                  <button
                    className={row.action === "Review"
                      ? "px-3.5 py-1.5 rounded-lg bg-secondary hover:bg-secondary-dim text-on-secondary text-xs font-semibold font-label shadow-sm transition-colors"
                      : "px-3.5 py-1.5 rounded-lg bg-surface-container-lowest hover:bg-surface-container-highest text-on-surface text-xs font-semibold font-label shadow-sm transition-colors"}
                    type="button"
                    onClick={() => onOpen(row.page, row.params)}
                  >
                    {row.action}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
