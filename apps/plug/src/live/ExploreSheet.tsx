import { useEffect, useState } from 'react';
import { publicGet } from '../api';
import { writeStationCache } from '../offline';
import { onPlugClick } from '../shell/actions';
import { deviceFix } from '../shell/facts';
import { chipById, sortedChips, type PlugChip } from './plugChips';
import {
  confidenceDotClass,
  confidenceLabel,
  confidenceTone,
  gradeLabel as pumpGradeLabel,
  moneyJmd,
  readPumpQuote,
  relativeAge,
} from './pumpPrice';

type Station = {
  id: string;
  name: string;
  brand?: string;
  address?: string;
  lat: number;
  lng: number;
  pcode?: string;
  prices?: Record<string, unknown>;
  price_updated_at?: string | null;
};

type Place = { id: string; name: string; kind: string; lat: number; lng: number };
type FacilityHit = { place_id: string; display_name: string; place_name: string; distance_m: number; facility: string };

const KINGSTON = { lat: 18.0179, lng: -76.8099 };

function here(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(KINGSTON);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(KINGSTON),
      { timeout: 2500, maximumAge: 60000 },
    );
  });
}

function priceOf(row: Station, grade: string): number {
  return readPumpQuote(row.prices, grade).price ?? Number.POSITIVE_INFINITY;
}

function kmLabel(lat: number, lng: number): string | null {
  const fix = deviceFix() || KINGSTON;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat - fix.lat);
  const dLng = toRad(lng - fix.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(fix.lat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
  const km = 2 * 6371 * Math.asin(Math.sqrt(a));
  if (!Number.isFinite(km)) return null;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function ExploreSheet() {
  const [grade, setGrade] = useState(sessionStorage.getItem('plug-grade') || 'e10_87');
  const [chip, setChip] = useState(sessionStorage.getItem('plug-chip') || '');
  const [category, setCategory] = useState(sessionStorage.getItem('plug-category') || '');
  const [facilities, setFacilities] = useState<FacilityHit[]>([]);
  const [stations, setStations] = useState<Station[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [chips, setChips] = useState<PlugChip[]>([]);
  const [signedIn, setSignedIn] = useState(document.body.dataset.signedIn === '1');

  useEffect(() => {
    const load = () => {
      setGrade(sessionStorage.getItem('plug-grade') || 'e10_87');
      const next = sessionStorage.getItem('plug-chip') || '';
      const nextCategory = sessionStorage.getItem('plug-category') || '';
      setChip(next);
      setCategory(nextCategory);
      setSignedIn(document.body.dataset.signedIn === '1');
      const showStations = !next || next === 'fuel';
      if (showStations) {
        void publicGet<{ stations: Station[] }>('/stations').then((body) => {
          const rows = body.stations || [];
          writeStationCache(rows);
          setStations(rows);
        }).catch(() => setStations([]));
      } else setStations([]);
      if (!next) {
        void publicGet<{ places: Place[] }>('/places').then((body) => setPlaces(body.places || [])).catch(() => setPlaces([]));
      } else if (next !== 'fuel') {
        void publicGet<{ places: Place[] }>(`/places?kind=${encodeURIComponent(next)}`).then((body) => setPlaces(body.places || [])).catch(() => setPlaces([]));
      } else {
        void publicGet<{ places: Place[] }>('/places?kind=fuel').then((body) => setPlaces(body.places || [])).catch(() => setPlaces([]));
      }
      if (nextCategory) {
        void here().then(async (pin) => {
          const tree = await publicGet<{ facilityTypes?: { slug: string; category_code: string }[] }>('/places/taxonomy').catch(() => ({ facilityTypes: [] }));
          const kinds = (tree.facilityTypes || []).filter((row) => row.category_code === nextCategory);
          const lists = await Promise.all(kinds.map((kind) => publicGet<{ results?: FacilityHit[] }>(
            `/places/search?facility=${encodeURIComponent(kind.slug)}&lat=${pin.lat}&lng=${pin.lng}`,
          ).then((body) => (body.results || []).map((row) => ({ ...row, facility: kind.slug }))).catch(() => [] as FacilityHit[])));
          setFacilities(lists.flat().sort((a, b) => Number(a.distance_m) - Number(b.distance_m)));
        });
      } else setFacilities([]);
      void publicGet<{ plugChips?: PlugChip[] }>('/places/taxonomy')
        .then((body) => setChips(sortedChips(body.plugChips)))
        .catch(() => setChips([]));
    };
    load();
    window.addEventListener('plug-refresh', load);
    return () => window.removeEventListener('plug-refresh', load);
  }, []);

  const kind = chipById(chips, chip);
  const title = !chip ? 'All near you' : (kind?.label || 'Nearby places');
  const ranked = [...stations].sort((a, b) => priceOf(a, grade) - priceOf(b, grade));
  const priced = ranked.filter((row) => priceOf(row, grade) < Number.POSITIVE_INFINITY);
  const top = chip === 'fuel' ? priced[0] : undefined;
  const rest = chip === 'fuel' ? ranked.filter((row) => row.id !== top?.id) : (!chip ? ranked : []);
  const gradeLabel = pumpGradeLabel(grade);
  const showPlaces = chip !== 'fuel';
  const emptyPlaces = showPlaces && places.length === 0 && (chip !== '' || stations.length === 0);
  const emptyFuel = chip === 'fuel' && ranked.length === 0 && places.length === 0;

  return (
    <div className="absolute inset-x-0 z-30 flex max-h-[58%] flex-col overflow-y-auto bg-surface rounded-t-3xl shadow-2xl px-space-md pt-3 pb-4" style={{ bottom: 'var(--tabbar-total)' }}>
      <div className="w-full flex justify-center py-1">
        <div className="w-12 h-1.5 rounded-full bg-surface-container-highest" />
      </div>
      <div className="flex items-center justify-between mt-2 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-primary text-[20px]">near_me</span>
          <span className="font-headline-sm text-headline-sm text-on-surface font-bold">{title}</span>
        </div>
        {chip === 'fuel' ? <span className="font-label-md text-label-sm text-on-surface-variant">Sorted by lowest {gradeLabel}</span> : null}
      </div>
      {!signedIn ? (
        <button type="button" onClick={onPlugClick} data-act="create-account" className="mb-3 min-h-12 w-full rounded-xl bg-primary-container px-3 text-left font-bold text-on-primary">
          Create an account to pin price updates and save your car
        </button>
      ) : null}
      {top ? <StationHero station={top} grade={grade} cheapest /> : null}
      {emptyPlaces || emptyFuel ? (
        <div className="mb-3">
          <p className="text-sm">{kind?.empty || 'Nothing is mapped near you yet'}</p>
          <button type="button" onClick={onPlugClick} data-act="map-one" data-kind={chip || undefined} className="pressable mt-2 min-h-12 rounded-xl bg-primary px-4 font-bold text-on-primary">
            Map one
          </button>
        </div>
      ) : null}
      {facilities.map((hit) => {
        const attached = hit.display_name && hit.display_name !== hit.place_name;
        const label = attached ? `${hit.display_name} · at ${hit.place_name}` : hit.place_name;
        return (
          <button key={`${hit.place_id}-${hit.facility}-${label}`} type="button" onClick={onPlugClick} data-act="open-facility" data-place-id={hit.place_id} data-facility={hit.facility} className="mb-2 flex min-h-12 w-full items-center gap-2 rounded-xl bg-surface-container-lowest p-3 text-left shadow-sm">
            <span className="material-symbols-outlined text-primary">place</span>
            <span className="font-bold">{label}</span>
          </button>
        );
      })}
      {showPlaces ? places.map((place) => (
        <button key={place.id} type="button" onClick={onPlugClick} data-act="open-place" data-station-id={place.id} className="mb-2 flex min-h-12 w-full items-center gap-2 rounded-xl bg-surface-container-lowest p-3 text-left shadow-sm">
          <span className="material-symbols-outlined text-primary">{chipById(chips, place.kind)?.icon || 'place'}</span>
          <span className="font-bold">{place.name}</span>
        </button>
      )) : null}
      {chip === 'fuel' ? places.filter((place) => place.kind === 'fuel').map((place) => (
        <button key={place.id} type="button" onClick={onPlugClick} data-act="open-place" data-station-id={place.id} className="mb-2 flex min-h-12 w-full items-center gap-2 rounded-xl bg-surface-container-lowest p-3 text-left shadow-sm">
          <span className="material-symbols-outlined text-primary">local_gas_station</span>
          <span className="font-bold">{place.name}</span>
          <span className="ml-auto text-sm text-on-surface-variant">No price yet</span>
        </button>
      )) : null}
      {chip === 'toll' ? (
        <button type="button" onClick={onPlugClick} data-act="toll-rates" className="mb-2 min-h-12 w-full rounded-xl bg-surface-container-high px-3 text-left font-bold">
          See toll rates
        </button>
      ) : null}
      {rest.length ? (
        <div className="flex items-center justify-between">
          <span className="font-label-lg text-label-md font-bold uppercase text-on-surface-variant">{chip === 'fuel' ? 'Other gas plugs nearby' : 'Fuel prices'}</span>
        </div>
      ) : null}
      {rest.map((row) => (
        <NearbyStationCard key={row.id} station={row} grade={grade} />
      ))}
    </div>
  );
}

function StationHero({ station, grade, cheapest }: { station: Station; grade: string; cheapest: boolean }) {
  const quote = readPumpQuote(station.prices, grade);
  const price = quote.price;
  const tone = confidenceTone(quote);
  const conf = confidenceLabel(quote);
  const age = relativeAge(quote.observedAt || station.price_updated_at);
  const confLine = [conf, age].filter(Boolean).join(' • ');
  const distance = Number.isFinite(station.lat) && Number.isFinite(station.lng) ? kmLabel(station.lat, station.lng) : null;
  const hasPrice = price != null && Number.isFinite(price);

  return (
    <div
      className="bg-surface-container-lowest rounded-xl p-space-md shadow-md flex flex-col gap-3 relative overflow-hidden transition-all mb-space-md"
      data-live-name={station.name}
      data-live-row="station"
    >
      {cheapest ? <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary to-secondary-container" /> : null}
      <div className="flex items-start justify-between gap-space-xs pt-0.5">
        <div className="flex items-center gap-2.5">
          <div className="w-11 h-11 rounded-lg bg-surface-container-high flex items-center justify-center text-primary font-headline-sm shrink-0">
            <span className="material-symbols-outlined text-[24px]">local_gas_station</span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {cheapest ? (
                <span className="px-2 py-0.5 rounded-full bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]" style={{ fontVariationSettings: "'FILL' 1" }}>stars</span>
                  CHEAPEST
                </span>
              ) : null}
              {distance ? <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">{distance}</span> : null}
            </div>
            <h3 className="font-headline-sm text-headline-sm text-on-surface truncate mt-0.5">{station.name}</h3>
          </div>
        </div>
        <div className="text-right shrink-0">
          {hasPrice ? (
            <>
              <div className="font-headline-lg text-headline-lg text-primary tabular-nums tracking-tight">{moneyJmd(price)}</div>
              <span className="font-label-sm text-label-sm text-on-surface-variant">per Litre</span>
            </>
          ) : (
            <div className="font-body-md text-body-md text-on-surface-variant italic">No price yet</div>
          )}
        </div>
      </div>
      {confLine ? (
        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-container-low text-on-surface-variant">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-2 h-2 rounded-full shrink-0 ${tone === 'outdated' ? 'bg-outline' : confidenceDotClass(tone).split(' ')[0] || 'bg-secondary-container'}`} />
            <span className="font-body-sm text-body-sm text-on-surface truncate">{confLine}</span>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-space-xs pt-1">
        <button type="button" onClick={onPlugClick} data-station-id={station.id} data-act="drive-now" className="h-12 rounded-xl bg-primary text-on-primary font-label-lg text-label-lg flex items-center justify-center gap-2 active:bg-primary-container transition-all shadow-sm">
          <span className="material-symbols-outlined text-[18px]">near_me</span>
          <span>Drive now</span>
        </button>
        <button type="button" onClick={onPlugClick} data-station-id={station.id} data-act="log-fill" className="h-12 rounded-xl bg-surface-container-high text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-2 active:bg-surface-variant transition-colors">
          <span className="material-symbols-outlined text-[18px] text-secondary">local_gas_station</span>
          <span>Log fill-up</span>
        </button>
      </div>
    </div>
  );
}

function NearbyStationCard({ station, grade }: { station: Station; grade: string }) {
  const quote = readPumpQuote(station.prices, grade);
  const price = quote.price;
  const tone = confidenceTone(quote);
  const conf = confidenceLabel(quote);
  const age = relativeAge(quote.observedAt || station.price_updated_at);
  const confLine = [conf, age].filter(Boolean).join(' • ');
  const distance = Number.isFinite(station.lat) && Number.isFinite(station.lng) ? kmLabel(station.lat, station.lng) : null;
  const outdated = tone === 'outdated';
  const hasPrice = price != null && Number.isFinite(price);

  if (outdated && hasPrice) {
    return (
      <div className="bg-surface-container-high rounded-xl p-space-md flex flex-col gap-3 relative transition-all mt-2" data-live-name={station.name} data-live-row="station">
        <div className="flex items-start justify-between gap-space-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-outline shrink-0">
              <span className="material-symbols-outlined text-[20px]">history_toggle_off</span>
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-label-sm flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">schedule</span>
                  {conf || "Last week's rate"}
                </span>
                {distance ? <span className="font-label-sm text-label-sm text-on-surface-variant">{distance}</span> : null}
              </div>
              <h4 className="font-headline-sm text-label-lg text-on-surface truncate mt-0.5">{station.name}</h4>
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-headline-sm text-headline-sm text-on-surface-variant tabular-nums line-through opacity-70">{moneyJmd(price)}</div>
            <span className="font-label-sm text-label-sm text-on-surface-variant">unconfirmed</span>
          </div>
        </div>
        <button type="button" onClick={onPlugClick} data-station-id={station.id} data-act="log-fill" className="w-full h-11 rounded-xl bg-surface-container-lowest text-primary font-label-lg text-label-lg flex items-center justify-center gap-1.5 active:bg-surface-container transition-colors shadow-sm">
          <span className="material-symbols-outlined text-[18px]">edit_calendar</span>
          <span>Update This Price</span>
        </button>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm flex flex-col gap-3 relative overflow-hidden transition-all mt-2" data-live-name={station.name} data-live-row="station">
      <div className="flex items-start justify-between gap-space-xs">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center text-primary shrink-0">
            <span className="material-symbols-outlined text-[20px]">local_gas_station</span>
          </div>
          <div className="flex flex-col min-w-0">
            {distance ? <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">{distance}</span> : null}
            <button type="button" onClick={onPlugClick} data-station-id={station.id} data-act="open-station" className="font-headline-sm text-headline-sm text-on-surface truncate text-left">
              {station.name}
            </button>
          </div>
        </div>
        <div className="text-right shrink-0">
          {hasPrice ? (
            <>
              <div className="font-headline-sm text-headline-sm text-on-surface tabular-nums tracking-tight">{moneyJmd(price)}</div>
              <span className="font-label-sm text-label-sm text-on-surface-variant">per Litre</span>
            </>
          ) : (
            <span className="font-body-sm text-body-sm text-on-surface-variant italic">No price yet</span>
          )}
        </div>
      </div>
      {confLine ? (
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-container-low text-on-surface-variant">
          <span className={`w-2 h-2 rounded-full shrink-0 ${confidenceDotClass(tone).split(' ')[0] || 'bg-outline'}`} />
          <span className="font-body-sm text-body-sm text-on-surface truncate">{confLine}</span>
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-space-xs">
        <button type="button" onClick={onPlugClick} data-station-id={station.id} data-act="drive-now" className="h-11 rounded-xl bg-surface-container-high text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-1.5">
          <span className="material-symbols-outlined text-[18px]">near_me</span>
          <span>Drive now</span>
        </button>
        <button type="button" onClick={onPlugClick} data-station-id={station.id} data-act="log-fill" className="h-11 rounded-xl bg-surface-container-high text-on-surface font-label-lg text-label-lg flex items-center justify-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] text-secondary">local_gas_station</span>
          <span>Log fill-up</span>
        </button>
      </div>
    </div>
  );
}
