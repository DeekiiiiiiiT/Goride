import React, { useEffect, useMemo, useState } from 'react';
import { Send, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import type { RiderContactGroupRow, RiderContactRow } from '@roam/types/riderContacts';
import { contactInitials, sortPinnedGroups } from '@/lib/contactGroups';
import { contactsList, contactGroupsList } from '@/services/contactsEdge';
import { shareTripWithContacts } from '@/services/trustedContactsEdge';
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
  rideId: string;
  onShared?: () => void;
};

function formatPhoneSubtitle(contact: RiderContactRow): string {
  const group = contact.groups?.[0]?.name;
  const phone = contact.phone_e164.replace(/^\+1/, '+1 ');
  return group ? `${group} • ${phone}` : phone;
}

export function ShareMyTripSheet({ open, onClose, rideId, onShared }: Props) {
  const [shareAll, setShareAll] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [phase, setPhase] = useState<'idle' | 'sending' | 'done'>('idle');

  const { data: trustedData } = useQuery({
    queryKey: ['trusted-contacts'],
    queryFn: () => contactsList({ trusted_for_safety: true }),
    enabled: open,
  });

  const { data: groupsData } = useQuery({
    queryKey: ['contact-groups'],
    queryFn: contactGroupsList,
    enabled: open,
  });

  const contacts = trustedData?.contacts ?? [];
  const pinnedGroups = useMemo(
    () => (groupsData?.groups ?? []).filter((g) => g.is_pinned).sort(sortPinnedGroups),
    [groupsData?.groups],
  );

  useEffect(() => {
    if (!open) {
      setShareAll(true);
      setMessage('');
      setPhase('idle');
      setSelectedGroups(new Set());
      return;
    }
    setSelected(new Set(contacts.map((c) => c.id)));
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

  useEffect(() => {
    if (shareAll) {
      setSelected(new Set(contacts.map((c) => c.id)));
    }
  }, [shareAll, contacts]);

  if (!open) return null;

  const toggleContact = (id: string) => {
    setShareAll(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGroup = (group: RiderContactGroupRow) => {
    setSelectedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group.id)) next.delete(group.id);
      else next.add(group.id);
      return next;
    });
  };

  const handleShare = async () => {
    setPhase('sending');
    try {
      await shareTripWithContacts(rideId, {
        share_with_all: shareAll,
        contact_ids: shareAll ? undefined : [...selected],
        group_ids: [...selectedGroups],
        message: message.trim() || undefined,
      });
      setPhase('done');
      onShared?.();
      setTimeout(onClose, 1200);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not share trip');
      setPhase('idle');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      <button type="button" className="absolute inset-0 bg-black/25" onClick={onClose} aria-label="Close" />
      <div className="relative mx-auto w-full max-w-2xl">
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/60" />
        <div
          className="max-h-[85dvh] overflow-y-auto rounded-t-[28px] p-6 pb-10 safe-x"
          style={{ backgroundColor: 'rgba(255,255,255,0.97)', boxShadow: CARD_SHADOW }}
        >
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: PRIMARY }}>
                Safety Toolkit
              </p>
              <h2 className="text-2xl font-semibold" style={{ color: ON_SURFACE }}>
                Share My Trip
              </h2>
            </div>
            <div className="rounded-2xl p-3" style={{ backgroundColor: 'rgba(0,74,198,0.08)' }}>
              <Share2 className="h-7 w-7" style={{ color: PRIMARY }} aria-hidden />
            </div>
          </div>

          <div
            className="mb-5 flex items-center justify-between rounded-2xl border border-[rgba(0,74,198,0.08)] p-4"
            style={{ backgroundColor: 'rgba(0,74,198,0.05)' }}
          >
            <span className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
              Share with all trusted contacts
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={shareAll}
              onClick={() => setShareAll((v) => !v)}
              className="relative h-7 w-12 rounded-full"
              style={{ backgroundColor: shareAll ? PRIMARY : SURFACE_LOW }}
            >
              <span
                className="absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform"
                style={{ left: shareAll ? 'calc(100% - 1.25rem - 4px)' : '4px' }}
              />
            </button>
          </div>

          {pinnedGroups.length > 0 ? (
            <div className="mb-4">
              <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
                Share with a group
              </p>
              <div className="flex flex-wrap gap-2">
                {pinnedGroups.map((g) => {
                  const active = selectedGroups.has(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => toggleGroup(g)}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
                      style={{
                        backgroundColor: active ? PRIMARY : SURFACE_LOW,
                        color: active ? '#fff' : ON_SURFACE,
                      }}
                    >
                      {g.emoji ? `${g.emoji} ` : ''}{g.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
            Select Contacts
          </p>

          {contacts.length === 0 ? (
            <p className="mb-4 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              Add trusted contacts in Account → Contacts to share your trip.
            </p>
          ) : (
            <div className="mb-4 space-y-2">
              {contacts.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center justify-between rounded-2xl border border-black/[0.06] p-4"
                  style={{ backgroundColor: SURFACE_LOWEST }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold"
                      style={{ backgroundColor: PRIMARY_CONTAINER, color: PRIMARY }}
                    >
                      {contactInitials(c.display_name)}
                    </div>
                    <div>
                      <p className="font-semibold">{c.display_name}</p>
                      <p className="text-xs" style={{ color: ON_SURFACE_VARIANT }}>
                        {formatPhoneSubtitle(c)}
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleContact(c.id)}
                    className="h-5 w-5 rounded accent-[#004ac6]"
                  />
                </label>
              ))}
            </div>
          )}

          <div className="mb-5">
            <p className="mb-2 px-1 text-xs font-bold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
              Optional Message
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              placeholder="e.g. Almost home! Just sharing my ride for safety."
              className="w-full resize-none rounded-2xl border border-black/[0.06] p-4 text-sm outline-none focus:ring-2 focus:ring-[#004ac6]/30"
              style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
            />
          </div>

          <button
            type="button"
            disabled={phase === 'sending' || (!shareAll && selected.size === 0 && selectedGroups.size === 0)}
            onClick={() => void handleShare()}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-bold text-white shadow-lg transition-all disabled:opacity-50 active:scale-[0.98]"
            style={{ backgroundColor: phase === 'done' ? PRIMARY : '#1A1A1A' }}
          >
            {phase === 'sending' ? (
              <>Broadcasting live link…</>
            ) : phase === 'done' ? (
              <>Trip shared successfully</>
            ) : (
              <>
                <Send className="h-5 w-5" fill="currentColor" aria-hidden />
                Share Trip Now
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 text-sm font-semibold"
            style={{ color: ON_SURFACE_VARIANT }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
