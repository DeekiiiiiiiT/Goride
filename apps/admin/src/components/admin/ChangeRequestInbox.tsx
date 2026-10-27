// Stitch: dominion-redesign/71dc2ef38efb4ce087bf604166dbc4e5
import React, { useEffect, useState } from 'react';
import { Car, Fuel, Info, MapPin, Store } from 'lucide-react';
import { API_ENDPOINTS } from '../../services/apiConfig';
import { useAuth } from '../auth/AuthContext';

function showCount(value: number | null): string {
  return value == null || Number.isNaN(value) ? '—' : String(value);
}

export function ChangeRequestInbox({ onNavigate }: { onNavigate: (page: string) => void }) {
  const { session } = useAuth();
  const [places, setPlaces] = useState<number | null>(null);
  const [vehicles, setVehicles] = useState<number | null>(null);
  const [vendors, setVendors] = useState<number | null>(null);

  useEffect(() => {
    const token = session?.access_token;
    if (!token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    void Promise.all([
      fetch(`${API_ENDPOINTS.admin}/admin/vehicle-catalog-pending-requests?status=open&limit=1`, { headers }),
      fetch(`${API_ENDPOINTS.catalog}/admin/vendors?status=pending`, { headers }),
      fetch(`${API_ENDPOINTS.explorer}/admin/coverage`, { headers }),
    ]).then(async ([vehiclesRes, vendorsRes, placesRes]) => {
      if (cancelled) return;
      const vehiclesBody = vehiclesRes.ok ? await vehiclesRes.json() : {};
      const vendorsBody = vendorsRes.ok ? await vendorsRes.json() : {};
      const placesBody = placesRes.ok ? await placesRes.json() : {};
      setVehicles(typeof vehiclesBody.total === 'number' ? vehiclesBody.total : null);
      setVendors(
        Array.isArray(vendorsBody.items)
          ? vendorsBody.items.length
          : typeof vendorsBody.total === 'number'
            ? vendorsBody.total
            : null,
      );
      setPlaces(
        typeof placesBody.pending === 'number'
          ? placesBody.pending
          : typeof placesBody.total === 'number'
            ? placesBody.total
            : null,
      );
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  const cards = [
    {
      id: 'pending-motor-vehicles',
      label: 'Pending vehicles',
      value: showCount(vehicles),
      linkLabel: 'Vehicle catalog pending queue',
      Icon: Car,
    },
    {
      id: 'pending-vendor-requests',
      label: 'Pending vendors',
      value: showCount(vendors),
      linkLabel: 'Vendor requests queue',
      Icon: Store,
    },
    {
      id: 'plug-places',
      label: 'Places to review',
      value: showCount(places),
      linkLabel: 'Places & map imports',
      Icon: MapPin,
    },
    {
      id: 'fuel-stations',
      label: 'Station resolution',
      value: '—',
      linkLabel: 'Station analytics queue',
      Icon: Fuel,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8 text-slate-900">
      <div className="flex items-center justify-between">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <span>Dominion</span>
          <span className="text-slate-400">/</span>
          <span>Distribution</span>
          <span className="text-slate-400">/</span>
          <span className="font-semibold text-slate-900">Change requests</span>
        </nav>
        <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-100 px-3 py-1 font-mono text-[11px] text-slate-600">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          REGION: JM-KGN
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <h1 className="font-headline text-2xl font-bold tracking-tight text-slate-900">Change requests</h1>
        <p className="text-sm text-slate-500">
          An inbox that links to the queues that already exist. It does not merge them.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.Icon;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => onNavigate(card.id)}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 text-left transition-all duration-150 hover:border-slate-300 hover:shadow-sm"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">{card.label}</span>
                  <Icon className="h-4 w-4 text-slate-400 transition-colors group-hover:text-blue-600" aria-hidden />
                </div>
                <div className="py-1 font-mono text-3xl font-medium tracking-tight text-slate-900">
                  {card.value}
                </div>
              </div>
              <div className="mt-0 flex items-center justify-between border-t border-slate-100 pt-4">
                <span className="flex items-center gap-1 text-xs font-medium text-blue-600 transition-all group-hover:gap-1.5 group-hover:underline">
                  <span>{card.linkLabel}</span>
                  <span className="text-sm font-bold leading-none" aria-hidden>
                    →
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex items-start gap-3.5">
          <div className="mt-0.5 rounded bg-slate-100 p-1 text-blue-600">
            <Info className="h-[18px] w-[18px]" aria-hidden />
          </div>
          <div className="flex flex-col gap-1">
            <h4 className="text-xs font-semibold text-slate-900">The data is not in yet.</h4>
            <p className="text-xs text-slate-500">
              Incoming routing and upstream updates for parishes will populate each specialized queue as
              synced by the ingestion service.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          <span className="rounded border border-slate-200 bg-slate-100 px-3 py-1 font-mono text-[11px] text-slate-400">
            LOC: KINGSTON / PARISH REGISTRY JMD
          </span>
        </div>
      </div>
    </div>
  );
}
