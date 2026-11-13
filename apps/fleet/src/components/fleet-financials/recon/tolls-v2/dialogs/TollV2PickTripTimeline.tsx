import React, { useMemo } from 'react';
import type { TollV2Charge, TollV2Suggestion } from '../types';
import { formatTimeJm, formatTripWindow } from '../tollV2Format';

function ms(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function TripTimelineRow({
  label,
  startMs,
  endMs,
  requestMs,
  minT,
  span,
  cash,
}: {
  label: string;
  startMs: number;
  endMs: number;
  requestMs: number;
  minT: number;
  span: number;
  cash: boolean;
}) {
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - minT) / span) * 100));
  const leadStart = requestMs - 45 * 60_000;
  return (
    <div className="space-y-1" data-testid="toll-v2-timeline-row">
      <p className="text-[11px] font-medium text-[#0b1c30]">{label}</p>
      <div className="relative h-10 w-full">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-[#cbd5e1]" />
        <div
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm bg-[#dce9ff]/80"
          style={{
            left: `${pct(Math.max(minT, leadStart))}%`,
            width: `${Math.max(0, pct(requestMs) - pct(Math.max(minT, leadStart)))}%`,
          }}
        />
        <div
          className={`absolute top-1/2 h-4 -translate-y-1/2 rounded-md ${
            cash ? 'border border-amber-200 bg-[#fffbeb]' : 'border border-[#93c5fd] bg-[#eff6ff]'
          }`}
          style={{
            left: `${pct(startMs)}%`,
            width: `${Math.max(2, pct(endMs) - pct(startMs))}%`,
          }}
        />
      </div>
    </div>
  );
}

export function TollV2PickTripTimeline({
  charge,
  suggestions,
}: {
  charge: TollV2Charge;
  suggestions: TollV2Suggestion[];
}) {
  const layout = useMemo(() => {
    const tollMs = ms(charge.occurredAt);
    if (tollMs == null) return null;
    const rows: Array<{
      label: string;
      start: number;
      end: number;
      requestMs: number;
      cash: boolean;
    }> = [];
    for (const s of suggestions) {
      const trip = s.trip;
      const requestMs = ms(trip?.requestAt) ?? ms(trip?.pickupAt);
      const endMs = ms(trip?.dropoffAt) ?? ms(trip?.pickupAt);
      const startMs = requestMs ?? tollMs;
      if (requestMs != null && endMs != null) {
        rows.push({
          label: formatTripWindow(trip),
          start: startMs,
          end: endMs,
          requestMs,
          cash: trip?.paymentMethod?.toLowerCase() === 'cash',
        });
      }
    }
    if (rows.length === 0) return null;
    const earliest = Math.min(...rows.map((r) => r.start), tollMs);
    const latest = Math.max(...rows.map((r) => r.end), tollMs);
    const minT = earliest - 30 * 60_000;
    const maxT = latest + 15 * 60_000;
    const span = maxT - minT || 1;
    const pct = (t: number) => Math.min(100, Math.max(0, ((t - minT) / span) * 100));
    return { tollMs, minT, span, pct, rows };
  }, [charge.occurredAt, suggestions]);

  if (!layout) return null;

  const tollLabel = `Toll ${formatTimeJm(charge.occurredAt)}`;
  // Five evenly spaced time labels under the rows (Stitch: an axis with tick labels).
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => layout.minT + f * layout.span);
  const tickLabel = (t: number) => formatTimeJm(new Date(t).toISOString());

  return (
    <div className="mb-4 rounded-xl border border-[#e5eeff] bg-[#f8f9ff] p-3" data-testid="toll-v2-pick-timeline">
      <div className="relative">
        {/* the toll: a label at the top and a line down through every trip row */}
        <div
          className="pointer-events-none absolute bottom-6 top-0 z-10 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${layout.pct(layout.tollMs)}%` }}
          data-testid="toll-v2-timeline-toll"
        >
          <span className="whitespace-nowrap rounded bg-[#030213] px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {tollLabel}
          </span>
          <div className="w-0.5 flex-1 bg-[#030213]" />
        </div>
        <div className="space-y-3 pt-7">
          {layout.rows.map((r, i) => (
            <TripTimelineRow
              key={i}
              label={r.label}
              startMs={r.start}
              endMs={r.end}
              requestMs={r.requestMs}
              minT={layout.minT}
              span={layout.span}
              cash={r.cash}
            />
          ))}
        </div>
        <div className="relative mt-1 h-5 border-t border-[#cbd5e1]" data-testid="toll-v2-timeline-axis">
          {ticks.map((t, i) => (
            <span
              key={i}
              className="absolute top-1 whitespace-nowrap text-[10px] text-[#47464c]"
              style={{
                left: `${(i / (ticks.length - 1)) * 100}%`,
                transform: i === 0 ? 'none' : i === ticks.length - 1 ? 'translateX(-100%)' : 'translateX(-50%)',
              }}
            >
              {tickLabel(t)}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-[#47464c]" data-testid="toll-v2-timeline-legend">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm border border-amber-200 bg-[#fffbeb]" /> Cash trip</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm border border-[#93c5fd] bg-[#eff6ff]" /> Card trip</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-[#dce9ff]/80" /> Driving to the pickup</span>
      </div>
    </div>
  );
}
