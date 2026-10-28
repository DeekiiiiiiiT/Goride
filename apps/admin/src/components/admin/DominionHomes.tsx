// Stitch: dominion-redesign/81bb7dd4dc394b56a81ea6acaed3d535
import React, { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';

type LinkItem = { id: string; label: string; detail: string; badge?: string };

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
  section = 'Master data',
  cards,
  items,
  onNavigate,
}: {
  title: string;
  lede: string;
  section?: string;
  cards: Card[];
  items: LinkItem[];
  onNavigate: (page: string) => void;
}) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col space-y-6 bg-slate-50 p-8">
      <div className="flex shrink-0 items-start justify-between border-b border-slate-200 pb-5">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-400"
          >
            <span>Dominion</span>
            <span aria-hidden>›</span>
            <span>{section}</span>
            <span aria-hidden>›</span>
            <span className="font-semibold text-slate-700">{title}</span>
          </nav>
          <h1 className="font-headline text-2xl font-bold leading-tight tracking-tight text-slate-900">
            {title}
          </h1>
          <p className="mt-0.5 text-sm font-normal text-slate-500">{lede}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-slate-300"
          >
            <div className="font-mono text-xs font-medium uppercase tracking-wider text-slate-500">
              {card.label}
            </div>
            <div className="mt-2 font-mono text-3xl font-semibold tracking-tight text-slate-900">
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className="group block w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition-all duration-150 hover:border-slate-300 hover:shadow-sm"
          >
            <span className="flex items-center justify-between">
              <span className="min-w-0 pr-4">
                <span className="block text-base font-semibold leading-snug text-[#316bf3] group-hover:text-blue-700">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-sm leading-normal text-slate-500">{item.detail}</span>
              </span>
              <span className="flex shrink-0 items-center gap-3">
                {item.badge ? (
                  <span className="inline-flex items-center rounded border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-600">
                    {item.badge}
                  </span>
                ) : null}
                <ChevronRight
                  className="h-5 w-5 text-slate-400 transition-all group-hover:translate-x-0.5 group-hover:text-slate-600"
                  aria-hidden
                />
              </span>
            </span>
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
        { id: 'places-register', label: 'Places register', detail: 'Every place, with its type and facilities.' },
        { id: 'places-categories', label: 'Categories', detail: 'Groups, types, facilities, and brands.' },
        { id: 'places-review', label: 'Review', detail: 'Pins and facility suggestions waiting for a decision.' },
        { id: 'plug-places', label: 'Plug pins', detail: 'The same review, showing only Plug pins.' },
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
