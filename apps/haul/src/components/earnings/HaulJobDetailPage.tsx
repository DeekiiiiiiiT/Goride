import React, { useMemo } from 'react';
import type { RideRequestRow } from '@roam/types/rides';
import { buildHaulEarningsLines, haulJobRef, splitAddress, formatRideKm } from '../../utils/haulRideFormat';

const MAP_PLACEHOLDER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuDdH16DbGAjRjtop7VHk1JCjmxwFVcvG-BpK_hDasg_cyP5XwSns6rNgRM7iNG35WuDVMnzUjY6qbqOKIamNYZmvdrHi3qG870ZpZA79nNSlVpGrOqTYNe5X0TsmS0VmC7pWCfR8qlLVouWFVf_ktxLVQIIvMmbT_kvo1K4szGnl5zWlt6L63vxdJmUnPTgTiu8K81zo15ok-C36_tvJx6-5QTsp-WOlmziYcw_E1_zJxpe0JsR-elgSLTEnmyC1sTAIEWkue7Rdw';

type Props = {
  trip: RideRequestRow;
  onBack: () => void;
};

function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function HaulJobDetailPage({ trip, onBack }: Props) {
  const pickup = splitAddress(trip.pickup_address);
  const dropoff = splitAddress(trip.dropoff_address);
  const { lines, total } = buildHaulEarningsLines(trip);
  const manifest = trip.haulage_manifest;
  const distance = formatRideKm(trip.distance_estimate_km);

  const timeline = useMemo(
    () => [
      { icon: 'thumb_up', title: 'Accepted', sub: 'System confirmed', time: formatClock(trip.created_at) },
      { icon: 'store', title: 'Arrived Pickup', sub: 'Geofence triggered', time: formatClock(trip.arrived_pickup_at) },
      { icon: 'local_shipping', title: 'Started Trip', sub: 'En route to dropoff', time: formatClock(trip.trip_started_at) },
      { icon: 'done_all', title: 'Delivered', sub: 'Proof uploaded', time: formatClock(trip.completed_at), done: true },
    ],
    [trip],
  );

  return (
    <div className="flex flex-col gap-6 pb-8">
      <header className="flex items-center justify-between md:hidden">
        <button
          type="button"
          onClick={onBack}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[#ffc174]"
          aria-label="Back"
        >
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <span className="text-lg font-black tracking-wider text-[#ffc174] uppercase">Roam Haul</span>
        <div className="h-11 w-11" />
      </header>

      <button
        type="button"
        onClick={onBack}
        className="hidden items-center gap-2 text-sm text-[#d8c3ad] hover:text-[#ffc174] md:flex"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        Back to earnings
      </button>

      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-sm text-[#ffc174]">{haulJobRef(trip)}</p>
          <h1 className="text-3xl font-bold text-[#dae2fd]">Completed Job Detail</h1>
        </div>
        <div className="flex items-center gap-2 rounded border border-[#534434] bg-[#222a3d] px-3 py-1">
          <span className="material-symbols-outlined text-[#56e5a9]" style={{ fontVariationSettings: "'FILL' 1" }}>
            check_circle
          </span>
          <span className="text-sm text-[#dae2fd]">Delivered</span>
        </div>
      </div>

      <div className="relative h-64 overflow-hidden rounded-lg border border-[#2d3449] bg-[#131b2e]">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-80 mix-blend-screen"
          style={{ backgroundImage: `url('${MAP_PLACEHOLDER}')` }}
        />
        {distance !== '—' ? (
          <div className="absolute bottom-4 left-4 flex items-center gap-1 rounded border border-[#2d3449] bg-[#0b1326]/90 px-2 py-1 text-xs backdrop-blur">
            <span className="material-symbols-outlined text-sm text-[#ffc174]">location_on</span>
            <span>Total: {distance}</span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-lg border border-[#2d3449] bg-[#171f33] p-4">
            <h2 className="mb-4 text-lg font-semibold text-[#dae2fd]">Route Summary</h2>
            <div className="relative pl-8">
              <div className="absolute top-6 bottom-6 left-[11px] w-0.5 bg-[#2d3449]" />
              <div className="relative mb-6">
                <div className="absolute -left-8 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#ffc174] bg-[#0b1326]">
                  <div className="h-2 w-2 rounded-full bg-[#ffc174]" />
                </div>
                <p className="text-xs tracking-wider text-[#d8c3ad] uppercase">Pickup</p>
                <p className="text-[#dae2fd]">{pickup.line1}</p>
                {pickup.line2 ? <p className="text-sm text-[#d8c3ad]">{pickup.line2}</p> : null}
              </div>
              <div className="relative">
                <div className="absolute -left-8 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#56e5a9] bg-[#0b1326]">
                  <span className="material-symbols-outlined text-sm text-[#56e5a9]">check</span>
                </div>
                <p className="text-xs tracking-wider text-[#d8c3ad] uppercase">Dropoff</p>
                <p className="text-[#dae2fd]">{dropoff.line1}</p>
                {dropoff.line2 ? <p className="text-sm text-[#d8c3ad]">{dropoff.line2}</p> : null}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-[#2d3449] bg-[#171f33] p-4">
            <h2 className="mb-4 text-lg font-semibold text-[#dae2fd]">Trip Timeline</h2>
            <div className="space-y-0">
              {timeline.map((step, idx) => (
                <div key={step.title} className="flex">
                  <div className="mr-4 flex flex-col items-center">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full border ${
                        step.done ? 'border-[#30c88f] bg-[#30c88f]' : 'border-[#2d3449] bg-[#222a3d]'
                      }`}
                    >
                      <span
                        className={`material-symbols-outlined text-base ${step.done ? 'text-[#004e34]' : 'text-[#d8c3ad]'}`}
                        style={step.done ? { fontVariationSettings: "'FILL' 1" } : undefined}
                      >
                        {step.icon}
                      </span>
                    </div>
                    {idx < timeline.length - 1 ? <div className="my-1 h-full w-0.5 bg-[#2d3449]" /> : null}
                  </div>
                  <div className={`flex flex-1 justify-between pb-4 ${idx === timeline.length - 1 ? 'pb-0' : ''}`}>
                    <div>
                      <p className="font-medium text-[#dae2fd]">{step.title}</p>
                      <p className={`text-sm ${step.done ? 'text-[#56e5a9]' : 'text-[#d8c3ad]'}`}>{step.sub}</p>
                    </div>
                    <p className="text-sm text-[#d8c3ad]">{step.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-[#ffc174]/30 bg-[#171f33] p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#dae2fd]">Total Earnings</h2>
              <span className="text-2xl font-bold text-[#ffc174]">{total}</span>
            </div>
            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.label} className="flex justify-between border-b border-[#2d3449] pb-2 text-sm">
                  <span className="text-[#d8c3ad]">{line.label}</span>
                  <span className="text-[#dae2fd]">{line.value}</span>
                </div>
              ))}
            </div>
          </div>

          {manifest?.lines?.length ? (
            <div className="rounded-lg border border-[#2d3449] bg-[#171f33] p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[#dae2fd]">Manifest</h2>
                <span className="rounded bg-[#2d3449] px-2 py-1 text-xs text-[#d8c3ad]">
                  {manifest.lines.length} Items
                </span>
              </div>
              <div className="space-y-2">
                {manifest.lines.map((line) => (
                  <div
                    key={line.id}
                    className="flex items-start gap-2 rounded border border-[#2d3449] bg-[#0b1326] p-2"
                  >
                    <span className="material-symbols-outlined mt-0.5 text-[#d8c3ad]">inventory_2</span>
                    <div>
                      <p className="font-medium text-[#dae2fd]">{line.label || line.item_title}</p>
                      <p className="text-sm text-[#d8c3ad]">
                        Qty: {line.qty} • {Math.round(line.weight_kg * 2.20462).toLocaleString()} lbs
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-[#2d3449] bg-[#171f33] p-4">
              <h3 className="mb-2 text-base font-semibold text-[#dae2fd]">Proof of Delivery</h3>
              <div className="grid grid-cols-2 gap-1">
                <div className="aspect-square rounded border border-[#2d3449] bg-[#2d3449]" />
                <div className="flex aspect-square items-center justify-center rounded border border-[#2d3449] bg-[#2d3449]">
                  <span className="material-symbols-outlined text-[#d8c3ad]">add_photo_alternate</span>
                </div>
              </div>
            </div>
            <div className="flex flex-col items-center justify-center rounded-lg border border-[#2d3449] bg-[#171f33] p-4 text-center">
              <h3 className="mb-2 text-base font-semibold text-[#dae2fd]">Customer Rating</h3>
              <div className="mb-2 flex text-[#ffc174]">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                    star
                  </span>
                ))}
              </div>
              <p className="text-sm text-[#d8c3ad]">&quot;Great communication.&quot;</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="flex h-11 items-center gap-2 rounded border border-[#ffc174] px-6 text-[#ffc174] transition-colors hover:bg-[#ffc174]/10"
        >
          <span className="material-symbols-outlined">download</span>
          <span className="font-semibold">Download BOL</span>
        </button>
      </div>
    </div>
  );
}
