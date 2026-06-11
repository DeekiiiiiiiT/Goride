import React from 'react';
import { X } from 'lucide-react';
import type { ActivityPipelineItem } from '@roam/types/rides';
import { formatShortAddress } from '@/lib/formatRideAddress';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type ActivityPipelineSheetProps = {
  item: ActivityPipelineItem | null;
  onClose: () => void;
};

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ActivityPipelineSheet({ item, onClose }: ActivityPipelineSheetProps) {
  if (!item) return null;

  const when = formatWhen(item.scheduled_at);
  const route = item.pickup_address || item.dropoff_address
    ? `${formatShortAddress(item.pickup_address)} → ${formatShortAddress(item.dropoff_address)}`
    : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 safe-x" role="presentation">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        className="relative w-full max-w-xl rounded-t-[24px] px-5 pb-8 pt-4 safe-b"
        style={{ backgroundColor: SURFACE_LOWEST }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pipeline-sheet-title"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="pipeline-sheet-title" className="text-lg font-semibold" style={{ color: ON_SURFACE }}>
            {item.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2"
            style={{ color: ON_SURFACE_VARIANT }}
            aria-label="Close details"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          {item.subtitle ? (
            <p style={{ color: ON_SURFACE_VARIANT }}>{item.subtitle}</p>
          ) : null}
          <p style={{ color: PRIMARY }}>
            Status: {item.status}
          </p>
          {when ? (
            <p style={{ color: ON_SURFACE }}>
              Scheduled for {when}
            </p>
          ) : null}
          {route ? (
            <p style={{ color: ON_SURFACE_VARIANT }}>{route}</p>
          ) : null}
          {item.detail_lines.map((line) => (
            <p key={line} style={{ color: ON_SURFACE_VARIANT }}>{line}</p>
          ))}
        </div>

        <div className="mt-6 border-t pt-4" style={{ borderColor: OUTLINE_VARIANT }}>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl py-3 text-sm font-semibold"
            style={{ backgroundColor: PRIMARY, color: 'var(--passenger-on-primary)' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
