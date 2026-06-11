import React from 'react';
import { formatGuestPhoneDisplay } from '@/lib/guestRecipientBooking';
import { ON_SURFACE, ON_SURFACE_VARIANT, SURFACE_LOW } from '@/lib/passengerTheme';

type Props = {
  displayName: string;
  onDisplayNameChange: (value: string) => void;
  phone: string;
  onPhoneChange: (value: string) => void;
  nameAutoFocus?: boolean;
};

export function ContactFormFields({
  displayName,
  onDisplayNameChange,
  phone,
  onPhoneChange,
  nameAutoFocus = false,
}: Props) {
  return (
    <>
      <div>
        <label className="mb-2 block text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
          NAME
        </label>
        <input
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder="Full name"
          autoFocus={nameAutoFocus}
          className="h-12 w-full rounded-xl border-none px-4 outline-none focus:ring-2 focus:ring-[#004ac6]/30"
          style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
        />
      </div>
      <div>
        <label className="mb-2 block text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
          PHONE
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => onPhoneChange(formatGuestPhoneDisplay(e.target.value))}
          placeholder="(555) 000-0000"
          className="h-12 w-full rounded-xl border-none px-4 outline-none focus:ring-2 focus:ring-[#004ac6]/30"
          style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
        />
      </div>
    </>
  );
}
