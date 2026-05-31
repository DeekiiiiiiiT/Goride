import React from 'react';
import { Loader2 } from 'lucide-react';
import type { RidesVehicleTypeDto } from '@/types/vehicleTypes';
import { vehicleCapacityDisplay } from '@/types/vehicleTypes';

type Variant = 'admin' | 'rider';
export type Density = 'default' | 'compact';

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
  density?: Density;
  /** @deprecated Use quoteBySlug for per-service fares */
  selectedEtaLine?: string | null;
  /** Per-service fare + ETA (Uber-style, shown on every row). */
  quoteBySlug?: Record<string, ServiceQuoteDisplay>;
};

function buildCompactMetaLine(
  v: RidesVehicleTypeDto,
  quote?: ServiceQuoteDisplay,
): string {
  const cap = vehicleCapacityDisplay(v);
  const tripMin =
    quote?.tripMinutes != null ? `~${Math.round(quote.tripMinutes)} min` : null;
  const eta = quote?.etaLine?.trim() || null;
  const timePart = tripMin ?? eta;
  return [cap, timePart].filter(Boolean).join(' · ');
}

function selectedDetailLine(v: RidesVehicleTypeDto): string | null {
  const tag = v.tagline?.trim();
  if (tag) return tag;
  const desc = v.description?.trim();
  if (!desc) return null;
  return desc.length <= 72 ? desc : `${desc.slice(0, 71)}…`;
}

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

function CompactOptionCard({
  v,
  active,
  onSelect,
  quote,
}: {
  v: RidesVehicleTypeDto;
  active: boolean;
  onSelect: () => void;
  quote?: ServiceQuoteDisplay;
}) {
  const metaLine = buildCompactMetaLine(v, quote);
  const detail = selectedDetailLine(v);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`home-service-row w-full touch-manipulation text-left ${active ? 'home-service-row--active' : ''}`}
    >
      {active && <span className="home-service-row__accent" aria-hidden />}
      <div className="home-service-row__body min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="home-service-row__label truncate">{v.label}</span>
          <div className="shrink-0 text-right pl-2">
            {quote?.loading ? (
              <Loader2
                className="h-4 w-4 animate-spin"
                style={{ color: 'var(--home-on-surface-muted)' }}
                aria-label="Loading fare"
              />
            ) : quote?.unavailable ? (
              <span className="home-service-row__price-muted">—</span>
            ) : quote?.fareLabel ? (
              <span className="home-service-row__price tabular-nums">{quote.fareLabel}</span>
            ) : (
              <span className="home-service-row__price-muted">—</span>
            )}
          </div>
        </div>
        {metaLine && (
          <p className="home-service-row__meta truncate tabular-nums">{metaLine}</p>
        )}
        {detail && <p className="home-service-row__detail line-clamp-2">{detail}</p>}
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
  density = 'default',
  selectedEtaLine,
  quoteBySlug,
}: Props) {
  const isCompact = density === 'compact' && variant === 'rider';
  const sectionTitle =
    variant === 'admin'
      ? 'text-xs font-semibold uppercase tracking-wide text-slate-500'
      : 'text-xs font-semibold uppercase tracking-wide text-zinc-500';
  const listGap = isCompact ? 'home-service-list home-service-list--fill' : 'space-y-2';
  const listManyClass =
    isCompact && services.length >= 4 ? ' home-service-list--many' : '';
  const rootGap = isCompact ? 'flex min-h-0 flex-1 flex-col' : 'space-y-4';

  const renderCard = (v: RidesVehicleTypeDto) => {
    if (isCompact) {
      return (
        <CompactOptionCard
          key={v.slug}
          v={v}
          active={selected === v.slug}
          onSelect={() => onSelect(v.slug)}
          quote={quoteBySlug?.[v.slug]}
        />
      );
    }
    return (
      <OptionCard
        key={v.slug}
        v={v}
        active={selected === v.slug}
        onSelect={() => onSelect(v.slug)}
        variant={variant}
        etaLine={selected === v.slug ? selectedEtaLine : null}
        quote={quoteBySlug?.[v.slug]}
      />
    );
  };

  return (
    <div className={rootGap}>
      {vehicles.length > 0 && (
        <div className={isCompact ? listGap : 'space-y-2'}>
          {!isCompact && <p className={sectionTitle}>Vehicle types</p>}
          <div className={listGap}>{vehicles.map(renderCard)}</div>
        </div>
      )}
      {services.length > 0 && (
        <div className={isCompact ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'space-y-2'}>
          {!isCompact && <p className={sectionTitle}>Services</p>}
          <div
            className={`${listGap}${listManyClass}`}
            style={
              isCompact
                ? ({ '--home-service-count': services.length } as React.CSSProperties)
                : undefined
            }
          >
            {services.map(renderCard)}
          </div>
        </div>
      )}
    </div>
  );
}
