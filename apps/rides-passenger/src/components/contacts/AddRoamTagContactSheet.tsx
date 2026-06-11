import React, { useEffect, useState } from 'react';
import { AlertCircle, Tag, X } from 'lucide-react';
import type { RoamPassengerTagBookingLookupDto } from '@roam/types/roamPassengerTag';
import { contactsCreate } from '@/services/contactsEdge';
import { createRoamConnectionRequest } from '@/services/roamConnectionsEdge';
import { ROAM_CONNECTIONS } from '@/lib/roamConnectionFlags';
import { CONNECTION_REQUEST_SENT_COPY } from '@/lib/roamConnectionCopy';
import { toast } from 'sonner';
import {
  formatRoamTagDisplay,
  lookupRoamPassengerTagForBooking,
  normalizeRoamTagInput,
  roamTagErrorMessage,
} from '@/services/roamTagEdge';
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
  onAdded: () => void;
};

export function AddRoamTagContactSheet({ open, onClose, onAdded }: Props) {
  const [tagInput, setTagInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<RoamPassengerTagBookingLookupDto | null>(null);

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
      setTagInput('');
      setMatch(null);
      setError(null);
      setLoading(false);
      setSaving(false);
    }
  }, [open]);

  if (!open) return null;

  const lookupTag = async () => {
    const normalized = normalizeRoamTagInput(tagInput);
    if (normalized.length < 3) {
      setError('Enter at least 3 characters.');
      return;
    }
    setLoading(true);
    setError(null);
    setMatch(null);
    try {
      const { tag } = await lookupRoamPassengerTagForBooking(normalized);
      setMatch(tag);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'lookup_failed';
      setError(roamTagErrorMessage(code) || 'Could not find that Roam Tag.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!match?.phone_e164 || !match.user_id) return;
    setSaving(true);
    setError(null);
    try {
      if (ROAM_CONNECTIONS) {
        await createRoamConnectionRequest({
          target_display_name: match.display_name?.trim() || match.custom_tag_name,
          phone_e164: match.phone_e164,
          target_user_id: match.user_id,
          source: 'roam_tag',
        });
        toast.message(CONNECTION_REQUEST_SENT_COPY);
      } else {
        await contactsCreate({
          display_name: match.display_name?.trim() || match.custom_tag_name,
          phone_e164: match.phone_e164,
          source: 'roam_user',
          linked_user_id: match.user_id,
        });
      }
      onAdded();
      onClose();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'insert_failed';
      if (code === 'duplicate_phone') {
        setError('This person is already in your Roam Contacts.');
      } else if (code === 'duplicate_roam_user' || code === 'duplicate_pending' || code === 'already_connected') {
        setError('This Roam user is already in your contacts or has a pending request.');
      } else {
        setError('Could not add contact. Try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-2xl rounded-t-3xl safe-x"
        style={{ backgroundColor: SURFACE_LOWEST }}
      >
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-bold" style={{ color: ON_SURFACE }}>Add by Roam Tag</h2>
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

        <div className="space-y-4 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            Find someone on Roam by their tag and save them to your contacts.
          </p>

          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <span
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-semibold"
                style={{ color: ON_SURFACE_VARIANT }}
              >
                @
              </span>
              <input
                value={tagInput}
                onChange={(e) => {
                  setTagInput(normalizeRoamTagInput(e.target.value));
                  setMatch(null);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void lookupTag();
                }}
                placeholder="theirname"
                maxLength={24}
                autoFocus
                className="h-12 w-full rounded-xl pl-9 pr-4 outline-none focus:ring-2 focus:ring-[#004ac6]/30"
                style={{ backgroundColor: SURFACE_LOW }}
              />
            </div>
            <button
              type="button"
              disabled={loading || tagInput.length < 3}
              onClick={() => void lookupTag()}
              className="shrink-0 rounded-xl px-4 text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: PRIMARY, color: '#fff' }}
            >
              {loading ? '…' : 'Find'}
            </button>
          </div>

          {error ? (
            <div
              className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm"
              style={{ backgroundColor: 'rgba(220,38,38,0.08)', color: '#b91c1c' }}
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </div>
          ) : null}

          {match ? (
            <div
              className="flex items-center gap-3 rounded-xl px-3 py-3"
              style={{ backgroundColor: 'rgba(0,74,198,0.08)' }}
            >
              {match.avatar_url ? (
                <img src={match.avatar_url} alt="" className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-full"
                  style={{ backgroundColor: 'rgba(0,74,198,0.15)', color: PRIMARY }}
                >
                  <Tag className="h-5 w-5" aria-hidden />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {match.display_name ?? match.custom_tag_name}
                </p>
                <p className="text-sm font-medium" style={{ color: PRIMARY }}>
                  {formatRoamTagDisplay(match.custom_tag_name)}
                </p>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            disabled={!match || saving}
            onClick={() => void handleAdd()}
            className="flex h-14 w-full items-center justify-center rounded-2xl text-base font-semibold disabled:opacity-50"
            style={{ backgroundColor: PRIMARY, color: '#fff' }}
          >
            {saving ? 'Adding…' : 'Add to Roam Contacts'}
          </button>
        </div>
      </div>
    </div>
  );
}
