import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FuelGradeChip, GpsAccuracyIndicator, MaintenanceStatusPill, PartsTierHeader, PendingDashedPin, PriceBubblePin } from '../../../packages/ui/src/plug-kit';
import { CatalogSearchPicker } from '../../../packages/ui/src/catalog-search-picker';
import { OdometerScanner } from '../../../packages/ui/src/odometer-scanner';
import { documentStatus, priceAgeLabel, contributorLevel } from '@roam/plug-core';
import { Frame, Notice } from './Shell';
import { googleDirections, plugSend, publicGet, wazeDirections } from './api';
import { useAuth } from './auth';
import { enqueue, readQueue, removeJob } from './offline';
import { enablePlugPush } from './push';
import type { PlugFlag } from '@roam/plug-core';

function Gate({ flag, children }: { flag: PlugFlag; children: ReactNode }) {
  const { flagOn, session } = useAuth();
  if (!flagOn(flag)) return <Notice kind="empty" text="This section is turned off." />;
  if (!session && flag !== 'plug.explore' && flag !== 'plug.tolls') {
    return <Notice kind="empty" text="Sign in to use this." />;
  }
  return <>{children}</>;
}

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    publicGet<T>(path).then((value) => { if (live) setData(value); }).catch((err: unknown) => {
      if (live) setError(err instanceof Error ? err.message : 'Something went wrong');
    }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [path]);
  return { data, error, loading };
}

export function Splash() {
  return (
    <Frame title="Roam Plug" action={{ label: 'Continue', onClick: () => { window.location.hash = '#/welcome'; } }}>
      <p>Plugged into every road in Jamaica. Free.</p>
    </Frame>
  );
}

export function Welcome() {
  const navigate = useNavigate();
  return <Frame title="Welcome" action={{ label: 'How it works', onClick: () => navigate('/how') }}><p>Log fuel. See prices. Keep your car on schedule.</p></Frame>;
}
export function HowItWorks() {
  const navigate = useNavigate();
  return <Frame title="How it works" action={{ label: 'Create account', onClick: () => navigate('/signup') }}><ol className="list-decimal space-y-2 pl-5 text-sm"><li>See fuel prices near you.</li><li>Log a fill. We remember the odometer.</li><li>Pin a shop when you are standing there.</li></ol></Frame>;
}

export function SignUp() {
  const { sendCode } = useAuth();
  const [phone, setPhone] = useState('+1876');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  return (
    <Frame title="Your phone" action={{ label: 'Send code', onClick: () => { void sendCode(phone).then(() => navigate(`/otp?phone=${encodeURIComponent(phone)}`)).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not send the code')); } }}>
      <input className="tap w-full rounded-xl border border-line px-3" value={phone} onChange={(event) => setPhone(event.target.value)} inputMode="tel" aria-label="Phone" />
      {error ? <Notice kind="error" text={error} /> : null}
    </Frame>
  );
}

export function Otp() {
  const { verifyCode } = useAuth();
  const [params] = useSearchParams();
  const phone = params.get('phone') || '';
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  return (
    <Frame title="Enter the code" action={{ label: 'Verify', onClick: () => { void verifyCode(phone, code).then(() => navigate('/profile')).catch((err: unknown) => setError(err instanceof Error ? err.message : 'That code did not work')); } }}>
      <input className="tap w-full rounded-xl border border-line px-3" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" aria-label="Code" />
      {error ? <Notice kind="error" text={error} /> : null}
    </Frame>
  );
}

export function Profile() {
  const [name, setName] = useState('');
  const navigate = useNavigate();
  return <Frame title="Your name" action={{ label: 'Continue', onClick: () => { sessionStorage.setItem('plug-name', name); navigate('/consent'); } }}><input className="tap w-full rounded-xl border border-line px-3" value={name} onChange={(event) => setName(event.target.value)} aria-label="Name" /></Frame>;
}

export function Consent() {
  const [ok, setOk] = useState(false);
  const navigate = useNavigate();
  return (
    <Frame title="Privacy" action={{ label: 'I agree', onClick: () => { if (!ok) return; void plugSend('/profile', 'POST', { displayName: sessionStorage.getItem('plug-name'), consent: true }).finally(() => navigate('/permissions')); } }}>
      <p className="text-sm">Roam Plug stores your garage and fuel logs for you. The public map only shows approved places, never your name or your trail.</p>
      <label className="tap flex items-center gap-3 text-sm"><input type="checkbox" checked={ok} onChange={(event) => setOk(event.target.checked)} /> I agree to location use when I log fuel or pin a place.</label>
    </Frame>
  );
}

export function Permissions() {
  const navigate = useNavigate();
  return <Frame title="Permissions" action={{ label: 'Allow location', onClick: () => { void navigator.geolocation?.getCurrentPosition(() => undefined); navigate('/garage/add'); } }}><p className="text-sm">Location is used at the pump and when you pin a place. You can browse prices without it.</p></Frame>;
}

export function AddMake() {
  const navigate = useNavigate();
  return (
    <Frame title="Add your vehicle">
      <CatalogSearchPicker
        onSearch={async (query) => {
          const body = await publicGet<{ vehicles: { id: string; make: string; model: string; year: number }[] }>(`/vehicle-catalog?q=${encodeURIComponent(query)}`);
          return (body.vehicles || []).map((row) => ({ id: row.id, label: `${row.year} ${row.make} ${row.model}` }));
        }}
        onPick={(hit) => navigate(`/garage/add/odometer?variant=${hit.id}&label=${encodeURIComponent(hit.label)}`)}
        onMissing={() => navigate('/garage/add/missing')}
      />
    </Frame>
  );
}

export function ModelYear() {
  const [params] = useSearchParams();
  const make = params.get('make') || '';
  return <AddMake key={make} />;
}

export function MissingCar() {
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const navigate = useNavigate();
  return <Frame title="Request this car" action={{ label: 'Continue', onClick: () => navigate(`/garage/add/odometer?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`) }}><input className="tap w-full rounded-xl border px-3" placeholder="Make" value={make} onChange={(e) => setMake(e.target.value)} /><input className="tap w-full rounded-xl border px-3" placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} /></Frame>;
}

export function StartingOdo() {
  const [params] = useSearchParams();
  const [odo, setOdo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  return (
    <Frame title="Starting odometer" action={{ label: 'Save vehicle', onClick: () => {
      void plugSend('/vehicles', 'POST', {
        catalogVariantId: params.get('variant'),
        make: params.get('make'),
        model: params.get('model'),
        nickname: params.get('label'),
        startingOdometer: Number(odo),
      }).then(() => navigate('/garage/added')).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not save'));
    } }}>
      <input className="tap w-full rounded-xl border px-3" inputMode="decimal" aria-label="Odometer" value={odo} onChange={(e) => setOdo(e.target.value)} />
      {error ? <Notice kind="error" text={error} /> : null}
    </Frame>
  );
}

export function VehicleAdded() {
  return <Frame title="Vehicle added"><p>You can log fuel now. If the car was not in the catalog, Dominion will add it.</p><Link className="tap inline-flex text-primary" to="/garage">Go to garage</Link></Frame>;
}

export function Login() {
  return <SignUp />;
}

type Station = { id: string; name: string; brand?: string; lat: number; lng: number; pcode?: string; prices: Record<string, number>; price_updated_at?: string };

export function Explore() {
  const load = useLoad<{ stations: Station[] }>('/stations');
  return (
      <Frame title="Explore">
        {load.loading ? <Notice kind="loading" text="Loading stations…" /> : null}
        {load.error ? <Notice kind="error" text={load.error} /> : null}
        {load.data && load.data.stations.length === 0 ? <Notice kind="empty" text="No verified stations on the map yet." /> : null}
        <ul className="space-y-3">
          {(load.data?.stations || []).map((station) => {
            const price = station.prices?.e10_87;
            return (
              <li key={station.id} className="rounded-xl bg-surface p-3 ring-1 ring-line">
                <div className="flex items-center justify-between gap-2">
                  <Link to={`/stations/${station.id}`} className="font-semibold">{station.name}</Link>
                  {price ? <PriceBubblePin price={`J$${price.toFixed(2)}`} /> : null}
                </div>
                <p className="text-xs text-neutral">{station.price_updated_at ? priceAgeLabel(station.price_updated_at, new Date().toISOString()) : 'No price yet'}</p>
              </li>
            );
          })}
        </ul>
      </Frame>
  );
}

export function Guest() {
  return <Frame title="Guest"><p className="text-sm">You can look at prices without an account. Logging fuel and pinning places need a sign-in.</p><Link className="text-primary" to="/signup">Sign up</Link></Frame>;
}

export function StationListPage() {
  return <Explore />;
}

export function Filters() {
  return <Frame title="Filters"><p className="text-sm">Filter by grade and parish from the map once places are loaded. Parishes come from Dominion, not a typed list.</p></Frame>;
}

export function StationDetail() {
  const { id } = useParams();
  const load = useLoad<{ station: Station }>(`/stations/${id}`);
  const station = load.data?.station;
  return (
    <Frame title={station?.name || 'Station'}>
      {load.loading ? <Notice kind="loading" text="Loading station…" /> : null}
      {load.error ? <Notice kind="error" text={load.error} /> : null}
      {station ? (
        <div className="space-y-3">
          <FuelGradeChip grade="e10_87" price={station.prices.e10_87 ? `J$${station.prices.e10_87}` : undefined} />
          <FuelGradeChip grade="e10_90" price={station.prices.e10_90 ? `J$${station.prices.e10_90}` : undefined} />
          <FuelGradeChip grade="diesel" price={station.prices.diesel ? `J$${station.prices.diesel}` : undefined} />
          <Link className="tap flex items-center text-primary" to={`/stations/${station.id}/directions`}>Directions</Link>
        </div>
      ) : null}
    </Frame>
  );
}

export function PlaceDetail() {
  const { id } = useParams();
  const load = useLoad<{ place: { name: string; kind: string; lat: number; lng: number; details: { hours?: string; phone?: string; services?: string[] } } }>(`/places/${id}`);
  const place = load.data?.place;
  return (
    <Frame title={place?.name || 'Place'}>
      {load.loading ? <Notice kind="loading" text="Loading place…" /> : null}
      {load.error ? <Notice kind="error" text={load.error} /> : null}
      {!load.loading && !place ? <Notice kind="empty" text="This place is not public yet." /> : null}
      {place ? <p className="text-sm">{place.kind}. {place.details?.phone || 'No phone yet.'}</p> : null}
    </Frame>
  );
}

export function PendingPlace() {
  return <Frame title="Your pin"><PendingDashedPin /><p className="text-sm">Submitted — awaiting approval. Only you can see this until it is approved.</p></Frame>;
}

export function Tolls() {
  const load = useLoad<{ plazas: { id: string; name: string; highway: string | null; prices: unknown }[] }>('/tolls');
  return (
      <Frame title="Tolls">
        {load.loading ? <Notice kind="loading" text="Loading tolls…" /> : null}
        {load.error ? <Notice kind="error" text={load.error} /> : null}
        {load.data && load.data.plazas.length === 0 ? <Notice kind="empty" text="No toll plazas published yet." /> : null}
        <ul>{(load.data?.plazas || []).map((plaza) => <li key={plaza.id} className="py-2 text-sm">{plaza.name} · {plaza.highway}</li>)}</ul>
      </Frame>
  );
}

export function Search() {
  const [q, setQ] = useState('');
  const load = useLoad<{ stations: Station[] }>('/stations');
  const query = q.trim().toLowerCase();
  const rows = (load.data?.stations || []).filter((station) => !query || station.name.toLowerCase().includes(query) || (station.brand || '').toLowerCase().includes(query));
  return (
    <Frame title="Search">
      <input className="tap w-full rounded-xl border px-3" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
      {load.loading ? <Notice kind="loading" text="Loading stations…" /> : null}
      {load.error ? <Notice kind="error" text={load.error} /> : null}
      {!load.loading && rows.length === 0 ? <Notice kind="empty" text="No matching station." /> : null}
      <ul className="space-y-2">
        {rows.map((station) => <li key={station.id}><Link className="tap flex items-center" to={`/stations/${station.id}`}>{station.name}</Link></li>)}
      </ul>
    </Frame>
  );
}

export function FuelScan() {
  const navigate = useNavigate();
  return (
    <Gate flag="plug.fuel_log">
      <Frame title="Odometer">
        <OdometerScanner
          isFleetDriver={false}
          onCancel={() => navigate('/explore')}
          onScanComplete={(result) => navigate(`/fuel/details?odo=${result.reading}`)}
        />
      </Frame>
    </Gate>
  );
}

export function FuelConfirm() {
  const [odo, setOdo] = useState('');
  const navigate = useNavigate();
  return <Frame title="Confirm odometer" action={{ label: 'Continue', onClick: () => navigate(`/fuel/details?odo=${odo}`) }}><input className="tap w-full rounded-xl border px-3" inputMode="decimal" value={odo} onChange={(e) => setOdo(e.target.value)} aria-label="Odometer" /></Frame>;
}

export function FuelDetails() {
  const [params] = useSearchParams();
  const [litres, setLitres] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<{ id: string; nickname: string | null }[]>([]);
  const [vehicleId, setVehicleId] = useState('');
  const [fix, setFix] = useState<{ lat: number; lng: number; accuracy: number; mocked: boolean } | null>(null);
  const [gpsNote, setGpsNote] = useState<string | null>(null);
  const navigate = useNavigate();
  useEffect(() => { void plugSend<{ vehicles: { id: string; nickname: string | null }[] }>('/garage', 'GET').then((body) => { setVehicles(body.vehicles); setVehicleId(body.vehicles[0]?.id || ''); }).catch(() => setVehicles([])); }, []);
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsNote('Location is off, so the station price will not update.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setFix({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        mocked: Boolean((pos.coords as GeolocationCoordinates & { mocked?: boolean }).mocked),
      }),
      () => setGpsNote('Location is off, so the station price will not update.'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }, []);
  return (
    <Frame title="Fuel details" action={{ label: 'Save', onClick: () => {
      const body = {
        vehicleId,
        litres: Number(litres),
        amount: Number(amount),
        odometer: Number(params.get('odo')),
        grade: 'e10_87',
        clientId: crypto.randomUUID(),
        lat: fix?.lat,
        lng: fix?.lng,
        accuracyM: fix?.accuracy,
        mockLocation: fix?.mocked || params.get('mock') === '1',
      };
      const save = () => plugSend<SavedFill>('/fuel-logs', 'POST', body);
      if (!navigator.onLine) { enqueue('/fuel-logs', body); navigate('/fuel/offline'); return; }
      void save().then((saved) => navigate('/fuel/saved', { state: saved })).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not save'));
    } }}>
      {vehicles.length === 0 ? <Notice kind="empty" text="Add a vehicle before logging fuel." /> : null}
      <select className="tap w-full rounded-xl border px-3" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} aria-label="Vehicle">{vehicles.map((v) => <option key={v.id} value={v.id}>{v.nickname || 'Vehicle'}</option>)}</select>
      <input className="tap w-full rounded-xl border px-3" placeholder="Litres" value={litres} onChange={(e) => setLitres(e.target.value)} />
      <input className="tap w-full rounded-xl border px-3" placeholder="Amount J$" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <GpsAccuracyIndicator meters={fix?.accuracy ?? null} />
      {gpsNote ? <p className="text-sm">{gpsNote}</p> : null}
      {error ? <Notice kind="error" text={error} /> : null}
    </Frame>
  );
}

type SavedFill = {
  odometer?: number;
  kmPerLitre?: number | null;
  nextServiceOn?: string | null;
  priceUpdated?: boolean;
  locationUsed?: boolean;
};

export function FuelSaved() {
  const saved = (useLocation().state || {}) as SavedFill;
  const when = saved.nextServiceOn ? new Date(saved.nextServiceOn).toLocaleDateString() : null;
  const mileage = saved.kmPerLitre == null ? 'Log another fill to see km per litre.' : `${saved.kmPerLitre.toFixed(1)} km/L`;
  const price = saved.locationUsed
    ? (saved.priceUpdated ? 'The station price was updated.' : 'The station price was not published from this fill.')
    : 'Location was off, so the station price was not updated.';
  return (
    <Frame title="Saved">
      <p>Odometer {saved.odometer ?? '—'} km.</p>
      <p>{mileage}</p>
      <p>{when ? `Next service ${when}.` : 'Next service will show after this fill syncs.'}</p>
      <p>{price}</p>
    </Frame>
  );
}
export function FuelOffline() {
  return <Frame title="Saved on this phone"><p>This fill will sync when you are back online. It never goes into a fleet fuel log.</p></Frame>;
}

export function Garage() {
  const [vehicles, setVehicles] = useState<{ id: string; nickname: string | null; year: number | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void plugSend<{ vehicles: { id: string; nickname: string | null; year: number | null }[] }>('/garage', 'GET').then((body) => setVehicles(body.vehicles)).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load garage')); }, []);
  return (
    <Gate flag="plug.garage">
      <Frame title="My garage">
        {vehicles === null && !error ? <Notice kind="loading" text="Loading your vehicles…" /> : null}
        {error ? <Notice kind="error" text={error} /> : null}
        {vehicles && vehicles.length === 0 ? <Notice kind="empty" text="No vehicles yet." /> : null}
        <ul>{(vehicles || []).map((v) => <li key={v.id}><Link className="tap flex items-center" to={`/garage/${v.id}`}>{v.nickname || 'Vehicle'}</Link></li>)}</ul>
        <Link className="tap inline-flex text-primary" to="/garage/add">Add a vehicle</Link>
      </Frame>
    </Gate>
  );
}

export function VehicleOverview() {
  const { id } = useParams();
  const [care, setCare] = useState<{ kmPerLitre: number | null; dueOn: string | null; status: 'overdue' | 'due_soon' | 'upcoming' | 'done' } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void plugSend<{ kmPerLitre: number | null; dueOn: string | null; status: 'overdue' | 'due_soon' | 'upcoming' | 'done' }>(`/care?vehicleId=${id}`, 'GET')
      .then(setCare)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load this vehicle'));
  }, [id]);
  const when = care?.dueOn ? new Date(care.dueOn).toLocaleDateString() : null;
  return (
    <Frame title="Vehicle">
      <p className="text-sm">General schedule — a schedule for your exact car is coming.</p>
      {care === null && !error ? <Notice kind="loading" text="Loading mileage…" /> : null}
      {error ? <Notice kind="error" text={error} /> : null}
      {care && care.kmPerLitre == null ? <Notice kind="empty" text="Log fuel to see mileage." /> : null}
      {care && care.kmPerLitre != null ? <p className="text-sm">{care.kmPerLitre.toFixed(1)} km/L</p> : null}
      {care ? <MaintenanceStatusPill status={care.status === 'done' ? 'upcoming' : care.status} label={when ? `Next service ${when}` : care.status.replace('_', ' ')} /> : null}
      <Link className="tap flex text-primary" to={`/garage/${id}/schedule`}>Maintenance</Link>
      <Link className="tap flex text-primary" to={`/garage/${id}/history`}>History</Link>
      <Link className="tap flex text-primary" to={`/garage/${id}/spend`}>Fuel spend</Link>
      <Link className="tap flex text-primary" to={`/garage/${id}/documents`}>Documents</Link>
      <Link className="tap flex text-primary" to={`/garage/remove?id=${id}`}>Remove vehicle</Link>
    </Frame>
  );
}

export function Schedule() {
  const { id } = useParams();
  const [tasks, setTasks] = useState<{ name?: string; title?: string; op_code?: string }[] | null>(null);
  const [general, setGeneral] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void plugSend<{ vehicles: { id: string; catalog_variant_id: string | null; year: number | null }[] }>('/garage', 'GET').then(async (body) => {
      const vehicle = body.vehicles.find((row) => row.id === id);
      if (!vehicle?.catalog_variant_id) { setTasks([]); setGeneral(true); return; }
      const schedule = await publicGet<{ tasks: { name?: string; title?: string; op_code?: string }[]; generalSchedule: boolean }>(`/schedules?variant=${vehicle.catalog_variant_id}&year=${vehicle.year || ''}`);
      setTasks(schedule.tasks);
      setGeneral(schedule.generalSchedule);
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the schedule'));
  }, [id]);
  return (
    <Frame title="Maintenance">
      <p className="text-sm">{general ? 'General schedule — a schedule for your exact car is coming.' : 'This is the schedule Dominion has for your car.'}</p>
      {error ? <Notice kind="error" text={error} /> : null}
      {tasks && tasks.length === 0 ? <Notice kind="empty" text="No tasks yet." /> : null}
      <ul>{(tasks || []).map((task, index) => <li key={index} className="py-2 text-sm">{task.name || task.title || task.op_code || 'Service'}</li>)}</ul>
    </Frame>
  );
}
export function ServiceItem() {
  return <Frame title="Service"><p className="text-sm">Oil and filter. Log it when it is done, even if another shop did the work.</p></Frame>;
}
export function LogService() {
  const { id } = useParams();
  const [error, setError] = useState<string | null>(null);
  return <Frame title="Log service" action={{ label: 'Save', onClick: () => { void plugSend('/services', 'POST', { vehicleId: id, opCode: 'oil', doneOn: new Date().toISOString().slice(0, 10) }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not save')); } }}>{error ? <Notice kind="error" text={error} /> : <p className="text-sm">This resets that service.</p>}</Frame>;
}
export function History() {
  const { id } = useParams();
  const [rows, setRows] = useState<{ id: string; op_code: string; done_on: string; odometer: number | null }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void plugSend<{ services: { id: string; op_code: string; done_on: string; odometer: number | null }[] }>(`/services?vehicleId=${id}`, 'GET')
      .then((body) => setRows(body.services))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load history'));
  }, [id]);
  return (
    <Frame title="History">
      {rows === null && !error ? <Notice kind="loading" text="Loading history…" /> : null}
      {error ? <Notice kind="error" text={error} /> : null}
      {rows && rows.length === 0 ? <Notice kind="empty" text="No services logged yet." /> : null}
      <ul>{(rows || []).map((row) => <li key={row.id} className="py-2 text-sm">{row.done_on}: {row.op_code}{row.odometer ? ` · ${row.odometer} km` : ''}</li>)}</ul>
      <button type="button" className="tap rounded-xl border px-4" onClick={() => window.print()}>Save PDF</button>
    </Frame>
  );
}
export function Spend() {
  const { id } = useParams();
  const [logs, setLogs] = useState<{ id: string; litres: number; amount: number; created_at: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void plugSend<{ logs: { id: string; litres: number; amount: number; created_at: string }[] }>(`/fuel-logs?vehicleId=${id}`, 'GET')
      .then((body) => setLogs(body.logs))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load spend'));
  }, [id]);
  const total = (logs || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const litres = (logs || []).reduce((sum, row) => sum + (Number(row.litres) || 0), 0);
  return (
    <Frame title="Fuel spend">
      {logs === null && !error ? <Notice kind="loading" text="Loading fills…" /> : null}
      {error ? <Notice kind="error" text={error} /> : null}
      {logs && logs.length === 0 ? <Notice kind="empty" text="Log a fill to see km per litre and monthly spend." /> : null}
      {logs && logs.length > 0 ? <p className="text-sm">J${total.toFixed(0)} across {litres.toFixed(1)} litres.</p> : null}
    </Frame>
  );
}
export function Documents() {
  const { id } = useParams();
  const [due, setDue] = useState<string | null>(null);
  useEffect(() => {
    void plugSend<{ reminders: { due_on: string | null }[] }>(`/reminders?vehicleId=${id}`, 'GET')
      .then((body) => setDue(body.reminders.find((row) => row.due_on)?.due_on || null))
      .catch(() => setDue(null));
  }, [id]);
  const state = documentStatus(due, new Date().toISOString());
  return <Gate flag="plug.documents"><Frame title="Documents"><MaintenanceStatusPill status={state === 'valid' ? 'done' : state === 'missing' ? 'upcoming' : state} label={state} /><Link to="edit" className="text-primary">Add a renewal date</Link></Frame></Gate>;
}
export function DocumentEdit() {
  const { id } = useParams();
  const [date, setDate] = useState('');
  return <Frame title="Reminder" action={{ label: 'Save', onClick: () => { void plugSend('/reminders', 'POST', { vehicleId: id, kind: 'fitness', dueOn: date }); } }}><input className="tap w-full rounded-xl border px-3" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Frame>;
}

export function PartsHome() {
  return <Gate flag="plug.parts"><Frame title="Parts"><p className="text-sm">Parts buying is coming soon. This screen only shows what fits.</p><Link to="/parts/results" className="text-primary">See tiers</Link></Frame></Gate>;
}
export function PartsResults() {
  const [comingSoon, setComingSoon] = useState(true);
  const [parts, setParts] = useState<{ part_id: string; part_name: string; tier: number }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void plugSend<{ vehicles: { catalog_variant_id: string | null; year: number | null }[] }>('/garage', 'GET').then(async (body) => {
      const vehicle = body.vehicles.find((row) => row.catalog_variant_id);
      if (!vehicle?.catalog_variant_id) {
        await plugSend('/demand', 'POST', { query: 'no-vehicle' }).catch(() => undefined);
        setComingSoon(true);
        return;
      }
      const result = await publicGet<{ parts: { part_id: string; part_name: string; tier: number }[]; comingSoon: boolean }>(`/parts?variant=${vehicle.catalog_variant_id}&year=${vehicle.year || ''}`);
      setParts(result.parts || []);
      setComingSoon(result.comingSoon);
      if (result.comingSoon) await plugSend('/demand', 'POST', { variantId: vehicle.catalog_variant_id, query: 'no-parts' }).catch(() => undefined);
    }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load parts'));
  }, []);
  if (comingSoon && parts.length === 0) {
    return <Frame title="Parts"><PartsTierHeader tier={1} /><Notice kind="empty" text="Parts for your car are coming soon." />{error ? <Notice kind="error" text={error} /> : null}</Frame>;
  }
  return <Frame title="Parts">{parts.map((part) => <Link key={part.part_id} className="tap flex" to={`/parts/${part.part_id}`}><PartsTierHeader tier={(part.tier >= 1 && part.tier <= 5 ? part.tier : 1) as 1 | 2 | 3 | 4 | 5} />{part.part_name}</Link>)}</Frame>;
}
export function PartDetail() {
  return <Frame title="Part"><p className="text-sm">No store price and no cart. Nearby parts stores show on the map when they are approved.</p></Frame>;
}
export function PartsSoon() {
  return <Frame title="Coming soon"><p>Parts for your car are coming soon. A search with no result is counted so Dominion knows which cars to fill in next.</p></Frame>;
}

const KINDS = ['parts_store', 'mechanic', 'air_pump', 'restroom', 'car_wash', 'ev_charging'] as const;
export function MapChoose() {
  const navigate = useNavigate();
  return <Gate flag="plug.map_it"><Frame title="Map it"><ul className="space-y-2">{KINDS.map((kind) => <li key={kind}><button type="button" className="tap w-full rounded-xl bg-surface text-left ring-1 ring-line px-3" onClick={() => navigate(`/map/pin?kind=${kind}`)}>{kind.replace('_', ' ')}</button></li>)}</ul></Frame></Gate>;
}
export function MapPin() {
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const kind = params.get('kind') || 'mechanic';
  return (
    <Frame title="Place the pin" action={{ label: 'Use my location', onClick: () => {
      navigator.geolocation.getCurrentPosition((pos) => {
        setAccuracy(pos.coords.accuracy);
        if (pos.coords.accuracy > 100) {
          navigate('/map/pin/poor');
          return;
        }
        navigate(`/map/details?kind=${kind}&lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&accuracy=${pos.coords.accuracy}`);
      }, () => navigate('/gps'));
    } }}>
      <GpsAccuracyIndicator meters={accuracy} />
    </Frame>
  );
}
export function MapDetails() {
  const [params] = useSearchParams();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  return <Frame title="Details" action={{ label: 'Submit', onClick: () => { void plugSend('/pins', 'POST', { name, kind: params.get('kind'), lat: Number(params.get('lat')), lng: Number(params.get('lng')), accuracyM: Number(params.get('accuracy')) }).then(() => navigate('/map/submitted')).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not submit')); } }}><input className="tap w-full rounded-xl border px-3" value={name} onChange={(e) => setName(e.target.value)} aria-label="Place name" />{error ? <Notice kind="error" text={error} /> : null}</Frame>;
}
export function MapSubmitted() {
  return <Frame title="Submitted"><PendingDashedPin /><p>Awaiting approval. You will be told when it is approved or rejected.</p></Frame>;
}
export function Contributions() {
  const [name, setName] = useState('Scout');
  useEffect(() => {
    void plugSend<{ level: { name: string } }>('/contributions', 'GET').then((body) => setName(body.level.name)).catch(() => setName(contributorLevel(0).name));
  }, []);
  return <Frame title="Contributions"><p>{name}. Badges only — no cash and no discounts.</p><Link to="/parish" className="text-primary">Help map your parish</Link></Frame>;
}
export function ParishHelp() {
  const [areas, setAreas] = useState<{ pcode: string; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void publicGet<{ areas: { pcode: string; name: string }[] }>('/geo/parishes?level=1').then((body) => setAreas(body.areas)).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load parishes')); }, []);
  return <Frame title="Help map your parish">{areas === null && !error ? <Notice kind="loading" text="Loading parishes…" /> : null}{error ? <Notice kind="error" text={error} /> : null}{areas && areas.length === 0 ? <Notice kind="empty" text="Parish list is not published yet." /> : null}<ul>{(areas || []).map((area) => <li key={area.pcode} className="py-1 text-sm">{area.name}</li>)}</ul></Frame>;
}

export function Inbox() {
  const [rows, setRows] = useState<{ id: string; title: string; body: string }[] | null>(null);
  useEffect(() => { void plugSend<{ notifications: { id: string; title: string; body: string }[] }>('/notifications', 'GET').then((body) => setRows(body.notifications)).catch(() => setRows([])); }, []);
  return <Frame title="Inbox">{rows === null ? <Notice kind="loading" text="Loading…" /> : rows.length === 0 ? <Notice kind="empty" text="No reminders yet." /> : <ul>{rows.map((row) => <li key={row.id}>{row.title}</li>)}</ul>}</Frame>;
}
export function Account() {
  const { session, signOut } = useAuth();
  if (!session) return <Navigate to="/login" replace />;
  return <Frame title="Account"><p className="text-sm">{session.user.phone}</p><button type="button" className="tap text-primary" onClick={() => void signOut()}>Sign out</button><Link to="/account/privacy" className="tap flex text-primary">Privacy and data</Link></Frame>;
}
export function NotifySettings() {
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Frame title="Notifications" action={{ label: 'Turn on reminders', onClick: () => {
      setError(null);
      void enablePlugPush(plugSend).then(() => setNote('Reminders will show on this phone. The inbox still works if you turn them off later.')).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not turn on reminders'));
    } }}>
      <p className="text-sm">Service and document reminders. Push uses your phone permission. The inbox still works without it.</p>
      {note ? <p className="text-sm">{note}</p> : null}
      {error ? <Notice kind="error" text={error} /> : null}
    </Frame>
  );
}
export function PrivacyData() {
  const [error, setError] = useState<string | null>(null);
  const { signOut } = useAuth();
  return (
    <Frame title="Privacy and data">
      <button type="button" className="tap w-full rounded-xl border px-4" onClick={() => { void plugSend<Record<string, unknown>>('/me/export', 'GET').then((body) => {
        const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'roam-plug-export.json'; a.click();
      }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Export failed')); }}>Download my data</button>
      <button type="button" className="tap w-full rounded-xl bg-error px-4 text-white" onClick={() => {
        if (!window.confirm('Delete this account? Your garage and fuel logs go away. Approved places stay on the map.')) return;
        void plugSend('/me', 'DELETE').then(() => signOut()).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not delete'));
      }}>Delete account</button>
      {error ? <Notice kind="error" text={error} /> : null}
    </Frame>
  );
}
export function Settings() {
  const [dark, setDark] = useState(false);
  return <Frame title="Settings"><button type="button" className="tap rounded-xl border px-4" onClick={() => { setDark((v) => !v); document.documentElement.classList.toggle('dark'); }}>{dark ? 'Light' : 'Dark'} theme</button></Frame>;
}
export function Help() {
  return <Frame title="Help"><p className="text-sm">Roam Plug is free. Nothing is for sale. Parts buying and bookings say coming soon on purpose.</p></Frame>;
}
export function GpsIssue() {
  return <Frame title="GPS"><Notice kind="error" text="Location is off or not accurate enough. Turn it on and try the pin again." /></Frame>;
}
export function Offline() {
  const jobs = readQueue();
  return <Frame title="Offline">{jobs.length === 0 ? <Notice kind="empty" text="Nothing is waiting to sync." /> : <ul>{jobs.map((job) => <li key={job.id}><button type="button" onClick={() => removeJob(job.id)}>Queued {job.path}</button></li>)}</ul>}</Frame>;
}

export function Directions() {
  const { id } = useParams();
  const load = useLoad<{ station: Station }>(`/stations/${id}`);
  const station = load.data?.station;
  if (load.loading) return <Frame title="Directions"><Notice kind="loading" text="Loading station…" /></Frame>;
  if (!station) return <Frame title="Directions"><Notice kind="empty" text="That station is not on the map." /></Frame>;
  return (
    <Frame title={station.name}>
      <a className="tap flex items-center text-primary" href={googleDirections(station.lat, station.lng)}>Google Maps</a>
      <a className="tap flex items-center text-primary" href={wazeDirections(station.lat, station.lng)}>Waze</a>
    </Frame>
  );
}

export function PlaceKind({ kind }: { kind: string }) {
  const load = useLoad<{ places: { id: string; name: string }[] }>(`/places?kind=${kind}`);
  return (
    <Frame title={kind.replace('_', ' ')}>
      {load.loading ? <Notice kind="loading" text="Loading places…" /> : null}
      {load.error ? <Notice kind="error" text={load.error} /> : null}
      {load.data && load.data.places.length === 0 ? <Notice kind="empty" text="None approved yet." /> : null}
      <ul>{(load.data?.places || []).map((place) => <li key={place.id}><Link className="tap flex" to={`/places/${place.id}`}>{place.name}</Link></li>)}</ul>
    </Frame>
  );
}

export function RemoveVehicle() {
  const [params] = useSearchParams();
  const id = params.get('id') || '';
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  return (
    <Frame title="Remove vehicle" action={{ label: 'Remove', onClick: () => {
      void plugSend(`/vehicles/${id}`, 'DELETE').then(() => navigate('/garage')).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not remove'));
    } }}>
      <p className="text-sm">This deletes the car and its fuel logs from your garage.</p>
      {error ? <Notice kind="error" text={error} /> : null}
    </Frame>
  );
}

export function WithdrawPin() {
  const [params] = useSearchParams();
  const id = params.get('id') || '';
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  return (
    <Frame title="Withdraw pin" action={{ label: 'Withdraw', onClick: () => {
      void plugSend(`/pins/${id}/withdraw`, 'POST', {}).then(() => navigate('/contributions')).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not withdraw'));
    } }}>
      <p className="text-sm">A pending pin you submitted can be taken back. Approved places stay on the map.</p>
      {error ? <Notice kind="error" text={error} /> : null}
    </Frame>
  );
}

export function PoorGps() {
  return <Frame title="Weak GPS"><Notice kind="error" text="The pin needs a fix closer than 100 metres. Step outside and try again." /></Frame>;
}

export function FuelError() {
  return <Frame title="Could not save"><Notice kind="error" text="That fill was not saved. Check the litres, the amount, and the odometer, then try again." /></Frame>;
}

export function PlugAdmin() {
  return <Frame title="Plug admin"><p className="text-sm">Flags stay off until the owner turns a section on for one account, then for everyone. Place review stays in Dominion.</p></Frame>;
}
