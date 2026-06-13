import React, { useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import type { RiderContactGroupRow, RiderContactRow } from '@roam/types/riderContacts';
import { formatRoamTagDisplay } from '@/services/roamTagEdge';
import { contactInitials, sortPinnedGroups } from '@/lib/contactGroups';
import { PinnedGroupsFilterRow } from '@/components/contacts/PinnedGroupsFilterRow';
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
  open: boolean;
  onClose: () => void;
  contacts: RiderContactRow[];
  groups: RiderContactGroupRow[];
  loading: boolean;
  query: string;
  onQueryChange: (value: string) => void;
  groupFilterId: string | null;
  onGroupFilterChange: (id: string | null) => void;
  selectedId: string | null;
  onSelect: (contact: RiderContactRow) => void;
};

export function RoamContactsPickerSheet({
  open,
  onClose,
  contacts,
  groups,
  loading,
  query,
  onQueryChange,
  groupFilterId,
  onGroupFilterChange,
  selectedId,
  onSelect,
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

  const pinnedGroups = useMemo(
    () => groups.filter((g) => g.is_pinned).sort(sortPinnedGroups),
    [groups],
  );

  const filtered = useMemo(() => {
    let list = contacts;
    if (groupFilterId) {
      list = list.filter((c) => c.groups?.some((g) => g.id === groupFilterId));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((c) => {
        const tag = c.custom_tag_name ? formatRoamTagDisplay(c.custom_tag_name).toLowerCase() : '';
        return c.display_name.toLowerCase().includes(q) || tag.includes(q);
      });
    }
    return [...list].sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [contacts, groupFilterId, query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="Close contacts"
        onClick={onClose}
      />
      <div
        className="relative z-10 flex max-h-[min(85dvh,640px)] w-full max-w-2xl flex-col rounded-t-3xl safe-x"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-bold" style={{ color: ON_SURFACE }}>
            Roam Contacts
          </h2>
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

        <div className="space-y-4 px-4 pb-3">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: ON_SURFACE_VARIANT }}
            />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search contacts"
              className="h-12 w-full rounded-2xl border-none pl-11 pr-4 outline-none focus:ring-2 focus:ring-[#004ac6]"
              style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
            />
          </div>

          <PinnedGroupsFilterRow
            pinnedGroups={pinnedGroups}
            selectedGroupId={groupFilterId}
            onSelectAll={() => onGroupFilterChange(null)}
            onSelectGroup={(id) => onGroupFilterChange(groupFilterId === id ? null : id)}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          {loading ? (
            <p className="py-8 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              Loading contacts…
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              No contacts found.
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(c);
                      onClose();
                    }}
                    className="flex w-full items-center gap-4 rounded-2xl p-4 text-left"
                    style={{
                      backgroundColor: SURFACE_LOWEST,
                      boxShadow: CARD_SHADOW,
                      outline: selectedId === c.id ? `2px solid ${PRIMARY}` : '2px solid transparent',
                    }}
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                      style={{ backgroundColor: 'rgba(0,74,198,0.1)', color: PRIMARY }}
                    >
                      {contactInitials(c.display_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.display_name}</p>
                      {c.custom_tag_name ? (
                        <p className="truncate text-sm font-medium" style={{ color: PRIMARY }}>
                          {formatRoamTagDisplay(c.custom_tag_name)}
                        </p>
                      ) : null}
                      {c.groups && c.groups.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {c.groups.slice(0, 2).map((g) => (
                            <span
                              key={g.id}
                              className="inline-flex items-center gap-1 rounded-full py-0.5 pl-1 pr-2 text-[11px] font-medium"
                              style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE_VARIANT }}
                            >
                              <GroupIconCircle
                                emoji={g.emoji}
                                color={g.color}
                                size="sm"
                                className="!h-4 !w-4 !text-[10px]"
                              />
                              {g.name}
                            </span>
                          ))}
                          {c.groups.length > 2 ? (
                            <span className="text-[11px]" style={{ color: ON_SURFACE_VARIANT }}>
                              +{c.groups.length - 2}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
