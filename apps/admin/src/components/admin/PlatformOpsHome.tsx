// Stitch: dominion-redesign/2516f2a73eaf4d33b1d5d21aa61604b7
import React from 'react';
import { ArrowRight, Car, Fuel, Info, MapPin, Spline } from 'lucide-react';

export function PlatformOpsHome({ onNavigate }: { onNavigate: (page: string) => void }) {
  const items = [
    {
      id: 'fuel-stations',
      label: 'Station resolution',
      detail: 'Resolve unmatched fuel station locations, operator brands, and parish geocoding.',
      queue: 'QUEUE 01',
      ref: 'REF: Q-STAT-KGN',
      linkLabel: 'Station resolution queue',
      Icon: Fuel,
    },
    {
      id: 'plug-places',
      label: 'Places review',
      detail: 'Audit imported town pins, parish coordinates, and landmark reference points.',
      queue: 'QUEUE 02',
      ref: 'REF: Q-GEO-PIN',
      linkLabel: 'Places & map imports queue',
      Icon: MapPin,
    },
    {
      id: 'catalog-quality',
      label: 'Catalog quality',
      detail: 'Review missing vehicle specifications, powertrain codes, and tariff fitments.',
      queue: 'QUEUE 03',
      ref: 'REF: Q-CAT-FIT',
      linkLabel: 'Vehicle catalog quality queue',
      Icon: Car,
    },
    {
      id: 'world-quality',
      label: 'Map quality',
      detail: 'Inspect cadastral boundary errors, western edge line gaps, and parish polygon anomalies.',
      queue: 'QUEUE 04',
      ref: 'REF: Q-POLY-BND',
      linkLabel: 'Map quality queue',
      Icon: Spline,
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-1 flex-col justify-start px-8 py-8 text-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
          <span>Dominion</span>
          <span className="text-slate-400" aria-hidden>
            ›
          </span>
          <span>Platform</span>
          <span className="text-slate-400" aria-hidden>
            ›
          </span>
          <span className="font-medium text-slate-900">Platform Ops</span>
        </nav>
        <div className="inline-flex items-center gap-2 rounded border border-slate-200 bg-slate-100 px-2.5 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
          <span className="font-mono text-xs font-medium text-slate-700">REGION: JM-KGN</span>
        </div>
      </div>

      <div className="mb-8">
        <h1 className="font-headline text-2xl font-bold tracking-tight text-slate-900">Platform Ops</h1>
        <p className="mt-1 text-sm text-slate-600">Work on data that is already published.</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-2">
        {items.map((item) => {
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className="group flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 text-left shadow-[0_1px_3px_rgba(0,0,0,0.03)] transition-all hover:border-slate-300"
            >
              <div>
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600">
                    <Icon className="h-[22px] w-[22px]" aria-hidden />
                  </div>
                  <span className="rounded border border-slate-100 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-400">
                    {item.queue}
                  </span>
                </div>
                <h2 className="font-headline text-base font-semibold text-slate-900 transition-colors group-hover:text-blue-600">
                  {item.label}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.detail}</p>
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-6">
                <span className="font-mono text-xs text-slate-500">{item.ref}</span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 transition-colors group-hover:text-blue-700">
                  <span>{item.linkLabel}</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
            <Info className="h-5 w-5" aria-hidden />
          </div>
          <span className="text-xs font-medium text-slate-700">The data is not in yet.</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-slate-300" />
          <span className="font-mono text-xs text-slate-500">LOC: KINGSTON / PARISH REGISTRY JMD</span>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between border-t border-slate-200/80 pt-4 font-mono text-[11px] text-slate-400">
        <div>SYS-ORIGIN: DOMINION-CARIBBEAN-NODE-01</div>
        <div>BOUNDS: 17.9712° N, 76.7936° W</div>
      </div>
    </div>
  );
}
