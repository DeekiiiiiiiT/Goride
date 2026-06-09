import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import {
  importDeviceContactSelection,
  loadDeviceContactOptions,
  type DeviceContactOption,
} from '@/utils/deviceContactsImport';
import {
  previewDeviceContactsOnRoam,
  type DeviceContactRoamPreview,
} from '@/utils/deviceContactRoamPreview';
import { DeviceContactImportConfirmSheet } from '@/components/contacts/DeviceContactImportConfirmSheet';
import {
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';
import type { RiderContactRow } from '@roam/types/riderContacts';

type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
  error?: string;
  contacts: RiderContactRow[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: (result: ImportResult) => void;
};

export function DeviceContactsPickerSheet({ open, onClose, onImported }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<DeviceContactOption[]>([]);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmPreviews, setConfirmPreviews] = useState<DeviceContactRoamPreview[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setContacts([]);
    setSelectedIds(new Set());
    setQuery('');
    try {
      const list = await loadDeviceContactOptions();
      setContacts(list);
      if (!list.length) {
        setError('No contacts with phone numbers were found on this device.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load phone contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phoneLabel.toLowerCase().includes(q) ||
        c.phoneE164.includes(q),
    );
  }, [contacts, query]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAdd = async () => {
    const selected = contacts.filter((c) => selectedIds.has(c.deviceId));
    if (!selected.length) return;
    setConfirmOpen(true);
    setConfirmLoading(true);
    setConfirmPreviews([]);
    try {
      const previews = await previewDeviceContactsOnRoam(selected);
      setConfirmPreviews(previews);
    } catch (e) {
      setConfirmOpen(false);
      setError(e instanceof Error ? e.message : 'Could not verify Roam account');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    const toImport = confirmPreviews.filter((p) => p.found).map((p) => p.device);
    if (!toImport.length) return;
    setSubmitting(true);
    try {
      const result = await importDeviceContactSelection(toImport);
      setConfirmOpen(false);
      onImported(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add contacts');
    } finally {
      setSubmitting(false);
    }
  };

  const closeConfirm = () => {
    if (submitting) return;
    setConfirmOpen(false);
    setConfirmPreviews([]);
  };

  if (!open) return null;

  const selectedCount = selectedIds.size;

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close"
        onClick={onClose}
      />

      <div
        className="relative flex max-h-[85dvh] flex-col rounded-t-3xl shadow-2xl safe-b"
        style={{ backgroundColor: PAGE_BG }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: 'rgba(0,0,0,0.06)' }}
        >
          <div>
            <h2 className="text-lg font-semibold" style={{ color: ON_SURFACE }}>
              Choose contacts
            </h2>
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              Select who to add to Roam Contacts
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: SURFACE_LOWEST, color: ON_SURFACE }}
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-3">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
              style={{ color: ON_SURFACE_VARIANT }}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your contacts"
              disabled={loading || (Boolean(error) && !contacts.length)}
              className="h-11 w-full rounded-xl pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-[#004ac6]/30"
              style={{ backgroundColor: SURFACE_LOWEST, color: ON_SURFACE }}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: PRIMARY }} />
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                Loading your contacts…
              </p>
            </div>
          ) : error && !contacts.length ? (
            <p className="rounded-2xl px-4 py-6 text-center text-sm" style={{ color: '#b91c1c' }}>
              {error}
            </p>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              {query.trim() ? 'No matches.' : 'No contacts found.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {filtered.map((c) => {
                const checked = selectedIds.has(c.deviceId);
                return (
                  <li key={c.deviceId}>
                    <button
                      type="button"
                      onClick={() => toggle(c.deviceId)}
                      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors active:scale-[0.99]"
                      style={{
                        backgroundColor: checked ? 'rgba(0, 74, 198, 0.08)' : SURFACE_LOWEST,
                        border: checked ? '1px solid rgba(0, 74, 198, 0.25)' : '1px solid transparent',
                      }}
                    >
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2"
                        style={{
                          borderColor: checked ? PRIMARY : 'rgba(0,0,0,0.2)',
                          backgroundColor: checked ? PRIMARY : 'transparent',
                        }}
                        aria-hidden
                      >
                        {checked ? (
                          <span className="text-[10px] font-bold text-white">✓</span>
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold" style={{ color: ON_SURFACE }}>
                          {c.name}
                        </span>
                        <span className="block truncate text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                          {c.phoneLabel || c.phoneE164}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t px-5 py-4 safe-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          {error && contacts.length > 0 ? (
            <p className="mb-3 text-center text-sm" style={{ color: '#b91c1c' }}>
              {error}
            </p>
          ) : null}
          <button
            type="button"
            disabled={submitting || confirmLoading || selectedCount === 0}
            onClick={() => void handleAdd()}
            className="flex h-12 w-full items-center justify-center rounded-2xl text-base font-semibold disabled:opacity-50"
            style={{ backgroundColor: PRIMARY, color: '#fff' }}
          >
            {submitting || confirmLoading
              ? 'Checking…'
              : selectedCount === 0
                ? 'Select contacts to add'
                : `Add ${selectedCount} contact${selectedCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>

      <DeviceContactImportConfirmSheet
        open={confirmOpen}
        loading={confirmLoading}
        previews={confirmPreviews}
        submitting={submitting}
        onBack={closeConfirm}
        onConfirm={() => void handleConfirmImport()}
      />
    </div>
  );
}
