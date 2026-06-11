import React, { useState } from 'react';
import { AtSign, Loader2, Share2, Tag, User, UserRound, X } from 'lucide-react';
import { toast } from 'sonner';
import type { DeviceContactRoamPreview } from '@/utils/deviceContactRoamPreview';
import { buildRoamRidesInviteShare } from '@/lib/roamAppDownload';
import { openSystemShareSheet } from '@/utils/systemShare';
import {
  CARD_SHADOW,
  ON_PRIMARY,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
  PRIMARY_CONTAINER,
  SURFACE_LOW,
  SURFACE_LOWEST,
} from '@/lib/passengerTheme';

function ConfirmField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl px-4 py-3" style={{ backgroundColor: SURFACE_LOW }}>
      <div className="mb-1 flex items-center gap-2">
        <span style={{ color: ON_SURFACE_VARIANT }}>{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: ON_SURFACE_VARIANT }}>
          {label}
        </span>
      </div>
      <p className="pl-6 text-sm font-semibold" style={{ color: ON_SURFACE }}>
        {value}
      </p>
    </div>
  );
}

function MemberAvatar({ preview }: { preview: DeviceContactRoamPreview }) {
  const initial = preview.firstName.charAt(0).toUpperCase() || '?';

  return (
    <div
      className="mx-auto h-20 w-20 overflow-hidden rounded-full border-4"
      style={{
        borderColor: SURFACE_LOWEST,
        boxShadow: CARD_SHADOW,
        backgroundColor: SURFACE_LOW,
      }}
    >
      {preview.avatarUrl ? (
        <img src={preview.avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-2xl font-bold"
          style={{ color: PRIMARY, backgroundColor: '#dbe1ff' }}
        >
          {initial}
        </div>
      )}
    </div>
  );
}

function NotOnRoamPreviewCard({
  preview,
  onShareInvite,
  sharing,
}: {
  preview: DeviceContactRoamPreview;
  onShareInvite: (name: string) => void;
  sharing: boolean;
}) {
  const phoneLabel = preview.device.phoneLabel || preview.device.phoneE164;

  return (
    <div
      className="space-y-4 rounded-2xl border p-4"
      style={{
        backgroundColor: SURFACE_LOWEST,
        borderColor: 'color-mix(in srgb, var(--passenger-outline-variant) 35%, transparent)',
        boxShadow: CARD_SHADOW,
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE_VARIANT }}
        >
          <UserRound className="h-5 w-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold" style={{ color: ON_SURFACE }}>
            {preview.device.name}
          </p>
          <p className="mt-0.5 text-sm" style={{ color: ON_SURFACE_VARIANT }}>
            {phoneLabel}
          </p>
        </div>
      </div>

      <div
        className="space-y-2 rounded-xl px-3.5 py-3"
        style={{ backgroundColor: 'color-mix(in srgb, var(--passenger-primary) 6%, #fff)' }}
      >
        <p className="text-sm font-medium" style={{ color: ON_SURFACE }}>
          No Roam account on this number yet
        </p>
        <p className="flex items-start gap-2 text-sm leading-snug" style={{ color: ON_SURFACE_VARIANT }}>
          <AtSign className="mt-0.5 h-4 w-4 shrink-0" style={{ color: PRIMARY }} aria-hidden />
          <span>
            You can still book for them using their <strong style={{ color: PRIMARY }}>@tag</strong> on the
            passenger step.
          </span>
        </p>
      </div>

      <button
        type="button"
        disabled={sharing}
        onClick={() => onShareInvite(preview.device.name)}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold disabled:opacity-50"
        style={{ backgroundColor: PRIMARY_CONTAINER, color: ON_PRIMARY }}
      >
        {sharing ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Share2 className="h-4 w-4" aria-hidden />
        )}
        Share app download link
      </button>
    </div>
  );
}

function MatchedPreviewCard({ preview }: { preview: DeviceContactRoamPreview }) {
  return (
    <div
      className="space-y-3 rounded-2xl px-4 py-5"
      style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
    >
      <MemberAvatar preview={preview} />
      <ConfirmField
        icon={<User className="h-3.5 w-3.5" />}
        label="First name"
        value={preview.firstName}
      />
      <ConfirmField
        icon={<Tag className="h-3.5 w-3.5" />}
        label="Roam tag"
        value={preview.tagLabel ?? 'No tag set'}
      />
    </div>
  );
}

type Props = {
  open: boolean;
  loading: boolean;
  previews: DeviceContactRoamPreview[];
  submitting: boolean;
  onBack: () => void;
  onConfirm: () => void;
};

export function DeviceContactImportConfirmSheet({
  open,
  loading,
  previews,
  submitting,
  onBack,
  onConfirm,
}: Props) {
  const [sharingName, setSharingName] = useState<string | null>(null);

  if (!open) return null;

  const matched = previews.filter((p) => p.found);
  const unmatched = previews.filter((p) => !p.found);
  const canConfirm = !loading && matched.length > 0;
  const hasOnlyUnmatched = !loading && matched.length === 0 && unmatched.length > 0;
  const hasMixed = !loading && matched.length > 0 && unmatched.length > 0;

  const handleShareInvite = async (name: string) => {
    setSharingName(name);
    try {
      const content = buildRoamRidesInviteShare(name);
      const shared = await openSystemShareSheet(content);
      if (!shared) {
        const body = content.url ? `${content.message}\n${content.url}` : content.message;
        await navigator.clipboard.writeText(body);
        toast.success('Invite link copied');
      }
    } catch {
      toast.error('Could not share invite link');
    } finally {
      setSharingName(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[2100] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Back"
        onClick={onBack}
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
              {hasOnlyUnmatched ? 'Not on Roam yet' : 'Confirm Roam member'}
            </h2>
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              {hasOnlyUnmatched
                ? 'Invite them to download the app or use their @tag to book'
                : 'Make sure this is the right person before adding'}
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: SURFACE_LOWEST, color: ON_SURFACE }}
            aria-label="Back"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: PRIMARY }} />
              <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
                Looking up Roam account…
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {previews.map((preview) =>
                preview.found ? (
                  <MatchedPreviewCard key={preview.device.deviceId} preview={preview} />
                ) : (
                  <NotOnRoamPreviewCard
                    key={preview.device.deviceId}
                    preview={preview}
                    onShareInvite={(name) => void handleShareInvite(name)}
                    sharing={sharingName === preview.device.name}
                  />
                ),
              )}
            </div>
          )}
        </div>

        <div className="border-t px-5 py-4 safe-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          {hasMixed ? (
            <p className="mb-3 text-center text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              {unmatched.length === 1
                ? '1 contact is not on Roam yet and will be skipped.'
                : `${unmatched.length} contacts are not on Roam yet and will be skipped.`}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={submitting}
              className={`h-12 rounded-2xl text-base font-semibold disabled:opacity-50 ${
                canConfirm ? 'flex-1' : 'w-full'
              }`}
              style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
            >
              Back
            </button>
            {canConfirm ? (
              <button
                type="button"
                disabled={submitting}
                onClick={onConfirm}
                className="h-12 flex-[1.4] rounded-2xl text-base font-semibold disabled:opacity-50"
                style={{ backgroundColor: PRIMARY, color: '#fff' }}
              >
                {submitting
                  ? 'Adding…'
                  : matched.length === 1
                    ? 'Add contact'
                    : `Add ${matched.length} contacts`}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
