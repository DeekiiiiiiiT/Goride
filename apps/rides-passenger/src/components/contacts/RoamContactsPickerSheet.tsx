import React, { useEffect } from 'react';
import { Search, X } from 'lucide-react';
import type { RiderContactGroupRow, RiderContactRow } from '@roam/types/riderContacts';
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

  if (!open) return null;

  const filtered = contacts.filter((c) => {
    if (groupFilterId && !c.groups?.some((g) => g.id === groupFilterId)) return false;
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return c.display_name.toLowerCase().includes(q) || c.phone_e164.includes(q);
  });

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
          <h2 className="text-lg font-bold" style={{ color: ON_SURFACE }}>Roam Contacts</h2>
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

        <div className="px-5 pb-3">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: ON_SURFACE_VARIANT }}
            />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search Roam Contacts"
              className="h-12 w-full rounded-2xl pl-11 pr-4 outline-none focus:ring-2 focus:ring-[#004ac6]/30"
              style={{ backgroundColor: SURFACE_LOW }}
            />
          </div>
        </div>

        {groups.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto px-5 pb-3">
            <button
              type="button"
              onClick={() => onGroupFilterChange(null)}
              className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium"
              style={{
                backgroundColor: groupFilterId === null ? PRIMARY : SURFACE_LOW,
                color: groupFilterId === null ? '#fff' : ON_SURFACE,
              }}
            >
              All
            </button>
            {groups.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => onGroupFilterChange(g.id)}
                className="shrink-0 rounded-full px-3 py-1.5 text-sm font-medium"
                style={{
                  backgroundColor: groupFilterId === g.id ? PRIMARY : SURFACE_LOW,
                  color: groupFilterId === g.id ? '#fff' : ON_SURFACE,
                }}
              >
                {g.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
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
                    className="flex w-full items-center gap-3 rounded-2xl p-4 text-left"
                    style={{
                      backgroundColor: SURFACE_LOW,
                      borderWidth: 2,
                      borderStyle: 'solid',
                      borderColor: selectedId === c.id ? PRIMARY : 'transparent',
                    }}
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                      style={{ backgroundColor: 'rgba(0,74,198,0.1)', color: PRIMARY }}
                    >
                      {c.display_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{c.display_name}</p>
                      <p className="truncate text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                        {c.phone_e164}
                        {c.groups?.length ? ` · ${c.groups.map((g) => g.name).join(', ')}` : ''}
                      </p>
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
