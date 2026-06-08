import React, { useEffect, useState } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import type { RiderContactRow } from '@roam/types/riderContacts';
import { contactInitials } from '@/lib/contactGroups';
import { testShareTrustedContacts } from '@/services/trustedContactsEdge';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PRIMARY,
  PRIMARY_CONTAINER,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

type Props = {
  open: boolean;
  onClose: () => void;
  contacts: RiderContactRow[];
  onSuccess: () => void;
};

export function TestShareSheet({ open, onClose, contacts, onSuccess }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelected(new Set(contacts.map((c) => c.id)));
      setSending(false);
    }
  }, [open, contacts]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    if (!selected.size) return;
    setSending(true);
    try {
      await testShareTrustedContacts({ contact_ids: [...selected] });
      onSuccess();
      onClose();
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      <button type="button" className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close" />
      <div
        className="relative max-h-[70dvh] overflow-y-auto rounded-t-[24px] p-5 pb-8 safe-x"
        style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold" style={{ color: ON_SURFACE }}>
            Test Share
          </h2>
          <button type="button" onClick={onClose} className="rounded-full p-2" aria-label="Close">
            <X className="h-5 w-5" style={{ color: ON_SURFACE_VARIANT }} />
          </button>
        </div>
        <p className="mb-4 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
          Send a sample safety alert so your contacts know what to expect.
        </p>
        <div className="space-y-2">
          {contacts.map((c) => (
            <label
              key={c.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl p-3"
              style={{ backgroundColor: SURFACE_LOW }}
            >
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                className="h-5 w-5 rounded accent-[#004ac6]"
              />
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                style={{ backgroundColor: PRIMARY_CONTAINER, color: PRIMARY }}
              >
                {contactInitials(c.display_name)}
              </div>
              <span className="font-medium" style={{ color: ON_SURFACE }}>
                {c.display_name}
              </span>
            </label>
          ))}
        </div>
        <button
          type="button"
          disabled={!selected.size || sending}
          onClick={() => void handleSend()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: PRIMARY }}
        >
          <ShieldCheck className="h-5 w-5" aria-hidden />
          {sending ? 'Sending…' : `Send test (${selected.size})`}
        </button>
      </div>
    </div>
  );
}
