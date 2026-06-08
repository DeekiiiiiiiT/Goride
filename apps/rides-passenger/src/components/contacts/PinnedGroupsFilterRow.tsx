import React from 'react';
import { Users } from 'lucide-react';
import type { RiderContactGroupRow } from '@roam/types/riderContacts';
import { GroupIconCircle } from '@/components/contacts/GroupIconCircle';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PRIMARY,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type Props = {
  pinnedGroups: RiderContactGroupRow[];
  selectedGroupId: string | null;
  onSelectAll: () => void;
  onSelectGroup: (groupId: string) => void;
};

/** Four cards visible in the scroll viewport (3 gaps × 0.5rem). */
const CARD_WIDTH = 'calc((100% - 1.5rem) / 4)';

function GroupFilterCard({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex shrink-0 snap-start flex-col items-center gap-1 rounded-xl p-2 text-center transition-transform active:scale-[0.98]"
      style={{
        width: CARD_WIDTH,
        backgroundColor: SURFACE_LOWEST,
        boxShadow: CARD_SHADOW,
        outline: selected ? `2px solid ${PRIMARY}` : '2px solid transparent',
      }}
    >
      {children}
    </button>
  );
}

export function PinnedGroupsFilterRow({
  pinnedGroups,
  selectedGroupId,
  onSelectAll,
  onSelectGroup,
}: Props) {
  if (pinnedGroups.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
        PINNED GROUPS
      </p>
      <div className="-mx-4 flex w-full snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1">
        <GroupFilterCard selected={selectedGroupId === null} onClick={onSelectAll}>
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: SURFACE_LOW, color: PRIMARY }}
          >
            <Users className="h-4 w-4" aria-hidden />
          </div>
          <p className="w-full truncate text-xs font-semibold leading-tight" style={{ color: ON_SURFACE }}>
            All
          </p>
          <p className="w-full truncate text-[10px] leading-tight" style={{ color: ON_SURFACE_VARIANT }}>
            Everyone
          </p>
        </GroupFilterCard>

        {pinnedGroups.map((g) => {
          const selected = selectedGroupId === g.id;
          const count = g.member_count ?? 0;
          return (
            <GroupFilterCard key={g.id} selected={selected} onClick={() => onSelectGroup(g.id)}>
              <GroupIconCircle emoji={g.emoji} color={g.color} size="xs" />
              <p className="w-full truncate text-xs font-semibold leading-tight" style={{ color: ON_SURFACE }}>
                {g.name}
              </p>
              <p className="w-full truncate text-[10px] leading-tight" style={{ color: ON_SURFACE_VARIANT }}>
                {count} {count === 1 ? 'member' : 'members'}
              </p>
            </GroupFilterCard>
          );
        })}
      </div>
    </div>
  );
}
