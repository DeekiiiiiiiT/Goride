import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { formatGuestPhoneDisplay } from '@/lib/guestRecipientBooking';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PRIMARY,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type Props = {
  open: boolean;
  onClose: () => void;
  fullName: string;
  onFullNameChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  saveToRoam: boolean;
  onSaveToRoamChange: (value: boolean) => void;
  onConfirm: () => void;
};

export function ManualRecipientSheet({
  open,
  onClose,
  fullName,
  onFullNameChange,
  phone,
  onPhoneChange,
  saveToRoam,
  onSaveToRoamChange,
  onConfirm,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const phoneDigits = phone.replace(/\D/g, '');
  const canConfirm = fullName.trim().length > 0 && phoneDigits.length >= 10;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-2xl rounded-t-3xl safe-x"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-bold" style={{ color: ON_SURFACE }}>Enter details</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2"
            style={{ color: ON_SURFACE_VARIANT }}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            Add the rider&apos;s name and phone number for SMS updates.
          </p>
          <input
            value={fullName}
            onChange={(e) => onFullNameChange(e.target.value)}
            placeholder="Full name"
            autoFocus
            className="h-14 w-full rounded-xl border-none px-4 outline-none focus:ring-2 focus:ring-[#004ac6]/30"
            style={{ backgroundColor: SURFACE_LOW }}
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => onPhoneChange(formatGuestPhoneDisplay(e.target.value))}
            placeholder="(555) 000-0000"
            className="h-14 w-full rounded-xl border-none px-4 outline-none focus:ring-2 focus:ring-[#004ac6]/30"
            style={{ backgroundColor: SURFACE_LOW }}
          />
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={saveToRoam}
              onChange={(e) => onSaveToRoamChange(e.target.checked)}
              className="h-4 w-4 rounded"
            />
            Save to Roam Contacts for next time
          </label>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className="flex h-14 w-full items-center justify-center rounded-2xl text-base font-semibold disabled:opacity-50"
            style={{ backgroundColor: PRIMARY, color: '#fff' }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
