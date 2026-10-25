import { useEffect, useState } from 'react';
import { plugSend, publicGet } from '../api';
import { demoOn } from '../demo/mode';
import { readDb } from '../demo/store';
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
  const [chip, setChip] = useState(sessionStorage.getItem('plug-chip') || 'fuel');
  const [stations, setStations] = useState<Station[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [signedIn, setSignedIn] = useState(sessionStorage.getItem('plug-demo-signed-in') === '1');
  const [carName, setCarName] = useState<string | null>(null);

  useEffect(() => {
    const load = () => {
      setGrade(sessionStorage.getItem('plug-grade') || 'e10_87');
      setChip(sessionStorage.getItem('plug-chip') || 'fuel');
      const signed = sessionStorage.getItem('plug-demo-signed-in') === '1' || document.body.dataset.signedIn === '1';
      setSignedIn(signed);
      if (demoOn()) {
        const db = readDb();
        const picked = db.vehicles.find((row) => row.id === sessionStorage.getItem('plug-vehicle')) || db.vehicles[0];
        setCarName(signed ? picked?.nickname || null : null);
      } else if (signed) {
        void plugSend<{ vehicles: { id: string; nickname?: string; make?: string; model?: string }[] }>('/garage', 'GET')
          .then((body) => {
            const car = body.vehicles?.[0];
            if (car?.id) sessionStorage.setItem('plug-vehicle', car.id);
            setCarName(car ? (car.nickname || `${car.make || ''} ${car.model || ''}`.trim()) : null);
          })
          .catch(() => setCarName(null));
      } else setCarName(null);
      void publicGet<{ stations: Station[] }>('/stations').then((body) => setStations(body.stations || [])).catch(() => setStations([]));
      const kind = sessionStorage.getItem('plug-chip');
      if (kind && kind !== 'fuel') {
        void publicGet<{ places: Place[] }>(`/places?kind=${encodeURIComponent(kind)}`).then((body) => setPlaces(body.places || [])).catch(() => setPlaces([]));
      } else setPlaces([]);
    };
    load();
    window.addEventListener('plug-refresh', load);
    return () => window.removeEventListener('plug-refresh', load);
  }, []);

  const ranked = [...stations].sort((a, b) => priceOf(a, grade) - priceOf(b, grade));
  const top = ranked[0];
  const rest = ranked.slice(1);
  const gradeLabel = grade === 'e10_90' ? 'E-10 90' : grade === 'diesel' ? 'Diesel' : 'E-10 87';

  return (
    <div className="relative z-30 flex flex-col w-full -mt-4 bg-surface rounded-t-3xl shadow-2xl px-space-md pt-3 pb-8">
      <div className="w-full flex justify-center py-1">
        <div className="w-12 h-1.5 rounded-full bg-surface-container-highest" />
      </div>
      <div className="flex items-center justify-between mt-2 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="material-symbols-outlined text-primary text-[20px]">near_me</span>
          <span className="font-headline-sm text-headline-sm text-on-surface font-bold">{chip === 'fuel' ? 'Pump Highlights' : 'Nearby places'}</span>
        </div>
        <span className="font-label-md text-label-sm text-on-surface-variant">Sorted by lowest {gradeLabel}</span>
      </div>
      {!signedIn ? (
        <button type="button" onClick={onPlugClick} data-act="sign-up-with-phone" className="mb-3 min-h-12 w-full rounded-xl bg-primary-container px-3 text-left font-bold text-on-primary">
          Create an account to pin price updates and save your car
        </button>
      ) : null}
      {chip === 'fuel' && top ? <StationHero station={top} grade={grade} gradeLabel={gradeLabel} cheapest /> : null}
      {signedIn && carName ? (
        <button type="button" onClick={onPlugClick} data-act="my-car" className="w-full rounded-xl bg-surface-container-high p-3 mb-space-md flex items-center justify-between text-left">
          <span>
            <span className="block font-bold">{carName}</span>
            <span className="text-sm text-tertiary">{sessionStorage.getItem('plug-care') || (demoOn() ? 'Oil change due soon' : 'Open the garage for service dates')}</span>
          </span>
          <span className="font-bold text-primary">Garage</span>
        </button>
      ) : null}
      {chip !== 'fuel' ? places.map((place) => (
        <button key={place.id} type="button" onClick={onPlugClick} data-act="open-place" data-station-id={place.id} className="mb-2 min-h-12 w-full rounded-xl bg-surface-container-lowest p-3 text-left shadow-sm">
          {place.name}
        </button>
      )) : null}
      <div className="flex items-center justify-between">
        <span className="font-label-lg text-label-md font-bold uppercase text-on-surface-variant">Other gas plugs nearby</span>
        <button type="button" onClick={onPlugClick} data-act="see-all" className="min-h-9 font-bold text-primary">See all</button>
      </div>
      {rest.map((row) => (
        <button key={row.id} type="button" onClick={onPlugClick} data-station-id={row.id} data-act="open-station" className="mt-2 flex w-full items-center justify-between rounded-xl bg-surface-container-lowest p-3 text-left shadow-sm">
          <span className="font-bold">{row.name}</span>
          <span>{priceOf(row, grade) < Number.POSITIVE_INFINITY ? `J$${priceOf(row, grade).toFixed(2)}` : ''}</span>
        </button>
      ))}
    </div>
  );
}

function StationHero({ station, grade, gradeLabel, cheapest }: { station: Station; grade: string; gradeLabel: string; cheapest: boolean }) {
  const price = priceOf(station, grade);
  return (
    <div className="w-full rounded-2xl bg-surface-container-lowest p-space-md shadow-md mb-space-md">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-bold">{station.name}</div>
          {cheapest ? <span className="text-[10px] font-bold text-on-tertiary-fixed">Cheapest {gradeLabel}</span> : null}
        </div>
        <div className="text-right font-bold text-primary">{Number.isFinite(price) ? `J$${price.toFixed(2)}` : '—'}</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button type="button" onClick={onPlugClick} data-station-id={station.id} data-act="drive-now" className="h-11 min-h-[44px] rounded-xl bg-primary text-on-primary font-bold">Drive now</button>
        <button type="button" onClick={onPlugClick} data-station-id={station.id} data-act="log-fill" className="h-11 min-h-[44px] rounded-xl bg-surface-container-high font-bold">Log fill-up</button>
      </div>
    </div>
  );
}
