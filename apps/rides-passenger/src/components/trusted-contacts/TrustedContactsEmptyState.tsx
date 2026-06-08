import React from 'react';
import { Shield, UserPlus } from 'lucide-react';
import {
  ON_SURFACE_VARIANT,
  OUTLINE_VARIANT,
  PRIMARY,
  SURFACE_LOW,
} from '@/lib/passengerTheme';

type Props = {
  onAdd: () => void;
};

export function TrustedContactsEmptyState({ onAdd }: Props) {
  return (
    <div
      className="flex w-full max-h-[340px] aspect-square flex-col items-center justify-center rounded-[24px] border-2 border-dashed p-8 text-center transition-colors hover:bg-[rgba(0,74,198,0.03)]"
      style={{ borderColor: OUTLINE_VARIANT, backgroundColor: 'rgba(255,255,255,0.5)' }}
    >
      <div className="relative mb-6">
        <div
          className="flex h-24 w-24 items-center justify-center rounded-full"
          style={{ backgroundColor: SURFACE_LOW }}
        >
          <UserPlus className="h-12 w-12" style={{ color: ON_SURFACE_VARIANT }} aria-hidden />
        </div>
        <div
          className="absolute -bottom-2 -right-2 flex h-10 w-10 items-center justify-center rounded-full border-2 bg-white shadow-sm"
          style={{ borderColor: SURFACE_LOW }}
        >
          <Shield className="h-5 w-5" style={{ color: PRIMARY }} fill={PRIMARY} aria-hidden />
        </div>
      </div>
      <p className="mb-8 max-w-[240px] text-base" style={{ color: ON_SURFACE_VARIANT }}>
        No trusted contacts yet. Add people from Roam Contacts who should receive live trip updates.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full max-w-[280px] items-center justify-center gap-2 rounded-xl py-4 text-sm font-semibold text-white shadow-lg transition-all active:scale-[0.98] hover:opacity-90"
        style={{ backgroundColor: '#1A1A1A' }}
      >
        <UserPlus className="h-5 w-5" aria-hidden />
        Add from Roam Contacts
      </button>
    </div>
  );
}
