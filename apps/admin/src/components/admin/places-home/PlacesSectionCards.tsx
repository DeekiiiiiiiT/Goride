// Stitch: dominion-redesign/15a24b12ad9e4893a6b13d7da4709860
import type { PlacesOverview } from "./placesHomeApi";
import {
  categoriesStatusLine,
  importsStatusLine,
  mapStatusLine,
  pinsStatusLine,
  registerStatusLine,
  reviewStatusLine,
} from "./placesHomeFormat";

function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className || ""}`}>{name}</span>;
}

export function PlacesSectionCards({
  data,
  todayIso,
  onOpen,
}: {
  data: PlacesOverview;
  todayIso: string;
  onOpen: (page: string) => void;
}) {
  const cards = [
    { page: "world-jamaica", icon: "public", title: "Jamaica map", detail: "Country, parish, town and community borders.", status: mapStatusLine(data) },
    { page: "places-register", icon: "format_list_bulleted", title: "Places register", detail: "Every place, with its type and facilities.", status: registerStatusLine(data) },
    { page: "places-categories", icon: "category", title: "Categories", detail: "Groups, types, facilities, and brands.", status: categoriesStatusLine(data) },
    { page: "places-review", icon: "fact_check", title: "Review", detail: "Pins and facility suggestions waiting for a decision.", status: reviewStatusLine(data, todayIso) },
    { page: "world-places", icon: "push_pin", title: "Map pins", detail: "Landmarks pinned directly on the map.", status: pinsStatusLine(data) },
    { page: "world-imports", icon: "cloud_sync", title: "Imports and checks", detail: "Border files and map quality checks.", status: importsStatusLine(data) },
  ];

  return (
    <div className="flex flex-col space-y-3">
      <div className="flex flex-col">
        <h2 className="text-lg font-bold font-headline text-on-surface tracking-tight">Sections</h2>
        <p className="text-xs text-on-surface-variant">Map and places master data.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <button
            key={card.page}
            className="group p-5 bg-surface-container-lowest hover:bg-surface-container-low/60 rounded-xl shadow-sm transition-all flex flex-col justify-between text-left"
            type="button"
            onClick={() => onOpen(card.page)}
          >
            <div>
              <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center mb-3 group-hover:bg-secondary-fixed transition-colors">
                <Icon name={card.icon} className="text-secondary text-[22px]" />
              </div>
              <h3 className="text-sm font-bold font-headline text-secondary group-hover:text-secondary-dim transition-colors mb-1">{card.title}</h3>
              <p className="text-xs text-on-surface-variant leading-relaxed mb-4">{card.detail}</p>
            </div>
            <div className="pt-3 flex items-center justify-between font-mono text-[11px] text-on-surface-variant group-hover:text-on-surface">
              <span className="truncate">{card.status}</span>
              <Icon name="chevron_right" className="text-[16px] text-outline group-hover:translate-x-0.5 transition-transform shrink-0 ml-1" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
