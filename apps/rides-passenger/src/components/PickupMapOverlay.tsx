import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { PickupMapSelector, type PickupLocation } from '@/components/PickupMapSelector';
import { GpsAccuracyBadge } from '@/components/GpsAccuracyBadge';

type Props = {
  open: boolean;
  onClose: () => void;
  pickup: { lat: number; lng: number } | null;
  accuracy: number | null;
  onPickupChange: (location: PickupLocation) => void;
  isLoading?: boolean;
};

export function PickupMapOverlay({
  open,
  onClose,
  pickup,
  accuracy,
  onPickupChange,
  isLoading = false,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-label="Adjust pickup location">
      <button
        type="button"
        className="absolute inset-0 bg-zinc-900/50 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div className="relative mt-auto flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl safe-b">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3 safe-t">
          <div className="min-w-0">
            <p className="font-semibold text-zinc-900">Adjust pickup pin</p>
            <p className="text-xs text-zinc-500">Drag the map so the pin is exactly where you are</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <GpsAccuracyBadge accuracyMeters={accuracy} />
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 touch-manipulation"
              aria-label="Done"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 p-4 pb-5">
          <PickupMapSelector
            pickup={pickup}
            accuracy={accuracy}
            onPickupChange={onPickupChange}
            isLoading={isLoading}
            className="h-[min(52dvh,420px)]"
          />
        </div>
        <div className="shrink-0 border-t border-zinc-100 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-touch w-full rounded-2xl bg-emerald-600 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 touch-manipulation"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
