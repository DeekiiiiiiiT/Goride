import React from 'react';
import { Trash2 } from 'lucide-react';
import type { RiderContactRow } from '@roam/types/riderContacts';
import { contactInitials } from '@/lib/contactGroups';
import {
  CARD_SHADOW,
  ERROR,
  ON_SECONDARY_FIXED,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  OUTLINE,
  PRIMARY,
  SECONDARY_FIXED,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

type Props = {
  contact: RiderContactRow;
  onOpen: () => void;
  onRemove: () => void;
  removing?: boolean;
};

export function TrustedContactListItem({ contact, onOpen, onRemove, removing }: Props) {
  const groupBadge = contact.groups?.[0]?.name;

  return (
    <div
      className="flex items-center justify-between rounded-[20px] p-4"
      style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
    >
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-4 text-left">
        <div
          className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold"
          style={{ backgroundColor: SECONDARY_FIXED, color: ON_SECONDARY_FIXED }}
        >
          {contactInitials(contact.display_name)}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-bold" style={{ color: ON_SURFACE }}>
              {contact.display_name}
            </p>
            {groupBadge ? (
              <span
                className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight"
                style={{ backgroundColor: 'rgba(0, 74, 198, 0.1)', color: PRIMARY }}
              >
                {groupBadge}
              </span>
            ) : null}
          </div>
          <p className="text-sm tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
            {formatPhoneDisplay(contact.phone_e164)}
          </p>
          {contact.last_shared_at ? (
            <p className="mt-0.5 text-xs" style={{ color: ON_SURFACE_VARIANT }}>
              Last shared {new Date(contact.last_shared_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
            </p>
          ) : null}
        </div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        className="rounded-full p-2 transition-colors active:scale-90 hover:text-[#ba1a1a] disabled:opacity-50"
        style={{ color: OUTLINE }}
        aria-label={`Remove ${contact.display_name}`}
      >
        <Trash2 className="h-5 w-5" style={{ color: ERROR }} aria-hidden />
      </button>
    </div>
  );
}
