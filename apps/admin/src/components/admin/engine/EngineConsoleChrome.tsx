// Stitch: dominion-redesign/9f3ed86902e5469baf7d6f8ced78c75e
import React from 'react';
import { Fuel, Info, MemoryStick, Network, Route } from 'lucide-react';

export type EngineProduct = 'fuel' | 'toll' | 'matching';

const PRODUCTS: { id: EngineProduct; page: string; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'fuel', page: 'fuel-brain', label: 'Fuel', Icon: Fuel },
  { id: 'toll', page: 'toll-brain', label: 'Toll', Icon: Route },
  { id: 'matching', page: 'matching-brain', label: 'Matching', Icon: Network },
];

export function EngineConsoleChrome({
  active,
  onNavigate,
  children,
  statusLabel = 'Active',
}: {
  active: EngineProduct;
  onNavigate?: (page: string) => void;
  children: React.ReactNode;
  statusLabel?: string;
}) {
  return (
    <div className="min-h-[calc(100vh-4rem)] space-y-6 bg-slate-50 p-8 text-slate-900">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs text-slate-500">
            <span>Dominion</span>
            <span className="text-slate-300">/</span>
            <span>Engines</span>
            <span className="text-slate-300">/</span>
            <span className="font-medium text-slate-900">Engine</span>
          </nav>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 font-mono text-[11px] text-slate-600">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            <span>REGION: JM-KGN</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Engine</h1>
            <p className="mt-1 text-xs text-slate-500">
              Unified runtime engines console for parish routing, dispatching, and settlement.
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {PRODUCTS.map(({ id, page, label, Icon }) => {
              const selected = id === active;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate?.(page)}
                  className={
                    selected
                      ? 'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm'
                      : 'inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900'
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-[12px] border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600">
            <MemoryStick className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-900">Active Engine Services</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {statusLabel}
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] text-slate-400">
              Kingston &amp; St. Andrew Parish Partition (JM-01)
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-600">
            CURRENCY: JMD
          </span>
          <span className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-slate-600">
            LOC: KINGSTON
          </span>
        </div>
      </div>

      {children}

      <div className="flex items-center justify-between rounded-[12px] border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-slate-400" aria-hidden />
          <span className="italic text-slate-600">The data is not in yet.</span>
        </div>
        <div className="font-mono text-[11px] text-slate-400">LOC: KINGSTON / PARISH REGISTRY JMD</div>
      </div>
    </div>
  );
}

export function EnginePanelHeader({
  icon,
  title,
  description,
  engineRef,
  badge,
  badgeTone = 'selected',
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  engineRef: string;
  badge: string;
  badgeTone?: 'selected' | 'standby' | 'active';
}) {
  const badgeClass =
    badgeTone === 'selected'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : 'border-slate-200 bg-slate-100 text-slate-600';
  return (
    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-600">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-semibold leading-tight text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-slate-400">{engineRef}</span>
        <span className={`rounded border px-2 py-0.5 font-mono text-[10px] font-medium ${badgeClass}`}>
          {badge}
        </span>
      </div>
    </div>
  );
}
