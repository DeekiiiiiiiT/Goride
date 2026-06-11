import React, { useEffect, useState } from 'react';
import { AlertCircle, AtSign, Loader2, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { RiderContactRow } from '@roam/types/riderContacts';
import { contactsCreate, lookupPassengerByPhone } from '@/services/contactsEdge';
import { createRoamConnectionRequest } from '@/services/roamConnectionsEdge';
import { ROAM_CONNECTIONS } from '@/lib/roamConnectionFlags';
import {
  CONNECTION_INVITE_SENT_COPY,
  CONNECTION_REQUEST_SENT_COPY,
} from '@/lib/roamConnectionCopy';
import { ContactFormFields } from '@/components/contacts/ContactFormFields';
import { buildRoamRidesInviteShare } from '@/lib/roamAppDownload';
import {
  buildGuestPhoneE164,
  isValidGuestPhone,
} from '@/lib/guestRecipientBooking';
import { openSystemShareSheet } from '@/utils/systemShare';
import {
  CARD_SHADOW,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

export type AddContactCompleteResult = {
  name: string;
  phoneDigits: string;
  contact?: RiderContactRow;
  saved: boolean;
  onRoam: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onComplete: (result: AddContactCompleteResult) => void | Promise<void>;
};

type Phase = 'form' | 'invite';

export function AddContactSheet({ open, onClose, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>('form');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [saveToRoam, setSaveToRoam] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteName, setInviteName] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, submitting]);

  useEffect(() => {
    if (!open) {
      setPhase('form');
      setDisplayName('');
      setPhone('');
      setSaveToRoam(true);
      setSubmitting(false);
      setSharing(false);
      setError(null);
      setInviteName('');
    }
  }, [open]);

  if (!open) return null;

  const canContinue = displayName.trim().length > 0 && isValidGuestPhone(phone);

  const handleShareInvite = async () => {
    setSharing(true);
    try {
      const content = buildRoamRidesInviteShare(inviteName || displayName);
      const shared = await openSystemShareSheet(content);
      if (!shared) {
        const body = content.url ? `${content.message}\n${content.url}` : content.message;
        await navigator.clipboard.writeText(body);
        toast.success('Invite link copied');
      }
    } catch {
      toast.error('Could not share invite link');
    } finally {
      setSharing(false);
    }
  };

  const handleContinue = async () => {
    if (!canContinue) {
      setError('Enter a name and valid 10-digit phone number.');
      return;
    }

    const name = displayName.trim();
    const phoneDigits = phone.replace(/\D/g, '').slice(-10);
    const phoneE164 = buildGuestPhoneE164('+1', phoneDigits);

    setSubmitting(true);
    setError(null);

    try {
      let contact: RiderContactRow | undefined;

      const lookup = await lookupPassengerByPhone(phoneE164);
      const onRoam = Boolean(lookup.found && lookup.profile);

      if (saveToRoam) {
        try {
          if (ROAM_CONNECTIONS) {
            await createRoamConnectionRequest({
              target_display_name: name,
              phone_e164: phoneE164,
              target_user_id: lookup.profile?.user_id,
              source: 'book_for_someone',
            });
            toast.message(onRoam ? CONNECTION_REQUEST_SENT_COPY : CONNECTION_INVITE_SENT_COPY);
          } else {
            const created = await contactsCreate({
              display_name: name,
              phone_e164: phoneE164,
            });
            contact = created.contact;
          }
        } catch (e) {
          const code = e instanceof Error ? e.message : 'insert_failed';
          if (code === 'duplicate_phone') {
            setError('This phone number is already in your Roam Contacts. Pick them from Roam Contacts instead.');
          } else if (code === 'duplicate_roam_user' || code === 'duplicate_pending' || code === 'already_connected') {
            setError('This Roam user is already in your contacts or has a pending request.');
          } else {
            setError('Could not save contact. Try again.');
          }
          return;
        }
      }

      await onComplete({
        name,
        phoneDigits,
        contact,
        saved: saveToRoam && (ROAM_CONNECTIONS || Boolean(contact)),
        onRoam,
      });

      if (onRoam) {
        onClose();
        return;
      }

      setInviteName(name);
      setPhase('invite');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not continue');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2100] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close"
        onClick={onClose}
        disabled={submitting}
      />

      <div
        className="relative flex max-h-[90dvh] flex-col rounded-t-3xl shadow-2xl safe-b"
        style={{ backgroundColor: PAGE_BG }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: 'rgba(0,0,0,0.06)' }}
        >
          <div>
            <h2 className="text-lg font-semibold" style={{ color: ON_SURFACE }}>
              {phase === 'form' ? 'New contact' : 'Invite to Roam'}
            </h2>
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              {phase === 'form'
                ? 'Add who you are booking for and keep moving'
                : `${inviteName} needs a Roam account to ride`}
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {phase === 'form' ? (
            <div className="space-y-4">
              <div
                className="space-y-4 rounded-[24px] p-5"
                style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
              >
                <ContactFormFields
                  displayName={displayName}
                  onDisplayNameChange={(value) => {
                    setDisplayName(value);
                    setError(null);
                  }}
                  phone={phone}
                  onPhoneChange={(value) => {
                    setPhone(value);
                    setError(null);
                  }}
                  nameAutoFocus
                />

                <label className="flex items-center gap-3 rounded-xl px-1 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={saveToRoam}
                    onChange={(e) => setSaveToRoam(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  <span style={{ color: ON_SURFACE }}>Save to Roam Contacts</span>
                </label>
                {!saveToRoam ? (
                  <p className="text-xs leading-snug" style={{ color: ON_SURFACE_VARIANT }}>
                    One-time booking only — this person won&apos;t be added to your contacts.
                  </p>
                ) : null}
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
            </div>
          ) : (
            <div className="space-y-4">
              <div
                className="space-y-3 rounded-2xl px-4 py-4"
                style={{ backgroundColor: 'color-mix(in srgb, var(--passenger-primary) 6%, #fff)' }}
              >
                <p className="text-sm font-medium" style={{ color: ON_SURFACE }}>
                  No Roam account on this number yet
                </p>
                <p className="flex items-start gap-2 text-sm leading-snug" style={{ color: ON_SURFACE_VARIANT }}>
                  <AtSign className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PRIMARY }} aria-hidden />
                  <span>
                    After they install Roam, you can also find them by <strong style={{ color: PRIMARY }}>@tag</strong>{' '}
                    next time.
                  </span>
                </p>
              </div>

              <button
                type="button"
                disabled={sharing}
                onClick={() => void handleShareInvite()}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
              >
                {sharing ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Share2 className="h-4 w-4" aria-hidden />
                )}
                Share app download link
              </button>

              <p className="text-center text-xs leading-snug" style={{ color: ON_SURFACE_VARIANT }}>
                When you close this, use the authorization link on the booking screen so they can approve this ride.
              </p>
            </div>
          )}
        </div>

        <div className="border-t px-5 py-4 safe-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          {phase === 'form' ? (
            <button
              type="button"
              disabled={!canContinue || submitting}
              onClick={() => void handleContinue()}
              className="flex h-14 w-full items-center justify-center rounded-2xl text-lg font-semibold disabled:opacity-50"
              style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
            >
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
                  Checking…
                </>
              ) : (
                'Continue'
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="flex h-14 w-full items-center justify-center rounded-2xl text-lg font-semibold"
              style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
