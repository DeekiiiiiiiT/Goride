import React from 'react';
import { Loader2, Tag, User, X } from 'lucide-react';
import type { DeviceContactRoamPreview } from '@/utils/deviceContactRoamPreview';
import {
  CARD_SHADOW,
  ON_SURFACE,
  ON_SURFACE_VARIANT,
  PAGE_BG,
  PRIMARY,
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

function PreviewCard({ preview }: { preview: DeviceContactRoamPreview }) {
  if (!preview.found) {
    return (
      <div
        className="rounded-2xl px-4 py-4"
        style={{ backgroundColor: SURFACE_LOWEST, boxShadow: CARD_SHADOW }}
      >
        <p className="text-sm font-semibold" style={{ color: ON_SURFACE }}>
          {preview.device.name}
        </p>
        <p className="mt-1 text-sm" style={{ color: '#b91c1c' }}>
          No Roam account on {preview.device.phoneLabel || preview.device.phoneE164}. Add them with their @tag instead.
        </p>
      </div>
    );
  }

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
  if (!open) return null;

  const matched = previews.filter((p) => p.found);
  const unmatched = previews.filter((p) => !p.found);
  const canConfirm = !loading && matched.length > 0 && unmatched.length === 0;

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
              Confirm Roam member
            </h2>
            <p className="text-sm" style={{ color: ON_SURFACE_VARIANT }}>
              Make sure this is the right person before adding
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
              {previews.map((preview) => (
                <PreviewCard key={preview.device.deviceId} preview={preview} />
              ))}
            </div>
          )}
        </div>

        <div className="border-t px-5 py-4 safe-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
          {!loading && unmatched.length > 0 ? (
            <p className="mb-3 text-center text-sm" style={{ color: '#b91c1c' }}>
              {unmatched.length === 1
                ? 'This contact cannot be added until they have a Roam account on this phone.'
                : `${unmatched.length} contacts are not on Roam yet and will not be added.`}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onBack}
              disabled={submitting}
              className="h-12 flex-1 rounded-2xl text-base font-semibold disabled:opacity-50"
              style={{ backgroundColor: SURFACE_LOW, color: ON_SURFACE }}
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canConfirm || submitting}
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
          </div>
        </div>
      </div>
    </div>
  );
}
