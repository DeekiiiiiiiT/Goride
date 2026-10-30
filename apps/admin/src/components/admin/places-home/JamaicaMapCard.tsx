// Stitch: dominion-redesign/15a24b12ad9e4893a6b13d7da4709860
import { useEffect, useMemo, useState } from "react";
import { JamaicaOverviewMap } from "@roam/geo-ui";
import type { DashOverviewParishShape, DashParishRow } from "@roam/dash-admin-client";
import type { PlacesOverview } from "./placesHomeApi";
import { activityTitle, activityWhen, importsMeta } from "./placesHomeFormat";
import { fetchShapes, type MapShape } from "../world-maps/jamaica-map/jamaicaMapApi";

function firstRing(shape: MapShape) {
  const include = (shape.rings ?? []).find((ring) => ring.kind !== "exclude") ?? shape.rings?.[0];
  return (include?.polygon ?? []).filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

export function JamaicaMapCard({
  data,
  todayIso,
  accessToken,
  onOpen,
}: {
  data: PlacesOverview;
  todayIso: string;
  accessToken: string;
  onOpen: (page: string) => void;
}) {
  const areas = data.map.areas;
  const [shapes, setShapes] = useState<MapShape[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    void fetchShapes(accessToken, { levels: "1", tolerance: "0.0005" })
      .then((rows) => {
        if (!cancelled) setShapes(rows);
      })
      .catch(() => {
        if (!cancelled) setShapes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const parishes = useMemo<DashParishRow[]>(() => {
    return shapes.filter((shape) => shape.admin_level === 1).map((shape) => ({
      id: shape.pcode,
      name: shape.name,
      slug: shape.slug,
      pcode: shape.pcode,
      center_lat: shape.center_lat,
      center_lng: shape.center_lng,
      foundation_polygon: firstRing(shape),
    }));
  }, [shapes]);

  const parishShapes = useMemo<DashOverviewParishShape[]>(() => {
    return shapes.filter((shape) => shape.admin_level === 1).map((shape) => ({
      parish_id: shape.pcode,
      name: shape.name,
      rings: (shape.rings ?? []) as DashOverviewParishShape["rings"],
    }));
  }, [shapes]);

  return (
    <div className="lg:col-span-4 flex flex-col">
      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-5 flex flex-col h-full">
        <div className="mb-3">
          <h2 className="text-base font-semibold font-headline text-on-surface">Jamaica map</h2>
          <p className="text-xs text-on-surface-variant">The country borders every app reads.</p>
        </div>
        <div
          className="places-map-well w-full bg-[#f8fafc] rounded-xl p-3 relative overflow-hidden flex items-center justify-center shadow-inner h-36 cursor-pointer"
          role="link"
          tabIndex={0}
          onClick={() => onOpen("world-jamaica")}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onOpen("world-jamaica");
          }}
        >
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:24px_24px] opacity-40" />
          <div className="pointer-events-none absolute inset-3 z-10">
            {accessToken ? (
              <JamaicaOverviewMap
                parishes={parishes}
                parishShapes={parishShapes}
                shapes={[]}
                showParishes
                showTowns={false}
                presentation="inline"
                variant="master"
                chrome="none"
                autoFit={false}
                onClose={() => undefined}
                onMapReady={(map) => {
                  map.setOptions({
                    disableDefaultUI: true,
                    gestureHandling: "none",
                    keyboardShortcuts: false,
                    clickableIcons: false,
                  });
                  const bounds = new google.maps.LatLngBounds(
                    { lat: 17.68, lng: -78.4 },
                    { lat: 18.53, lng: -76.15 },
                  );
                  const fit = () => {
                    google.maps.event.trigger(map, "resize");
                    map.fitBounds(bounds, 0);
                  };
                  fit();
                  window.setTimeout(fit, 300);
                }}
              />
            ) : null}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4 font-mono text-xs">
          <div className="p-2.5 rounded-lg bg-surface-container-low flex justify-between items-baseline">
            <span className="text-outline text-[11px]">Country</span>
            <span className="text-on-surface font-semibold text-sm">{areas.country}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-surface-container-low flex justify-between items-baseline">
            <span className="text-outline text-[11px]">Parishes</span>
            <span className="text-on-surface font-semibold text-sm">{areas.parish}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-surface-container-low flex justify-between items-baseline">
            <span className="text-outline text-[11px]">Towns</span>
            <span className="text-on-surface font-semibold text-sm">{areas.town}</span>
          </div>
          <div className="p-2.5 rounded-lg bg-surface-container-low flex justify-between items-baseline">
            <span className="text-outline text-[11px]">Communities</span>
            <span className="text-on-surface font-semibold text-sm">{areas.community}</span>
          </div>
        </div>
        <div className="mt-4 pt-3 space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-on-surface-variant">Last publish</span>
            <span className="font-mono text-on-surface font-medium">{activityWhen(data.map.last_publish_at, todayIso)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-on-surface-variant">Drafts waiting</span>
            <span className="font-mono text-on-surface font-medium">{data.map.drafts}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-on-surface-variant">Map checks open</span>
            <span className="font-mono text-on-surface font-medium">{data.map.open_checks}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-on-surface-variant">Imports</span>
            <span className="font-mono text-outline">{importsMeta(data.map.imports)}</span>
          </div>
        </div>
        <div className="mt-5 pt-3 bg-surface-container-low/50 -mx-5 -mb-5 p-5 rounded-b-xl">
          <div className="text-[10px] font-label font-bold text-outline uppercase tracking-wider mb-2.5">Recent Activity</div>
          <div className="space-y-2 text-xs">
            {data.activity.map((row) => {
              const quiet = !row.at;
              return (
                <div key={row.kind} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${row.kind === "place_edit" && row.at ? "bg-secondary" : row.kind === "border_publish" && row.at ? "bg-tertiary" : "bg-outline-variant"}`} />
                    <span className={quiet ? "text-on-surface-variant" : "text-on-surface"}>{activityTitle(row.kind)}</span>
                  </div>
                  <span className="font-mono text-outline text-[11px]">{activityWhen(row.at, todayIso)}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
