import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Search, UserPlus } from 'lucide-react';
import type { RiderContactRow } from '@roam/types/riderContacts';
import { contactsList } from '@/services/contactsEdge';
import { relationLabel } from '@/components/contacts/ContactRelationPicker';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';
import { DeviceContactsPickerSheet } from '@/components/contacts/DeviceContactsPickerSheet';
import {
  canUseBrowserContactPicker,
  canUseInAppDeviceContactPicker,
  importDeviceContactSelection,
  pickDeviceContactsFromBrowser,
} from '@/utils/deviceContactsImport';

export default function ContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<RiderContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await contactsList({ q: query || undefined });
      setContacts(res.contacts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load contacts');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const t = setTimeout(() => void load(), query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  const sorted = useMemo(
    () => [...contacts].sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [contacts],
  );

  const handleDeviceImportResult = async (result: {
    imported: number;
    updated: number;
    skipped: number;
    failed: number;
    error?: string;
    contacts: RiderContactRow[];
  }) => {
    if (result.failed > 0) {
      toast.error(result.error ?? 'Could not save contacts.');
      return;
    }
    const saved = result.imported + result.updated;
    if (saved > 0) {
      toast.success(`Added ${saved} contact${saved === 1 ? '' : 's'} to Roam Contacts`);
      await load();
      return;
    }
    toast.message('No contacts were added.');
  };

  const handleImport = async () => {
    if (canUseInAppDeviceContactPicker()) {
      setDevicePickerOpen(true);
      return;
    }

    if (!canUseBrowserContactPicker()) {
      toast.error('Contact import is not available here. Add contacts manually.');
      return;
    }

    setImporting(true);
    try {
      const picked = await pickDeviceContactsFromBrowser();
      if (!picked.length) {
        toast.message('No contact selected.');
        return;
      }
      const result = await importDeviceContactSelection(picked);
      await handleDeviceImportResult(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col pb-28" style={{ backgroundColor: PAGE_BG, color: ON_SURFACE }}>
      <header className="sticky top-0 z-50 flex h-16 items-center bg-[#f7f9fb] px-4 safe-t">
        <button
          type="button"
          onClick={() => navigate('/account')}
          className="rounded-full p-2"
          style={{ color: PRIMARY }}
          aria-label="Back"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
        <h1 className="ml-2 text-xl font-semibold" style={{ color: PRIMARY }}>
          Roam Contacts
        </h1>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-4 safe-x">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: ON_SURFACE_VARIANT }} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search contacts"
            className="h-12 w-full rounded-2xl border-none pl-11 pr-4 outline-none focus:ring-2 focus:ring-[#004ac6]"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/account/contacts/new')}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold"
            style={{ backgroundColor: PRIMARY, color: '#fff' }}
          >
            <Plus className="h-4 w-4" />
            Add contact
          </button>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={importing}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-sm font-semibold disabled:opacity-50"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW, color: PRIMARY }}
          >
            <UserPlus className="h-4 w-4" />
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>

        {loading ? (
          <p className="text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            Loading…
          </p>
        ) : sorted.length === 0 ? (
          <p className="text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            No contacts yet. Add someone you book rides for.
          </p>
        ) : (
          <ul className="space-y-2">
            {sorted.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/account/contacts/${c.id}`)}
                  className="flex w-full items-center gap-4 rounded-2xl p-4 text-left"
                  style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{ backgroundColor: 'rgba(0,74,198,0.1)', color: PRIMARY }}
                  >
                    {c.display_name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{c.display_name}</p>
                    <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                      {relationLabel(c.relation, c.relation_custom)} · {c.phone_e164}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      <DeviceContactsPickerSheet
        open={devicePickerOpen}
        onClose={() => setDevicePickerOpen(false)}
        onImported={(result) => void handleDeviceImportResult(result)}
      />
    </div>
  );
}
