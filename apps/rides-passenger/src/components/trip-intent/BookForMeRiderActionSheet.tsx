import React from 'react';
import { Loader2, MapPin, X } from 'lucide-react';
import type { BookForOthersIntentActivityItem } from '@roam/types/riderContacts';
import { formatShortAddress } from '@/lib/formatRideAddress';
import {
  bookForMeDetail,
  bookForMeHeadline,
} from '@/lib/bookForMeIntentUi';
import { SHADOW_ROAM_LABEL, OPEN_ROAM_LABEL } from '@/lib/tripIntentCopy';
import { formatFareMinor } from '@/services/tripIntentEdge';
import {
  ERROR,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

function formatBookCountdown(bookByAt: string | null | undefined): string | null {
  if (!bookByAt) return null;
  const ms = new Date(bookByAt).getTime() - Date.now();
  if (ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

type Props = {
  open: boolean;
  item: BookForOthersIntentActivityItem | null;
  booking?: boolean;
  cancelling?: boolean;
  onClose: () => void;
  onBook: (item: BookForOthersIntentActivityItem) => void;
  onCancel: (item: BookForOthersIntentActivityItem) => void;
};

export function BookForMeRiderActionSheet({
  open,
  item,
  booking,
  cancelling,
  onClose,
  onBook,
  onCancel,
}: Props) {
  if (!open || !item) return null;

  const bookCountdown = formatBookCountdown(item.book_by_at);
  const canBook = item.status === 'claimed' && item.can_book !== false && bookCountdown !== '0:00';
  const busy = booking || cancelling;
  const modeLabel = item.roam_mode === 'shadow_roam' ? SHADOW_ROAM_LABEL : OPEN_ROAM_LABEL;
  const fare =
    item.fare_estimate_minor && item.currency
      ? formatFareMinor(item.fare_estimate_minor, item.currency)
      : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 safe-x" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        className="relative w-full max-w-lg rounded-t-3xl px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl"
        style={{ backgroundColor: PAGE_BG }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold" style={{ color: ON_SURFACE }}>
            {bookForMeHeadline(item)}
          </h2>
          <button type="button" onClick={onClose} className="rounded-full p-2" aria-label="Close">
            <X className="h-5 w-5" style={{ color: ON_SURFACE_VARIANT }} />
          </button>
        </div>

        <div className="space-y-4">
          <p className="text-sm leading-relaxed" style={{ color: ON_SURFACE_VARIANT }}>
            {bookForMeDetail(item, { bookCountdown })}
          </p>

          <div
            className="rounded-2xl px-4 py-3"
            style={{ backgroundColor: SURFACE_LOWEST }}
          >
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              {modeLabel}
            </p>
            {fare ? (
              <p className="mt-1 text-xl font-bold" style={{ color: ON_SURFACE }}>
                {fare}
              </p>
            ) : null}
            {item.pickup_address ? (
              <p className="mt-2 flex items-start gap-1.5 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  {formatShortAddress(item.pickup_address)}
                  {item.dropoff_address ? ` → ${formatShortAddress(item.dropoff_address)}` : ''}
                </span>
              </p>
            ) : null}
          </div>

          {canBook ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onBook(item)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl font-semibold disabled:opacity-50"
              style={{ backgroundColor: PRIMARY, color: ON_PRIMARY }}
            >
              {booking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {booking ? 'Booking…' : 'Book ride'}
            </button>
          ) : null}

          <button
            type="button"
            disabled={busy}
            onClick={() => onCancel(item)}
            className="w-full py-2 text-sm font-medium disabled:opacity-50"
            style={{ color: ERROR }}
          >
            {cancelling ? 'Cancelling…' : 'Cancel trip'}
          </button>
        </div>
      </div>
    </div>
  );
}
