import React, { useState } from 'react';
import type { RiderContactGroupRow } from '@roam/types/riderContacts';
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

  const toggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((x) => x !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
        GROUPS
      </label>
      <div className="flex flex-wrap gap-2">
        {groups.map((g) => {
          const selected = selectedIds.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id)}
              className="rounded-full px-3 py-1.5 text-sm font-medium"
              style={{
                backgroundColor: selected ? PRIMARY : SURFACE_LOW,
                color: selected ? '#fff' : ON_SURFACE,
              }}
            >
              {g.name}
            </button>
          );
        })}
      </div>
      {onCreateGroup ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
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
              onCreateGroup(name);
              setNewGroup('');
            }}
            className="rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: PRIMARY, color: '#fff' }}
          >
            Add
          </button>
        </div>
      ) : null}
    </div>
  );
}
