import React from 'react';
import { contactInitials } from '@/lib/contactGroups';
import { ON_SURFACE_VARIANT, PRIMARY, SURFACE_LOW } from '@/lib/passengerTheme';

type Member = { id: string; display_name: string };

type Props = {
  members: Member[];
  maxVisible?: number;
  size?: 'sm' | 'md';
  /** When false, renders nothing if there are no members (list rows already show member count). */
  showEmptyLabel?: boolean;
};

const SIZE = {
  sm: 'h-7 w-7 text-[10px] -ml-2 first:ml-0 ring-2',
  md: 'h-8 w-8 text-xs -ml-2.5 first:ml-0 ring-2',
} as const;

export function GroupMemberAvatarStack({
  members,
  maxVisible = 3,
  size = 'md',
  showEmptyLabel = true,
}: Props) {
  const visible = members.slice(0, maxVisible);
  const overflow = members.length - visible.length;

  if (!members.length) {
    if (!showEmptyLabel) return null;
    return (
      <span className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
        No members
      </span>
    );
  }

  return (
    <div className="flex items-center">
      {visible.map((m) => (
        <div
          key={m.id}
          className={`flex items-center justify-center rounded-full font-bold ring-[var(--passenger-surface)] ${SIZE[size]}`}
          style={{ backgroundColor: 'rgba(0,74,198,0.12)', color: PRIMARY }}
          title={m.display_name}
        >
          {contactInitials(m.display_name)}
        </div>
      ))}
      {overflow > 0 ? (
        <div
          className={`flex items-center justify-center rounded-full font-semibold ring-[var(--passenger-surface)] ${SIZE[size]}`}
          style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE_VARIANT }}
        >
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}
