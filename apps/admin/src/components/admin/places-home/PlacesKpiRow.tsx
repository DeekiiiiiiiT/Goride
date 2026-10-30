// Stitch: dominion-redesign/15a24b12ad9e4893a6b13d7da4709860
import type { PlacesOverview, QualityRule } from "./placesHomeApi";
import { barPercent, qualityReason, ruleByKey, wholePercent } from "./placesHomeFormat";

function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={`material-symbols-outlined ${className || ""}`}>{name}</span>;
}

function RuleBar({ rule, total }: { rule: QualityRule; total: number }) {
  const denom = rule.applies_to ?? total;
  const width = barPercent(rule.pass, denom);
  const bar = width === 0 ? "bg-outline" : width === 100 ? "bg-tertiary" : "bg-secondary";
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-mono text-on-surface-variant">
        <span>{rule.label} {rule.pass} / {denom}</span>
        <span>{wholePercent(width)}</span>
      </div>
      <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export function PlacesKpiRow({ data }: { data: PlacesOverview }) {
  const places = data.places;
  const verifiedWidth = barPercent(places.verified, places.total);
  const plugWidth = barPercent(places.on_plug, places.total);
  const quality = data.places_quality.score;
  const mapScore = data.map.score;
  const healthyPlaces = quality === 100;
  const healthyMap = mapScore === 100;
  const pin = ruleByKey(data.places_quality.rules, "pin_checked");
  const area = ruleByKey(data.places_quality.rules, "area_code");
  const brand = ruleByKey(data.places_quality.rules, "brand_set");
  const borders = barPercent(data.map.borders_pass, data.map.borders_total);
  const pins = barPercent(data.map.pins_pass, data.map.pins);
  const areasLive = data.map.areas.country + data.map.areas.parish + data.map.areas.town + data.map.areas.community;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
      <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-label font-bold tracking-wider text-outline uppercase">Places</span>
            <Icon name="place" className="text-[18px] text-outline" />
          </div>
          <div className="text-4xl font-mono font-light text-on-surface tracking-tight leading-none mb-1">{places.total}</div>
          <div className="text-xs text-on-surface-variant">{places.verified} verified · {places.pending} pending</div>
        </div>
        <div className="mt-4 pt-3 space-y-1.5 bg-surface-container-low/40 -mx-5 -mb-5 p-5 rounded-b-xl">
          <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
            <div className="h-full bg-secondary rounded-full" style={{ width: `${verifiedWidth}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-on-surface-variant">
            <span>{wholePercent(verifiedWidth)} verified</span>
            <span className="text-outline">{places.verified} / {places.total}</span>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-label font-bold tracking-wider text-outline uppercase">Places Quality</span>
            <Icon name="verified" className={`text-[18px] ${healthyPlaces ? "text-tertiary" : "text-amber-600"}`} />
          </div>
          <div className={`text-4xl font-mono font-light tracking-tight leading-none mb-1 ${healthyPlaces ? "text-tertiary" : "text-amber-600"}`}>{wholePercent(quality)}</div>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${healthyPlaces ? "text-tertiary" : "text-amber-600"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${healthyPlaces ? "bg-tertiary" : "bg-amber-600"}`} />
            <span>{qualityReason(data)}</span>
          </div>
        </div>
        <div className="mt-4 pt-2 space-y-2 bg-surface-container-low/40 -mx-5 -mb-5 p-5 rounded-b-xl">
          {pin ? <RuleBar rule={pin} total={places.total} /> : null}
          {area ? <RuleBar rule={area} total={places.total} /> : null}
          {brand ? <RuleBar rule={brand} total={places.total} /> : null}
        </div>
      </div>

      <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-label font-bold tracking-wider text-outline uppercase">On Plug</span>
            <Icon name="power" className="text-[18px] text-tertiary" />
          </div>
          <div className="text-4xl font-mono font-light text-tertiary tracking-tight leading-none mb-1">{places.on_plug}</div>
          <div className="text-xs text-on-surface-variant">of {places.total} places show on Roam Plug</div>
        </div>
        <div className="mt-4 pt-3 space-y-1.5 bg-surface-container-low/40 -mx-5 -mb-5 p-5 rounded-b-xl">
          <div className="w-full h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
            <div className="h-full bg-tertiary rounded-full" style={{ width: `${plugWidth}%` }} />
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-mono text-tertiary font-medium">{wholePercent(plugWidth)}</span>
            <span className="text-[10px] text-outline font-body">Only verified places show on Plug</span>
          </div>
        </div>
      </div>

      <div className="bg-surface-container-lowest p-5 rounded-xl shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-label font-bold tracking-wider text-outline uppercase">Map Quality</span>
            <Icon name="map" className={`text-[18px] ${healthyMap ? "text-tertiary" : "text-amber-600"}`} />
          </div>
          <div className={`text-4xl font-mono font-light tracking-tight leading-none mb-1 ${healthyMap ? "text-tertiary" : "text-amber-600"}`}>{wholePercent(mapScore)}</div>
          <div className={`flex items-center gap-1.5 text-xs font-medium ${healthyMap ? "text-tertiary" : "text-amber-600"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${healthyMap ? "bg-tertiary" : "bg-amber-600"}`} />
            <span>{areasLive} areas live</span>
          </div>
        </div>
        <div className="mt-4 pt-2 space-y-2 bg-surface-container-low/40 -mx-5 -mb-5 p-5 rounded-b-xl">
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-on-surface-variant">
              <span>Borders published {data.map.borders_pass} / {data.map.borders_total}</span>
              <span>{wholePercent(borders)}</span>
            </div>
            <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
              <div className="h-full bg-tertiary rounded-full" style={{ width: `${borders}%` }} />
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] font-mono text-on-surface-variant">
              <span>Map pins complete {data.map.pins_pass} / {data.map.pins}</span>
              <span>{wholePercent(pins)}</span>
            </div>
            <div className="w-full h-1 bg-surface-container-highest rounded-full overflow-hidden">
              <div className="h-full bg-tertiary rounded-full" style={{ width: `${pins}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
