// Stitch: dominion-redesign/2a625fdca609418f988ee8a290e9695e
import React, { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { DominionMasterList } from './DominionMasterList';
import { DominionRecordDrawer } from './DominionRecordDrawer';
import { PageShell } from './PageShell';

type LinkItem = { id: string; label: string; detail: string };

type Card = { label: string; value: string };

function showCount(value: number | null): string {
  return value == null || Number.isNaN(value) ? '—' : String(value);
}

function useMasterStats() {
  const { session } = useAuth();
  const [places, setPlaces] = useState<number | null>(null);
  const [vehicles, setVehicles] = useState<number | null>(null);
  const [vendors, setVendors] = useState<number | null>(null);
  const [stationTotal, setStationTotal] = useState<number | null>(null);
  const [stationVerified, setStationVerified] = useState<number | null>(null);
  const [scores, setScores] = useState<Record<string, number | null>>({});

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    void Promise.all([
      fetch(`${API_ENDPOINTS.catalog}/admin/quality`, { headers }),
      fetch(`${API_ENDPOINTS.admin}/admin-stats`, { headers }),
      fetch(`${API_ENDPOINTS.admin}/admin/vehicle-catalog-pending-requests?status=open&limit=1`, { headers }),
      fetch(`${API_ENDPOINTS.catalog}/admin/vendors?status=pending`, { headers }),
      fetch(`${API_ENDPOINTS.explorer}/admin/coverage`, { headers }),
    ]).then(async ([qualityRes, statsRes, vehiclesRes, vendorsRes, placesRes]) => {
      if (cancelled) return;
      const quality = qualityRes.ok ? await qualityRes.json() : { scores: [] };
      const stats = statsRes.ok ? await statsRes.json() : {};
      const vehiclesBody = vehiclesRes.ok ? await vehiclesRes.json() : {};
      const vendorsBody = vendorsRes.ok ? await vendorsRes.json() : {};
      const placesBody = placesRes.ok ? await placesRes.json() : {};
      const nextScores: Record<string, number | null> = {};
      for (const row of quality.scores || []) {
        if (row?.dataset) nextScores[row.dataset] = typeof row.score === 'number' ? row.score : null;
      }
      setScores(nextScores);
      setStationTotal(typeof stats.fuelStationCount === 'number' ? stats.fuelStationCount : null);
      setStationVerified(typeof stats.stationVerified === 'number' ? stats.stationVerified : null);
      setVehicles(vehiclesRes.ok ? Number(vehiclesBody.total ?? 0) : null);
      const vendorList = Array.isArray(vendorsBody) ? vendorsBody : vendorsBody.vendors || vendorsBody.items || [];
      setVendors(vendorsRes.ok ? Number(vendorsBody.total ?? vendorList.length ?? 0) : null);
      setPlaces(placesRes.ok ? Number(placesBody.pending ?? 0) : null);
    }).catch(() => {
      if (!cancelled) {
        setPlaces(null);
        setVehicles(null);
        setVendors(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  return { places, vehicles, vendors, stationTotal, stationVerified, scores };
}

function SectionHome({
  title,
  lede,
  cards,
  items,
  onNavigate,
}: {
  title: string;
  lede: string;
  cards: Card[];
  items: LinkItem[];
  onNavigate: (page: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">{title}</h1>
        <p className="mt-1 text-sm text-[#64748b]">{lede}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <p key={card.label} className="rounded-xl border border-[#e2e8f0] bg-[#ffffff] p-4">
            <span className="block font-mono text-2xl font-semibold text-[#0f172a]">{card.value}</span>
            <span className="text-sm text-[#64748b]">{card.label}</span>
          </p>
        ))}
      </div>
      <div className="grid gap-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className="rounded-xl border border-[#e2e8f0] bg-[#ffffff] px-4 py-3 text-left"
          >
            <p className="text-sm font-semibold text-[#316bf3]">{item.label}</p>
            <p className="mt-1 text-sm text-[#475569]">{item.detail}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function VehiclesHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  const stats = useMasterStats();
  return (
    <SectionHome
      title="Vehicles"
      lede="Makes, models, parts, and maintenance."
      onNavigate={onNavigate}
      cards={[
        { label: 'Waiting', value: showCount(stats.vehicles) },
        { label: 'Quality', value: showCount(stats.scores.vehicles ?? null) },
        { label: 'Records', value: '—' },
        { label: 'Verified', value: '—' },
      ]}
      items={[
        { id: 'motor-vehicles', label: 'Vehicle catalog', detail: 'Makes, models, and the record you open with the eye button.' },
        { id: 'platforms-engines', label: 'Platforms and engines', detail: 'Shared platforms and engine families.' },
        { id: 'pending-motor-vehicles', label: 'Pending catalog', detail: 'Rows waiting for a person to approve.' },
        { id: 'maintenance-templates', label: 'Maintenance templates', detail: 'Service schedules used by the apps.' },
        { id: 'parts-catalog', label: 'Parts catalog', detail: 'Parts that belong to a vehicle.' },
        { id: 'suppliers-prices', label: 'Suppliers and prices', detail: 'Who sells a part, and for how much.' },
        { id: 'catalog-quality', label: 'Data quality', detail: 'Catalog rows that fail a check.' },
      ]}
    />
  );
}

export function PlacesHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  const stats = useMasterStats();
  return (
    <SectionHome
      title="Places and Maps"
      lede="Jamaica’s map, and the places still waiting for a review."
      onNavigate={onNavigate}
      cards={[
        { label: 'Waiting', value: showCount(stats.places) },
        { label: 'Quality', value: showCount(stats.scores.maps ?? null) },
        { label: 'Records', value: '—' },
        { label: 'Verified', value: '—' },
      ]}
      items={[
        { id: 'world-jamaica', label: 'Jamaica map', detail: 'The shipped country map.' },
        { id: 'world-parishes', label: 'Parishes', detail: 'Parish boundaries.' },
        { id: 'world-towns', label: 'Towns', detail: 'Town boundaries.' },
        { id: 'world-communities', label: 'Communities', detail: 'Community boundaries.' },
        { id: 'world-places', label: 'Places and pins', detail: 'Named places and map pins.' },
        { id: 'world-imports', label: 'Imports and versions', detail: 'Dry run, then publish.' },
        { id: 'world-quality', label: 'Map quality', detail: 'Map rows that fail a check.' },
        { id: 'plug-places', label: 'Places review', detail: 'Places a person still needs to confirm.' },
      ]}
    />
  );
}

export function FuelHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  const stats = useMasterStats();
  return (
    <SectionHome
      title="Fuel"
      lede="Stations, pump prices, and the gas-card programs Dominion still owns."
      onNavigate={onNavigate}
      cards={[
        { label: 'Stations', value: showCount(stats.stationTotal) },
        { label: 'Verified', value: showCount(stats.stationVerified) },
        { label: 'Quality', value: showCount(stats.scores.stations ?? null) },
        { label: 'Waiting', value: '—' },
      ]}
      items={[
        { id: 'fuel-stations', label: 'Stations', detail: 'The station list, including ones still in review.' },
        { id: 'fuel-prices', label: 'Prices', detail: 'Pump prices the apps can read.' },
        { id: 'fuel-analytics', label: 'Station analytics', detail: 'How complete the station list is. Customer fuel spending stays in Fleet.' },
        { id: 'fuel-jaa-cards', label: 'Gas-card programs', detail: 'Programs and the master list. Customer cards are in Fleet admin.' },
      ]}
    />
  );
}

export function StationHealth() {
  const stats = useMasterStats();
  const unverified = stats.stationTotal != null && stats.stationVerified != null
    ? Math.max(0, stats.stationTotal - stats.stationVerified)
    : null;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[#0f172a]">Station analytics</h1>
        <p className="mt-1 text-sm text-[#64748b]">How complete the station list is. Customer fuel spending stays in Fleet admin.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Stations', value: showCount(stats.stationTotal) },
          { label: 'Verified', value: showCount(stats.stationVerified) },
          { label: 'Not verified', value: showCount(unverified) },
          { label: 'Quality', value: showCount(stats.scores.stations ?? null) },
        ].map((card) => (
          <p key={card.label} className="rounded-xl border border-[#e2e8f0] bg-[#ffffff] p-4">
            <span className="block font-mono text-2xl font-semibold text-[#0f172a]">{card.value}</span>
            <span className="text-sm text-[#64748b]">{card.label}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

export function TollsHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  const stats = useMasterStats();
  return (
    <SectionHome
      title="Tolls"
      lede="Plazas and the rates that belong with them."
      onNavigate={onNavigate}
      cards={[
        { label: 'Quality', value: showCount(stats.scores.tolls ?? null) },
        { label: 'Records', value: '—' },
        { label: 'Verified', value: '—' },
        { label: 'Waiting', value: '—' },
      ]}
      items={[
        { id: 'toll-stations', label: 'Plazas', detail: 'Toll plazas and their status.' },
        { id: 'toll-info', label: 'Rates and operators', detail: 'Rates, vehicle classes, and who runs the plaza.' },
      ]}
    />
  );
}

export function TaxVendorsHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  const stats = useMasterStats();
  return (
    <SectionHome
      title="Tax and Vendors"
      lede="Vendor records and the tax rates the apps read. The tax books stay in Back office."
      onNavigate={onNavigate}
      cards={[
        { label: 'Vendors waiting', value: showCount(stats.vendors) },
        { label: 'Vendor quality', value: showCount(stats.scores.vendors ?? null) },
        { label: 'Tax quality', value: showCount(stats.scores.gct_rates ?? null) },
        { label: 'Records', value: '—' },
      ]}
      items={[
        { id: 'vendor-database', label: 'Vendors', detail: 'Suppliers used on expenses.' },
        { id: 'pending-vendor-requests', label: 'Pending vendors', detail: 'Vendor requests waiting for a person.' },
        { id: 'gct-rates', label: 'Tax rates', detail: 'GCT rates and classes.' },
        { id: 'gct-engine', label: 'Tax engine', detail: 'How tax is calculated.' },
        { id: 'gct-knowledge', label: 'Knowledge base', detail: 'The written tax notes.' },
      ]}
    />
  );
}

const APPS: { name: string; site: string; admin: string; datasets: string }[] = [
  { name: 'Roam Plug', site: 'https://roamplug.app', admin: 'https://roamplug.app', datasets: 'Stations, places, tolls' },
  { name: 'Roam Fleet', site: 'https://roamfleet.co', admin: 'https://roamfleet.co/admin', datasets: 'Stations, vehicles, tolls' },
  { name: 'Roam Driver', site: 'https://roamdriver.co', admin: 'https://roamdriver.co/admin', datasets: 'Vehicles, stations' },
  { name: 'Roam Rides', site: 'https://roam-s.co', admin: 'https://roam-s.co/admin', datasets: 'Tolls, places' },
  { name: 'Roam Rush', site: 'https://roamrush.app', admin: 'https://roamrush.app/admin', datasets: 'Places' },
  { name: 'Roam Haul', site: 'https://roamhaul.co', admin: 'https://roamhaul.co/admin', datasets: 'Places' },
  { name: 'Roam Enterprise', site: 'https://roamenterprise.co', admin: 'https://roamenterprise.co/admin', datasets: 'Vendors, tax rates' },
];

type AppRow = { name: string; site: string; admin: string; datasets: string; sync: string };

export function AppsDirectory() {
  const { session } = useAuth();
  const [rows, setRows] = useState<AppRow[]>(
    APPS.map((app) => ({ ...app, sync: 'Not connected yet' })),
  );
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [openName, setOpenName] = useState<string | null>(null);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    void fetch(`${API_ENDPOINTS.catalog}/admin/consumers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('apps');
        return res.json() as Promise<{ consumers?: { name: string; site?: string; admin_url?: string; datasets?: string[]; last_sync_at?: string | null }[] }>;
      })
      .then((body) => {
        if (cancelled || !body.consumers?.length) return;
        setFailed(false);
        setRows(body.consumers.map((app) => ({
          name: app.name,
          site: app.site || '',
          admin: app.admin_url || app.site || '',
          datasets: (app.datasets || []).join(', '),
          sync: app.last_sync_at ? new Date(app.last_sync_at).toLocaleString() : 'Not connected yet',
        })));
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const visible = rows.filter((app) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${app.name} ${app.site} ${app.datasets}`.toLowerCase().includes(q);
  });
  const open = rows.find((app) => app.name === openName) ?? null;

  return (
    <PageShell title="Apps" description="Which Roam app reads which master data. Sync times appear after an app connects.">
      {failed && (
        <p className="text-sm text-slate-500">Couldn’t load the live list — showing the directory we already know.</p>
      )}
      <DominionMasterList search={search} onSearch={setSearch} empty={visible.length === 0}>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-[#f8fafc] text-left text-[#64748b]">
              <tr>
                <th className="px-4 py-3 font-medium">App</th>
                <th className="px-4 py-3 font-medium">Site</th>
                <th className="px-4 py-3 font-medium">Reads</th>
                <th className="px-4 py-3 font-medium">Last sync</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((app) => (
                <tr key={app.name} className="border-t border-slate-200">
                  <td className="px-4 py-3">
                    <button type="button" className="font-medium text-[#0f172a]" onClick={() => setOpenName(app.name)}>{app.name}</button>
                  </td>
                  <td className="px-4 py-3">
                    <a href={app.admin} className="text-[#316bf3] underline">{app.site.replace('https://', '')}</a>
                  </td>
                  <td className="px-4 py-3 text-[#475569]">{app.datasets}</td>
                  <td className="px-4 py-3 text-[#64748b]">{app.sync}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DominionMasterList>
      <DominionRecordDrawer
        title={open?.name || 'App'}
        recordId={open?.name}
        open={Boolean(open)}
        onClose={() => setOpenName(null)}
      >
        {open && (
          <div className="space-y-3 text-sm text-[#0f172a]">
            <p>Site: {open.site || '—'}</p>
            <p>Reads: {open.datasets || '—'}</p>
            <p>Last sync: {open.sync}</p>
          </div>
        )}
      </DominionRecordDrawer>
    </PageShell>
  );
}

export function ChangeRequestInbox({ onNavigate }: { onNavigate: (page: string) => void }) {
  const stats = useMasterStats();
  return (
    <SectionHome
      title="Change requests"
      lede="Queues that already exist. This inbox opens them. It does not merge them."
      onNavigate={onNavigate}
      cards={[
        { label: 'Places', value: showCount(stats.places) },
        { label: 'Vehicles', value: showCount(stats.vehicles) },
        { label: 'Vendors', value: showCount(stats.vendors) },
        { label: 'Stations', value: '—' },
      ]}
      items={[
        { id: 'pending-motor-vehicles', label: 'Pending vehicles', detail: 'Catalog rows waiting for approval.' },
        { id: 'pending-vendor-requests', label: 'Pending vendors', detail: 'Vendor requests waiting for approval.' },
        { id: 'plug-places', label: 'Places to review', detail: 'Places that are not confirmed yet.' },
        { id: 'fuel-stations', label: 'Station resolution', detail: 'Stations that still need a decision.' },
      ]}
    />
  );
}

export function PlatformOpsHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <SectionHome
      title="Platform Ops"
      lede="Work that keeps the published data honest."
      onNavigate={onNavigate}
      cards={[
        { label: 'Records', value: '—' },
        { label: 'Verified', value: '—' },
        { label: 'Waiting', value: '—' },
        { label: 'Quality', value: '—' },
      ]}
      items={[
        { id: 'fuel-stations', label: 'Station resolution', detail: 'Fix a station before it is published.' },
        { id: 'plug-places', label: 'Places review', detail: 'Confirm a place before apps use it.' },
        { id: 'catalog-quality', label: 'Catalog quality', detail: 'Vehicle rows that fail a check.' },
        { id: 'world-quality', label: 'Map quality', detail: 'Map rows that fail a check.' },
      ]}
    />
  );
}
