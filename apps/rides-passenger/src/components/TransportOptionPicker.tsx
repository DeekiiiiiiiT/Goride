import React from 'react';
import { Loader2 } from 'lucide-react';
import type { RidesVehicleTypeDto } from '@/types/vehicleTypes';
import { vehicleCapacityDisplay } from '@/types/vehicleTypes';

type Variant = 'admin' | 'rider';

export type ServiceQuoteDisplay = {
  fareLabel: string | null;
  etaLine?: string | null;
  tripMinutes?: number | null;
  loading?: boolean;
  unavailable?: boolean;
};

type Props = {
  vehicles: RidesVehicleTypeDto[];
  services: RidesVehicleTypeDto[];
  selected: string;
  onSelect: (slug: string) => void;
  variant?: Variant;
  /** @deprecated Use quoteBySlug for per-service fares */
  selectedEtaLine?: string | null;
  /** Per-service fare + ETA (Uber-style, shown on every row). */
  quoteBySlug?: Record<string, ServiceQuoteDisplay>;
};

function OptionCard({
  v,
  active,
  onSelect,
  variant,
  etaLine,
  quote,
}: {
  v: RidesVehicleTypeDto;
  active: boolean;
  onSelect: () => void;
  variant: Variant;
  etaLine?: string | null;
  quote?: ServiceQuoteDisplay;
}) {
  if (variant === 'admin') {
    return (
      <button
        type="button"
        onClick={onSelect}
        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
          active
            ? 'border-emerald-500/60 bg-emerald-500/10'
            : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
        }`}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className={`font-medium text-sm ${active ? 'text-emerald-200' : 'text-white'}`}>
            {v.label}
          </span>
          <span className="text-[11px] text-slate-500 shrink-0">{vehicleCapacityDisplay(v)}</span>
        </div>
        {etaLine && (
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">{etaLine}</p>
        )}
        <p className="text-xs text-slate-400 mt-0.5">{v.description}</p>
        {v.tagline && <p className="text-[11px] text-slate-500 mt-1">{v.tagline}</p>}
      </button>
    );
  }

  const displayEta = quote?.etaLine ?? etaLine;
  const tripMin =
    quote?.tripMinutes != null ? `~${Math.round(quote.tripMinutes)} min` : null;
  const metaLine = [vehicleCapacityDisplay(v), tripMin, displayEta]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border px-4 py-3 text-left touch-manipulation transition-colors ${
        active
          ? 'border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600/30'
          : 'border-zinc-200 bg-zinc-50 hover:bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="font-semibold text-sm text-zinc-900">{v.label}</span>
          {metaLine && (
            <p className="text-xs text-zinc-500 mt-0.5 tabular-nums leading-snug">{metaLine}</p>
          )}
          <p className="text-xs text-zinc-600 mt-0.5 leading-snug line-clamp-2">{v.description}</p>
          {v.tagline && <p className="text-[11px] text-zinc-500 mt-1">{v.tagline}</p>}
        </div>
        <div className="shrink-0 text-right pt-0.5 min-w-[5.5rem]">
          {quote?.loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-zinc-400 ml-auto" aria-label="Loading fare" />
          ) : quote?.unavailable ? (
            <span className="text-xs text-zinc-400">—</span>
          ) : quote?.fareLabel ? (
            <span className="text-sm font-semibold tabular-nums text-zinc-900">{quote.fareLabel}</span>
          ) : (
            <span className="text-xs text-zinc-400">—</span>
          )}
        </div>
      </div>
    </button>
  );
}

export function TransportOptionPicker({
  vehicles,
  services,
  selected,
  onSelect,
  variant = 'rider',
  selectedEtaLine,
  quoteBySlug,
}: Props) {
  const sectionTitle =
    variant === 'admin'
      ? 'text-xs font-semibold uppercase tracking-wide text-slate-500'
      : 'text-xs font-semibold uppercase tracking-wide text-zinc-500';

  return (
    <div className="space-y-4">
      {vehicles.length > 0 && (
        <div className="space-y-2">
          <p className={sectionTitle}>Vehicle types</p>
          <div className="space-y-2">
            {vehicles.map((v) => (
              <OptionCard
                key={v.slug}
                v={v}
                active={selected === v.slug}
                onSelect={() => onSelect(v.slug)}
                variant={variant}
                etaLine={selected === v.slug ? selectedEtaLine : null}
                quote={quoteBySlug?.[v.slug]}
              />
            ))}
          </div>
        </div>
      )}
      {services.length > 0 && (
        <div className="space-y-2">
          <p className={sectionTitle}>Services</p>
          <div className="space-y-2">
            {services.map((v) => (
              <OptionCard
                key={v.slug}
                v={v}
                active={selected === v.slug}
                onSelect={() => onSelect(v.slug)}
                variant={variant}
                etaLine={selected === v.slug ? selectedEtaLine : null}
                quote={quoteBySlug?.[v.slug]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
