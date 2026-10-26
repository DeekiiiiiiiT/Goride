import React, { useEffect, useState } from 'react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';
import { PageShell } from './PageShell';

type LinkItem = { id: string; label: string; detail: string };

function LinkList({ items, onNavigate }: { items: LinkItem[]; onNavigate: (page: string) => void }) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">Nothing to open.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onNavigate(item.id)}
          className="rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/40"
        >
          <p className="text-sm font-medium text-slate-900 dark:text-white">{item.label}</p>
          <p className="mt-1 text-xs text-slate-500">{item.detail}</p>
        </button>
      ))}
    </div>
  );
}

export function VehiclesHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <PageShell title="Vehicles" description="The platform catalog of makes, models, parts, and maintenance.">
      <LinkList
        onNavigate={onNavigate}
        items={[
          { id: 'motor-vehicles', label: 'Vehicle catalog', detail: 'Makes, models, and the record you already open with the eye button.' },
          { id: 'platforms-engines', label: 'Platforms and engines', detail: 'Shared platforms and engine families.' },
          { id: 'pending-motor-vehicles', label: 'Pending catalog', detail: 'Rows waiting for a person to approve.' },
          { id: 'maintenance-templates', label: 'Maintenance templates', detail: 'Service schedules used by the apps.' },
          { id: 'parts-catalog', label: 'Parts catalog', detail: 'Parts that belong to a vehicle.' },
          { id: 'suppliers-prices', label: 'Suppliers and prices', detail: 'Who sells a part, and for how much.' },
          { id: 'catalog-quality', label: 'Data quality', detail: 'Catalog rows that fail a check.' },
        ]}
      />
    </PageShell>
  );
}

export function PlacesHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <PageShell title="Places and Maps" description="Jamaica’s map, and the places still waiting for a review.">
      <LinkList
        onNavigate={onNavigate}
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
    </PageShell>
  );
}

export function FuelHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <PageShell title="Fuel" description="Stations, pump prices, and the gas-card programs Dominion still owns.">
      <LinkList
        onNavigate={onNavigate}
        items={[
          { id: 'fuel-stations', label: 'Stations', detail: 'The station list, including ones still in review.' },
          { id: 'fuel-prices', label: 'Prices', detail: 'Pump prices the apps can read.' },
          { id: 'fuel-jaa-cards', label: 'Gas-card programs', detail: 'Programs and the master CSV. Customer cards are in Fleet admin.' },
        ]}
      />
    </PageShell>
  );
}

export function TollsHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <PageShell title="Tolls" description="Plazas and the rates that belong with them.">
      <LinkList
        onNavigate={onNavigate}
        items={[
          { id: 'toll-stations', label: 'Plazas', detail: 'Toll plazas and their status.' },
          { id: 'toll-info', label: 'Rates and operators', detail: 'Rates, vehicle classes, and who runs the plaza.' },
        ]}
      />
    </PageShell>
  );
}

export function TaxVendorsHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <PageShell title="Tax and Vendors" description="Vendor records and the tax rates the apps read. The tax books stay in Back office.">
      <LinkList
        onNavigate={onNavigate}
        items={[
          { id: 'vendor-database', label: 'Vendors', detail: 'Suppliers used on expenses.' },
          { id: 'pending-vendor-requests', label: 'Pending vendors', detail: 'Vendor requests waiting for a person.' },
          { id: 'gct-rates', label: 'Tax rates', detail: 'GCT rates and classes.' },
          { id: 'gct-engine', label: 'Tax engine', detail: 'How tax is calculated.' },
          { id: 'gct-knowledge', label: 'Knowledge base', detail: 'The written tax notes.' },
        ]}
      />
    </PageShell>
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

  return (
    <PageShell title="Apps" description="Which Roam app reads which master data. Sync times appear after an app connects.">
      {failed && (
        <p className="text-sm text-slate-500">Couldn’t load the live list — showing the directory we already know.</p>
      )}
      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-900">
            <tr>
              <th className="px-4 py-3 font-medium">App</th>
              <th className="px-4 py-3 font-medium">Site</th>
              <th className="px-4 py-3 font-medium">Reads</th>
              <th className="px-4 py-3 font-medium">Last sync</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((app) => (
              <tr key={app.name} className="border-t border-slate-200 dark:border-slate-800">
                <td className="px-4 py-3 text-slate-900 dark:text-white">{app.name}</td>
                <td className="px-4 py-3">
                  <a href={app.admin} className="text-amber-700 underline dark:text-amber-300">{app.site.replace('https://', '')}</a>
                </td>
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{app.datasets}</td>
                <td className="px-4 py-3 text-slate-500">{app.sync}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

export function ChangeRequestInbox({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <PageShell title="Change requests" description="Queues that already exist. This inbox opens them. It does not merge them.">
      <LinkList
        onNavigate={onNavigate}
        items={[
          { id: 'pending-motor-vehicles', label: 'Pending vehicles', detail: 'Catalog rows waiting for approval.' },
          { id: 'pending-vendor-requests', label: 'Pending vendors', detail: 'Vendor requests waiting for approval.' },
          { id: 'plug-places', label: 'Places to review', detail: 'Places that are not confirmed yet.' },
          { id: 'fuel-stations', label: 'Station resolution', detail: 'Stations that still need a decision.' },
        ]}
      />
    </PageShell>
  );
}

export function PlatformOpsHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  return (
    <PageShell title="Platform Ops" description="Work that keeps the published data honest.">
      <LinkList
        onNavigate={onNavigate}
        items={[
          { id: 'fuel-stations', label: 'Station resolution', detail: 'Fix a station before it is published.' },
          { id: 'plug-places', label: 'Places review', detail: 'Confirm a place before apps use it.' },
          { id: 'catalog-quality', label: 'Catalog quality', detail: 'Vehicle rows that fail a check.' },
          { id: 'world-quality', label: 'Map quality', detail: 'Map rows that fail a check.' },
        ]}
      />
    </PageShell>
  );
}
