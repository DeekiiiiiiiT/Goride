import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Smartphone, Tag, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import type { RiderContactGroupRow, RiderContactRow } from '@roam/types/riderContacts';
import { RoamTagLookupSheet } from '@/components/contacts/RoamTagLookupSheet';
import { RoamContactsPickerSheet } from '@/components/contacts/RoamContactsPickerSheet';
import { contactsList, contactGroupsList } from '@/services/contactsEdge';
import { loadDeviceContactOptions, type DeviceContactOption } from '@/utils/deviceContactsImport';
import type { RiderPickupTarget } from '@/lib/riderPickupTarget';
import {
  riderPickupTargetFromContact,
  riderPickupTargetFromDevice,
  riderPickupTargetFromTag,
} from '@/lib/riderPickupTarget';
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
  onSelect: (target: RiderPickupTarget) => void;
};

export function RiderPickupPickerSheet({ open, onClose, onSelect }: Props) {
  const [tagOpen, setTagOpen] = useState(false);
  const [roamOpen, setRoamOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [contacts, setContacts] = useState<RiderContactRow[]>([]);
  const [groups, setGroups] = useState<RiderContactGroupRow[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactQuery, setContactQuery] = useState('');
  const [groupFilterId, setGroupFilterId] = useState<string | null>(null);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContactOption[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceQuery, setDeviceQuery] = useState('');

  const closeAll = () => {
    setTagOpen(false);
    setRoamOpen(false);
    setPhoneOpen(false);
    onClose();
  };

  const handleTagSelect = (tag: Parameters<typeof riderPickupTargetFromTag>[0]) => {
    const target = riderPickupTargetFromTag(tag);
    if (!target) {
      toast.error('That Roam user needs a phone number on file.');
      return;
    }
    setTagOpen(false);
    onSelect(target);
    closeAll();
  };

  const handleContactSelect = (contact: RiderContactRow) => {
    setRoamOpen(false);
    onSelect(riderPickupTargetFromContact(contact));
    closeAll();
  };

  const loadRoamContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const [listRes, groupsRes] = await Promise.all([
        contactsList(),
        contactGroupsList().catch(() => ({ groups: [] as RiderContactGroupRow[] })),
      ]);
      setContacts(listRes.contacts);
      setGroups(groupsRes.groups);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load Roam contacts');
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const loadPhoneContacts = useCallback(async () => {
    setDeviceLoading(true);
    try {
      const list = await loadDeviceContactOptions();
      setDeviceContacts(list);
      if (!list.length) toast.message('No phone contacts with numbers found.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load phone contacts');
    } finally {
      setDeviceLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!roamOpen) return;
    void loadRoamContacts();
  }, [roamOpen, loadRoamContacts]);

  useEffect(() => {
    if (!phoneOpen) return;
    void loadPhoneContacts();
  }, [phoneOpen, loadPhoneContacts]);

  useEffect(() => {
    if (!open) {
      setTagOpen(false);
      setRoamOpen(false);
      setPhoneOpen(false);
      setDeviceQuery('');
      setContactQuery('');
    }
  }, [open]);

  const filteredDevice = deviceContacts.filter((c) => {
    const q = deviceQuery.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.phoneLabel.includes(q);
  });

  const showMainMenu = open && !tagOpen && !roamOpen && !phoneOpen;

  const mainSheet = showMainMenu && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center safe-x"
          role="dialog"
          aria-modal
          aria-labelledby="rider-pickup-picker-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={closeAll}
          />
          <div
            className="relative z-10 w-full max-w-lg rounded-t-3xl px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-5 shadow-2xl"
            style={{ backgroundColor: SURFACE_LOWEST }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id="rider-pickup-picker-title" className="text-lg font-bold" style={{ color: ON_SURFACE }}>
                Who are you picking up?
              </h2>
              <button type="button" onClick={closeAll} className="rounded-full p-2" aria-label="Close">
                <X className="h-5 w-5" style={{ color: ON_SURFACE_VARIANT }} />
              </button>
            </div>
            <p className="mb-4 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              We&apos;ll ask them to share their current location for pickup.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setTagOpen(true)}
                className="btn-touch flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left touch-manipulation"
                style={{ backgroundColor: SURFACE_LOW, color: PRIMARY }}
              >
                <Tag className="h-5 w-5 shrink-0" aria-hidden />
                <span className="font-semibold">Search Roam tag</span>
              </button>
              <button
                type="button"
                onClick={() => setRoamOpen(true)}
                className="btn-touch flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left touch-manipulation"
                style={{ backgroundColor: SURFACE_LOW, color: PRIMARY }}
              >
                <Users className="h-5 w-5 shrink-0" aria-hidden />
                <span className="font-semibold">Roam contacts</span>
              </button>
              <button
                type="button"
                onClick={() => setPhoneOpen(true)}
                className="btn-touch flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left touch-manipulation"
                style={{ backgroundColor: SURFACE_LOW, color: PRIMARY }}
              >
                <Smartphone className="h-5 w-5 shrink-0" aria-hidden />
                <span className="font-semibold">Phone contacts</span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  const phoneSheet = phoneOpen && typeof document !== 'undefined'
    ? createPortal(
        <div className="fixed inset-0 z-[210] flex items-end justify-center safe-x" role="dialog" aria-modal>
          <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setPhoneOpen(false)} />
          <div
            className="relative z-10 flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-3xl shadow-2xl safe-b"
            style={{ backgroundColor: SURFACE_LOWEST }}
          >
            <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
              <h2 className="text-lg font-bold" style={{ color: ON_SURFACE }}>Phone contacts</h2>
              <button type="button" onClick={() => setPhoneOpen(false)} className="rounded-full p-2" aria-label="Close">
                <X className="h-5 w-5" style={{ color: ON_SURFACE_VARIANT }} />
              </button>
            </div>
            <div className="px-5 py-3">
              <input
                value={deviceQuery}
                onChange={(e) => setDeviceQuery(e.target.value)}
                placeholder="Search contacts"
                className="h-11 w-full rounded-xl px-4 outline-none"
                style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
              {deviceLoading ? (
                <div className="flex items-center justify-center gap-2 py-8" style={{ color: ON_SURFACE_VARIANT }}>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Loading contacts…
                </div>
              ) : (
                <ul className="space-y-1">
                  {filteredDevice.map((c) => (
                    <li key={c.deviceId}>
                      <button
                        type="button"
                        onClick={() => {
                          setPhoneOpen(false);
                          onSelect(riderPickupTargetFromDevice(c));
                          closeAll();
                        }}
                        className="flex w-full flex-col rounded-xl px-4 py-3 text-left active:opacity-80"
                        style={{ backgroundColor: SURFACE_LOW }}
                      >
                        <span className="font-semibold" style={{ color: ON_SURFACE }}>{c.name}</span>
                        <span className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>{c.phoneLabel}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  const tagSheet =
    tagOpen && typeof document !== 'undefined'
      ? createPortal(
          <RoamTagLookupSheet
            open={tagOpen}
            onClose={() => setTagOpen(false)}
            title="Who are you picking up?"
            description="Search for the rider using their Roam tag."
            confirmLabel="Request location"
            onSelect={handleTagSelect}
          />,
          document.body,
        )
      : null;

  const roamSheet =
    roamOpen && typeof document !== 'undefined'
      ? createPortal(
          <RoamContactsPickerSheet
            open={roamOpen}
            onClose={() => setRoamOpen(false)}
            contacts={contacts}
            groups={groups}
            loading={contactsLoading}
            query={contactQuery}
            onQueryChange={setContactQuery}
            groupFilterId={groupFilterId}
            onGroupFilterChange={setGroupFilterId}
            selectedId={null}
            onSelect={handleContactSelect}
          />,
          document.body,
        )
      : null;

  if (!open && !tagOpen && !roamOpen && !phoneOpen) return null;

  return (
    <>
      {mainSheet}
      {phoneSheet}
      {tagSheet}
      {roamSheet}
    </>
  );
}
