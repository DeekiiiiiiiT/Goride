import React, { useState } from 'react';
import type { RiderContactGroupRow } from '@roam/types/riderContacts';
import { GroupIconCircle } from '@/components/contacts/GroupIconCircle';
import { groupColorStyle, isSystemGroupName } from '@/lib/contactGroups';
import { ON_SURFACE, ON_SURFACE_VARIANT, PRIMARY, SURFACE_LOW } from '@/lib/passengerTheme';

export function ContactGroupPicker({
  groups,
  selectedIds,
  onChange,
  onCreateGroup,
}: {
  groups: RiderContactGroupRow[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onCreateGroup?: (name: string) => void;
}) {
  const [newGroup, setNewGroup] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const sorted = [...groups].sort((a, b) => {
    if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
        GROUPS
      </label>
      <div className="flex flex-wrap gap-2">
        {sorted.map((g) => {
          const selected = selectedIds.includes(g.id);
          const { bg } = groupColorStyle(g.color);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id)}
              className="flex items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-medium"
              style={{
                backgroundColor: selected ? bg : SURFACE_LOW,
                color: selected ? PRIMARY : ON_SURFACE,
                outline: selected ? `2px solid ${PRIMARY}` : 'none',
              }}
            >
              <GroupIconCircle emoji={g.emoji} color={g.color} size="sm" className="!h-7 !w-7 !text-base" />
              {g.name}
            </button>
          );
        })}
      </div>
      {onCreateGroup ? (
        <div className="space-y-1">
          <div className="flex gap-2">
            <input
              type="text"
              value={newGroup}
              onChange={(e) => {
                setNewGroup(e.target.value);
                setCreateError(null);
              }}
              placeholder="New group name"
              className="h-10 min-w-0 flex-1 rounded-xl border-none px-3 text-sm outline-none focus:ring-2 focus:ring-[#004ac6]"
              style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
            />
            <button
              type="button"
              disabled={!newGroup.trim()}
              onClick={() => {
                const name = newGroup.trim();
                if (!name) return;
                if (isSystemGroupName(name)) {
                  setCreateError('That name is reserved. Pick an existing default group.');
                  return;
                }
                onCreateGroup(name);
                setNewGroup('');
                setCreateError(null);
              }}
              className="rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: PRIMARY, color: '#fff' }}
            >
              Add
            </button>
          </div>
          {createError ? (
            <p className="text-xs" style={{ color: '#b91c1c' }} role="alert">
              {createError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
