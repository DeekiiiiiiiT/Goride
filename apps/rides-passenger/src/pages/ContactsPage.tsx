import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Search, SlidersHorizontal, Smartphone, Tag } from 'lucide-react';
import type { RiderContactGroupRow, RiderContactRow } from '@roam/types/riderContacts';
import { contactGroupsList, contactsList } from '@/services/contactsEdge';
import { sortPinnedGroups } from '@/lib/contactGroups';
import { PinnedGroupsFilterRow } from '@/components/contacts/PinnedGroupsFilterRow';
import { GroupIconCircle } from '@/components/contacts/GroupIconCircle';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';
import { DeviceContactsPickerSheet } from '@/components/contacts/DeviceContactsPickerSheet';
import { DeviceContactImportConfirmSheet } from '@/components/contacts/DeviceContactImportConfirmSheet';
import { AddRoamTagContactSheet } from '@/components/contacts/AddRoamTagContactSheet';
import { ROAM_CONNECTIONS } from '@/lib/roamConnectionFlags';
import {
  canUseBrowserContactPicker,
  canUseInAppDeviceContactPicker,
  importDeviceContactSelection,
  pickDeviceContactsFromBrowser,
} from '@/utils/deviceContactsImport';
import {
  previewDeviceContactsOnRoam,
  type DeviceContactRoamPreview,
} from '@/utils/deviceContactRoamPreview';

export default function ContactsPage() {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<RiderContactRow[]>([]);
  const [groups, setGroups] = useState<RiderContactGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [importing, setImporting] = useState(false);
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [roamTagSheetOpen, setRoamTagSheetOpen] = useState(false);
  const [groupFilterId, setGroupFilterId] = useState<string | null>(null);
  const [browserConfirmOpen, setBrowserConfirmOpen] = useState(false);
  const [browserConfirmLoading, setBrowserConfirmLoading] = useState(false);
  const [browserConfirmPreviews, setBrowserConfirmPreviews] = useState<DeviceContactRoamPreview[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [listRes, groupsRes] = await Promise.all([
        contactsList({ q: query || undefined }),
        contactGroupsList().catch(() => ({ groups: [] as RiderContactGroupRow[] })),
      ]);
      setContacts(listRes.contacts);
      setGroups(groupsRes.groups);
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

  const pinnedGroups = useMemo(
    () => groups.filter((g) => g.is_pinned).sort(sortPinnedGroups),
    [groups],
  );

  const sorted = useMemo(() => {
    let list = contacts;
    if (ROAM_CONNECTIONS) {
      list = list.filter((c) => !c.linked_user_id || c.roam_account_linked);
    }
    if (groupFilterId) {
      list = list.filter((c) => c.groups?.some((g) => g.id === groupFilterId));
    }
    return [...list].sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [contacts, groupFilterId]);

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
      toast.success(
        ROAM_CONNECTIONS
          ? `Sent ${saved} connection request${saved === 1 ? '' : 's'}`
          : `Added ${saved} contact${saved === 1 ? '' : 's'} to Roam Contacts`,
      );
      await load();
      return;
    }
    if (result.skipped > 0 && ROAM_CONNECTIONS) {
      toast.message('Some contacts already have pending requests.');
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
      setBrowserConfirmOpen(true);
      setBrowserConfirmLoading(true);
      setBrowserConfirmPreviews([]);
      const previews = await previewDeviceContactsOnRoam(picked);
      setBrowserConfirmPreviews(previews);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
      setBrowserConfirmOpen(false);
    } finally {
      setBrowserConfirmLoading(false);
      setImporting(false);
    }
  };

  const handleBrowserConfirmImport = async () => {
    const toImport = browserConfirmPreviews.filter((p) => p.found).map((p) => p.device);
    if (!toImport.length) return;
    setImporting(true);
    try {
      const result = await importDeviceContactSelection(toImport);
      setBrowserConfirmOpen(false);
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
          onClick={() => navigate('/account/contacts')}
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

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => navigate('/account/contacts/new')}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-semibold"
            style={{ backgroundColor: PRIMARY, color: '#fff' }}
          >
            <Plus className="h-4 w-4" />
            Add contact
          </button>
          <button
            type="button"
            onClick={() => setRoamTagSheetOpen(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-semibold"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW, color: PRIMARY }}
          >
            <Tag className="h-4 w-4" />
            Roam Tag
          </button>
          <button
            type="button"
            onClick={() => void handleImport()}
            disabled={importing}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-semibold disabled:opacity-50"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW, color: PRIMARY }}
          >
            <Smartphone className="h-4 w-4" />
            {importing ? 'Importing…' : 'Phone contacts'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/account/contacts/groups')}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-semibold"
            style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW, color: PRIMARY }}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Organize
          </button>
        </div>

        <PinnedGroupsFilterRow
          pinnedGroups={pinnedGroups}
          selectedGroupId={groupFilterId}
          onSelectAll={() => setGroupFilterId(null)}
          onSelectGroup={(id) => setGroupFilterId((current) => (current === id ? null : id))}
        />

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
                      {c.phone_e164}
                    </p>
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
      </main>

      <DeviceContactsPickerSheet
        open={devicePickerOpen}
        onClose={() => setDevicePickerOpen(false)}
        onImported={(result) => void handleDeviceImportResult(result)}
      />

      <AddRoamTagContactSheet
        open={roamTagSheetOpen}
        onClose={() => setRoamTagSheetOpen(false)}
        onAdded={() => {
          toast.success(
            ROAM_CONNECTIONS ? 'Connection request sent' : 'Contact added to Roam Contacts',
          );
          void load();
        }}
      />

      <DeviceContactImportConfirmSheet
        open={browserConfirmOpen}
        loading={browserConfirmLoading}
        previews={browserConfirmPreviews}
        submitting={importing && !browserConfirmLoading}
        onBack={() => {
          if (importing) return;
          setBrowserConfirmOpen(false);
          setBrowserConfirmPreviews([]);
        }}
        onConfirm={() => void handleBrowserConfirmImport()}
      />
    </div>
  );
}
