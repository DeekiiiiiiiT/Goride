import React from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { RiderContactGroupRow } from '@roam/types/riderContacts';
import { GroupIconCircle } from '@/components/contacts/GroupIconCircle';
import { groupColorStyle } from '@/lib/contactGroups';
import { ON_SURFACE, ON_SURFACE_VARIANT, PRIMARY, SURFACE_LOW } from '@/lib/passengerTheme';

export function ContactGroupPicker({
  groups,
  selectedIds,
  onChange,
}: {
  groups: RiderContactGroupRow[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const sorted = [...groups].sort((a, b) => {
    if (a.is_system !== b.is_system) return a.is_system ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const selectedGroups = sorted.filter((g) => selectedIds.includes(g.id));
  const availableGroups = sorted.filter((g) => !selectedIds.includes(g.id));

  const addGroup = (id: string) => {
    if (!id || selectedIds.includes(id)) return;
    onChange([...selectedIds, id]);
  };

  const removeGroup = (id: string) => {
    onChange(selectedIds.filter((x) => x !== id));
  };

  return (
    <div className="space-y-3">
      <label className="block text-xs font-bold tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
        GROUPS
      </label>
      <div className="relative">
        <select
          value=""
          onChange={(e) => addGroup(e.target.value)}
          disabled={availableGroups.length === 0}
          className="h-12 w-full appearance-none rounded-xl border-none py-0 pl-4 pr-10 text-sm outline-none focus:ring-2 focus:ring-[#004ac6] disabled:opacity-50"
          style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
          aria-label="Add contact to group"
        >
          <option value="" disabled>
            {availableGroups.length === 0 ? 'All groups selected' : 'Select group'}
          </option>
          {availableGroups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2"
          style={{ color: ON_SURFACE_VARIANT }}
          aria-hidden
        />
      </div>
      {selectedGroups.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {selectedGroups.map((g) => {
            const { bg } = groupColorStyle(g.color);
            return (
              <span
                key={g.id}
                className="inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 text-sm font-medium"
                style={{ backgroundColor: bg, color: PRIMARY }}
              >
                <GroupIconCircle emoji={g.emoji} color={g.color} size="sm" className="!h-6 !w-6 !text-sm" />
                {g.name}
                <button
                  type="button"
                  onClick={() => removeGroup(g.id)}
                  className="rounded-full p-0.5"
                  aria-label={`Remove from ${g.name}`}
                  style={{ color: ON_SURFACE_VARIANT }}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
