import React, { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { RiderContactRow } from '@roam/types/riderContacts';
import { contactInitials } from '@/lib/contactGroups';
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
  existingMemberIds: Set<string>;
  contacts: RiderContactRow[];
  onAdd: (contactIds: string[]) => Promise<void>;
};

export function AddGroupMembersSheet({
  open,
  onClose,
  existingMemberIds,
  contacts,
  onAdd,
}: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSelected(new Set());
      setSaving(false);
    }
  }, [open]);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts
      .filter((c) => !existingMemberIds.has(c.id))
      .filter((c) => !q || c.display_name.toLowerCase().includes(q) || c.phone_e164.includes(q))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [contacts, existingMemberIds, query]);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    if (!selected.size) return;
    setSaving(true);
    try {
      await onAdd([...selected]);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div
        className="relative z-10 flex max-h-[85dvh] w-full max-w-2xl flex-col rounded-t-3xl safe-x"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-bold" style={{ color: ON_SURFACE }}>Add members</h2>
          <button type="button" onClick={onClose} className="rounded-full p-2" style={{ color: ON_SURFACE_VARIANT }} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: ON_SURFACE_VARIANT }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search contacts"
              className="h-11 w-full rounded-xl pl-10 pr-4 outline-none focus:ring-2 focus:ring-[#004ac6]/30"
              style={{ backgroundColor: SURFACE_LOW }}
            />
          </div>
        </div>

        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 pb-4">
          {available.length === 0 ? (
            <li className="py-8 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              No contacts to add.
            </li>
          ) : (
            available.map((c) => {
              const checked = selected.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => toggle(c.id)}
                    className="flex w-full items-center gap-3 rounded-2xl p-3 text-left"
                    style={{ backgroundColor: checked ? 'rgba(0,74,198,0.08)' : SURFACE_LOW, boxShadow: CARD_SHADOW }}
                  >
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                      style={{ backgroundColor: 'rgba(0,74,198,0.1)', color: PRIMARY }}
                    >
                      {contactInitials(c.display_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.display_name}</p>
                      <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>{c.phone_e164}</p>
                    </div>
                    <div
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
                      style={{
                        borderColor: checked ? PRIMARY : ON_SURFACE_VARIANT,
                        backgroundColor: checked ? PRIMARY : 'transparent',
                      }}
                    >
                      {checked ? <span className="text-[10px] text-white">✓</span> : null}
                    </div>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        <div className="border-t px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]" style={{ borderColor: SURFACE_LOW }}>
          <button
            type="button"
            disabled={!selected.size || saving}
            onClick={() => void handleAdd()}
            className="flex h-14 w-full items-center justify-center rounded-2xl text-base font-semibold disabled:opacity-50"
            style={{ backgroundColor: PRIMARY, color: '#fff' }}
          >
            {saving ? 'Adding…' : `Add ${selected.size || ''} member${selected.size === 1 ? '' : 's'}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
