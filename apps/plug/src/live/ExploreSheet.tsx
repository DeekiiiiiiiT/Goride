import { useEffect, useState } from 'react';
import { placeKind } from '@roam/plug-core';
import { publicGet } from '../api';
import { writeStationCache } from '../offline';
import { onPlugClick } from '../shell/actions';

type Station = {
  id: string;
  name: string;
  brand?: string;
  lat: number;
  lng: number;
  pcode?: string;
  prices?: Record<string, number>;
};

type Place = { id: string; name: string; kind: string; lat: number; lng: number };

function priceOf(row: Station, grade: string): number {
  return Number(row.prices?.[grade] ?? Number.POSITIVE_INFINITY);
}

export function ExploreSheet() {
  const [grade, setGrade] = useState(sessionStorage.getItem('plug-grade') || 'e10_87');
  const [chip, setChip] = useState(sessionStorage.getItem('plug-chip') || '');
  const [stations, setStations] = useState<Station[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [signedIn, setSignedIn] = useState(document.body.dataset.signedIn === '1');

  useEffect(() => {
    const load = () => {
      setGrade(sessionStorage.getItem('plug-grade') || 'e10_87');
      const next = sessionStorage.getItem('plug-chip') || '';
      setChip(next);
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
    };
    load();
    window.addEventListener('plug-refresh', load);
    return () => window.removeEventListener('plug-refresh', load);
  }, []);

  const kind = placeKind(chip);
  const title = !chip ? 'All near you' : (kind?.label || 'Nearby places');
  const ranked = [...stations].sort((a, b) => priceOf(a, grade) - priceOf(b, grade));
  const priced = ranked.filter((row) => priceOf(row, grade) < Number.POSITIVE_INFINITY);
  const top = chip === 'fuel' ? priced[0] : undefined;
  const rest = chip === 'fuel' ? ranked.filter((row) => row.id !== top?.id) : (!chip ? ranked : []);
  const gradeLabel = grade === 'e10_90' ? 'E-10 90' : grade === 'diesel' ? 'Diesel' : 'E-10 87';
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
      {top ? <StationHero station={top} grade={grade} gradeLabel={gradeLabel} cheapest /> : null}
      {emptyPlaces || emptyFuel ? (
        <div className="mb-3">
          <p className="text-sm">{kind?.empty || 'Nothing is mapped near you yet'}</p>
          <button type="button" onClick={onPlugClick} data-act="map-one" data-kind={chip || undefined} className="pressable mt-2 min-h-12 rounded-xl bg-primary px-4 font-bold text-on-primary">
            Map one
          </button>
        </div>
      ) : null}
      {showPlaces ? places.map((place) => (
        <button key={place.id} type="button" onClick={onPlugClick} data-act="open-place" data-station-id={place.id} className="mb-2 flex min-h-12 w-full items-center gap-2 rounded-xl bg-surface-container-lowest p-3 text-left shadow-sm">
          <span className="material-symbols-outlined text-primary">{placeKind(place.kind)?.icon || 'place'}</span>
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
        <button key={row.id} type="button" onClick={onPlugClick} data-station-id={row.id} data-act="open-station" data-live-name={row.name} data-live-row="station" className="mt-2 flex min-h-12 w-full items-center justify-between gap-2 rounded-xl bg-surface-container-lowest p-3 text-left shadow-sm">
          <span className="material-symbols-outlined text-primary">local_gas_station</span>
          <span className="flex-1 font-bold">{row.name}</span>
          <span>{priceOf(row, grade) < Number.POSITIVE_INFINITY ? `J$${priceOf(row, grade).toFixed(2)}` : 'No price yet'}</span>
        </button>
      ))}
    </div>
  );
}

function StationHero({ station, grade, gradeLabel, cheapest }: { station: Station; grade: string; gradeLabel: string; cheapest: boolean }) {
  const price = priceOf(station, grade);
  return (
    <div className="w-full rounded-2xl bg-surface-container-lowest p-space-md shadow-md mb-space-md" data-live-name={station.name} data-live-row="station">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="material-symbols-outlined text-primary">local_gas_station</span>
          <div>
            <div className="font-bold">{station.name}</div>
            {cheapest ? <span className="text-[12px] font-bold text-on-tertiary-fixed">Cheapest {gradeLabel}</span> : null}
          </div>
        </div>
        <div className="text-right font-bold text-primary">{Number.isFinite(price) && price < Number.POSITIVE_INFINITY ? `J$${price.toFixed(2)}` : 'No price yet'}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onPlugClick} data-station-id={station.id} data-act="drive-now" className="h-11 min-h-[44px] rounded-xl bg-primary text-on-primary font-bold">Drive now</button>
        <button type="button" onClick={onPlugClick} data-station-id={station.id} data-act="log-fill" className="h-11 min-h-[44px] rounded-xl bg-surface-container-high font-bold">Log fill-up</button>
      </div>
    </div>
  );
}
