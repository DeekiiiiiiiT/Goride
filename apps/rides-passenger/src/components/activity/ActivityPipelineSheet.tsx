import React, { useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { ActivityPipelineItem } from '@roam/types/rides';
import { formatMoneyMinor } from '@roam/types/rides';
import { formatShortAddress } from '@/lib/formatRideAddress';
import { formatScheduledWhen } from '@/lib/formatScheduledWhen';
import { ridesCancelScheduled } from '@/services/ridesEdge';
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
  onCancelled?: () => void;
};

export function ActivityPipelineSheet({ item, onClose, onCancelled }: ActivityPipelineSheetProps) {
  const [cancelling, setCancelling] = useState(false);

  if (!item) return null;

  const when = formatScheduledWhen(item.scheduled_at);
  const route = item.pickup_address || item.dropoff_address
    ? `${formatShortAddress(item.pickup_address)} → ${formatShortAddress(item.dropoff_address)}`
    : null;

  const canCancel = item.kind === 'schedule' && item.status === 'scheduled';

  const handleCancel = async () => {
    if (!canCancel) return;
    if (!window.confirm('Cancel this scheduled ride? You can book again anytime.')) return;
    setCancelling(true);
    try {
      await ridesCancelScheduled(item.id);
      toast.success('Scheduled ride cancelled');
      onCancelled?.();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not cancel ride.');
    } finally {
      setCancelling(false);
    }
  };

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
            Status: {item.status.replace(/_/g, ' ')}
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
            <p key={line} style={{ color: ON_SURFACE_VARIANT }}>
              {line.includes('JMD') || line.includes('USD') ? formatMoneyMinorFromLine(line) : line}
            </p>
          ))}
          {item.kind === 'schedule' ? (
            <p className="text-xs leading-relaxed" style={{ color: ON_SURFACE_VARIANT }}>
              Free cancellation anytime before we start matching a driver.
            </p>
          ) : null}
        </div>

        <div className="mt-6 space-y-3 border-t pt-4" style={{ borderColor: OUTLINE_VARIANT }}>
          {canCancel ? (
            <button
              type="button"
              onClick={() => void handleCancel()}
              disabled={cancelling}
              className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold disabled:opacity-50"
              style={{ color: '#b42318', border: '1px solid color-mix(in srgb, #b42318 35%, transparent)' }}
            >
              {cancelling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Cancelling…
                </>
              ) : (
                'Cancel scheduled ride'
              )}
            </button>
          ) : null}
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

function formatMoneyMinorFromLine(line: string): string {
  const match = line.match(/^(JMD|USD)\s+([\d.]+)\s+estimated$/i);
  if (!match) return line;
  const minor = Math.round(Number(match[2]) * 100);
  return `${formatMoneyMinor(minor, match[1])} estimated`;
}
