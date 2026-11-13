import React, { useMemo } from 'react';
import type { TollV2Charge, TollV2Suggestion } from '../types';
import { formatTimeJm } from '../tollV2Format';

function ms(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
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
    const spans: Array<{ start: number; end: number; cash: boolean; requestMs: number }> = [];
    for (const s of suggestions) {
      const trip = s.trip;
      const requestMs = ms(trip?.requestAt) ?? ms(trip?.pickupAt);
      const endMs = ms(trip?.dropoffAt) ?? ms(trip?.pickupAt);
      const startMs = requestMs ?? tollMs;
      if (requestMs != null && endMs != null) {
        spans.push({
          start: startMs,
          end: endMs,
          cash: trip?.paymentMethod?.toLowerCase() === 'cash',
          requestMs,
        });
      }
    }
    if (spans.length === 0) return null;
    const earliest = Math.min(...spans.map((s) => s.start), tollMs);
    const latest = Math.max(...spans.map((s) => s.end), tollMs);
    const minT = earliest - 30 * 60_000;
    const maxT = latest + 15 * 60_000;
    const span = maxT - minT || 1;
    const pct = (t: number) => Math.min(100, Math.max(0, ((t - minT) / span) * 100));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => minT + span * f);
    return { tollMs, minT, span, pct, spans, ticks };
  }, [charge.occurredAt, suggestions]);

  if (!layout) return null;

  return (
    <div className="mb-4 rounded-xl border border-[#e5eeff] bg-[#f8f9ff] p-3">
      <div className="relative h-16 w-full">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-[#cbd5e1]" />
        {layout.ticks.map((t, i) => (
          <span
            key={i}
            className="absolute top-[calc(50%+10px)] -translate-x-1/2 text-[10px] tabular-nums text-[#47464c]"
            style={{ left: `${layout.pct(t)}%` }}
          >
            {formatTimeJm(new Date(t).toISOString())}
          </span>
        ))}
        <div
          className="absolute top-1/2 z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#030213]"
          style={{ left: `${layout.pct(layout.tollMs)}%` }}
          title={formatTimeJm(charge.occurredAt)}
        />
        {layout.spans.map((s, i) => {
          const leadStart = s.requestMs - 45 * 60_000;
          return (
            <React.Fragment key={i}>
              <div
                className="absolute top-1/2 h-4 -translate-y-1/2 rounded-sm bg-[#dce9ff]/80"
                style={{
                  left: `${layout.pct(Math.max(layout.minT, leadStart))}%`,
                  width: `${Math.max(0, layout.pct(s.requestMs) - layout.pct(Math.max(layout.minT, leadStart)))}%`,
                }}
              />
              <div
                className={`absolute top-1/2 h-5 -translate-y-1/2 rounded-md ${
                  s.cash ? 'bg-[#fffbeb] border border-amber-200' : 'bg-[#eff6ff] border border-[#93c5fd]'
                }`}
                style={{
                  left: `${layout.pct(s.start)}%`,
                  width: `${Math.max(2, layout.pct(s.end) - layout.pct(s.start))}%`,
                }}
              />
            </React.Fragment>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap gap-3 text-[11px] text-[#47464c]">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded bg-[#fffbeb] border border-amber-200" /> Cash trip
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded bg-[#eff6ff] border border-[#93c5fd]" /> Card trip
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-4 rounded bg-[#dce9ff]/80" /> Pickup lead
        </span>
      </div>
    </div>
  );
}
