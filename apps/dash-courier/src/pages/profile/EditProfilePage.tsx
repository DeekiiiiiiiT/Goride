import React, { useEffect, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { loadCourierProfile, updateCourierProfile } from '@/lib/courierProfileService';
import { claimCourierRoamTag, loadCourierRoamTag } from '@/lib/courierRoamTagService';
import { uploadAndGetProofUrl, resolveCourierFileUrl } from '@/lib/courierFileUpload';
import { toast } from '@/lib/toast';
import { formatCourierRoamTagDisplay, normalizeCourierRoamTagName, validateCourierRoamTagName } from '@roam/types';

type EditProfilePageProps = {
  onBack: () => void;
  onSave: () => void;
};

type ProfileForm = {
  fullName: string;
  displayName: string;
  phone: string;
  email: string;
};

const EMPTY_FORM: ProfileForm = {
  fullName: '',
  displayName: '',
  phone: '',
  email: '',
};

type FieldConfig = {
  id: keyof ProfileForm;
  label: string;
  icon: string;
  type: string;
  placeholder: string;
};

const FIELDS_BEFORE_TAG: FieldConfig[] = [
  { id: 'fullName', label: 'Full Name', icon: 'person', type: 'text', placeholder: 'Enter your full name' },
  { id: 'displayName', label: 'Display Name', icon: 'badge', type: 'text', placeholder: 'How customers see you' },
];

const FIELDS_AFTER_TAG: FieldConfig[] = [
  { id: 'phone', label: 'Phone Number', icon: 'call', type: 'tel', placeholder: 'Phone number' },
  { id: 'email', label: 'Email Address', icon: 'mail', type: 'email', placeholder: 'Email address' },
];

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={field.id} className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant ml-1">
        {field.label}
      </label>
      <div className="rounded-xl bg-surface border border-outline-variant shadow-soft flex items-center px-4 h-14 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-shadow">
        <MaterialIcon name={field.icon} className="text-muted mr-2" />
        <input
          id={field.id}
          type={field.type}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent border-none p-0 text-base text-on-surface focus:ring-0 placeholder:text-muted"
        />
      </div>
    </div>
  );
}

export function EditProfilePage({ onBack, onSave }: EditProfilePageProps) {
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | undefined>();
  const [roamTagDraft, setRoamTagDraft] = useState('');
  const [roamTagLocked, setRoamTagLocked] = useState(false);
  const [tagTip, setTagTip] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [row, tag] = await Promise.all([loadCourierProfile(), loadCourierRoamTag()]);
      if (cancelled) return;
      if (!row) {
        setLoadState('error');
        return;
      }
      setForm({
        fullName: row.display_name || '',
        displayName: row.display_name || '',
        phone: row.phone || '',
        email: row.email || '',
      });
      if (tag?.custom_tag_name) {
        setRoamTagDraft(tag.custom_tag_name);
        setRoamTagLocked(true);
      }
      const raw = row.profile_photo_url || '';
      if (raw) {
        const resolved = (await resolveCourierFileUrl(raw)) || raw;
        if (cancelled) return;
        setExistingPhotoUrl(raw);
        setPhotoPreview(resolved);
      }
      setLoadState('ready');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (loadState !== 'ready') return;
    setSaving(true);
    let profilePhotoUrl = existingPhotoUrl;
    if (photoFile) {
      const url = await uploadAndGetProofUrl(photoFile, 'avatars');
      if (!url) {
        setSaving(false);
        toast.error('Upload failed', 'Could not save your profile photo. Try again.');
        return;
      }
      profilePhotoUrl = url;
    }

    if (!roamTagLocked && roamTagDraft.trim()) {
      const localCheck = validateCourierRoamTagName(roamTagDraft);
      if (localCheck) {
        setSaving(false);
        const tips: Record<string, string> = {
          tag_length: 'Pick something between 3 and 24 characters.',
          tag_format: 'Use letters, numbers, and underscores only — no spaces.',
          tag_reserved: 'That name isn’t available. Try a different @tag.',
        };
        setTagTip(tips[localCheck] || 'Try a different Roam Tag and save again.');
        return;
      }
      const tagResult = await claimCourierRoamTag(normalizeCourierRoamTagName(roamTagDraft));
      if (!tagResult.ok) {
        setSaving(false);
        setTagTip(tagResult.error);
        return;
      }
      setRoamTagDraft(tagResult.tag.custom_tag_name || roamTagDraft);
      setRoamTagLocked(Boolean(tagResult.tag.has_custom_tag));
    }

    const patch: Parameters<typeof updateCourierProfile>[0] = {
      display_name: form.displayName || form.fullName,
      phone: form.phone,
      email: form.email,
    };
    if (profilePhotoUrl) {
      patch.profile_photo_url = profilePhotoUrl;
    }
    const ok = await updateCourierProfile(patch);
    setSaving(false);
    if (ok) {
      toast.success('Profile updated');
      onSave();
    } else {
      toast.error('Could not save profile');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col">
      <SubPageHeader title="Edit Profile" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 pb-32">
        {loadState === 'loading' && (
          <p className="text-sm text-muted mb-4">Loading your profile…</p>
        )}
        {loadState === 'error' && (
          <p className="text-sm text-error mb-4">Could not load your profile. Go back and try again.</p>
        )}
        <section className="flex flex-col items-center mb-8">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />
          <div className="relative group mb-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-24 h-24 rounded-full overflow-hidden border-4 border-surface shadow-soft bg-surface-container flex items-center justify-center"
              aria-label="Change photo"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <MaterialIcon name="person" className="text-4xl text-muted" />
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <MaterialIcon name="photo_camera" className="text-white" filled />
              </div>
            </button>
            <button
              type="button"
              aria-label="Change photo"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 bg-surface rounded-full flex items-center justify-center shadow-primary text-primary hover:bg-surface-container-low active:scale-90"
            >
              <MaterialIcon name="edit" className="text-lg" filled />
            </button>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-primary text-xs font-semibold uppercase tracking-wide py-2 px-4 rounded-full hover:bg-surface-container-low active:scale-95"
          >
            Change Photo
          </button>
        </section>

        <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
          {FIELDS_BEFORE_TAG.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              value={form[field.id]}
              onChange={(v) => setForm((prev) => ({ ...prev, [field.id]: v }))}
            />
          ))}

          <div className="flex flex-col gap-1">
            <label htmlFor="roamTag" className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant ml-1">
              Roam Tag
            </label>
            <div
              className={`rounded-xl bg-surface border border-outline-variant shadow-soft flex items-center px-4 h-14 transition-shadow ${
                roamTagLocked
                  ? 'opacity-90'
                  : 'focus-within:ring-1 focus-within:ring-primary focus-within:border-primary'
              }`}
            >
              <MaterialIcon name="alternate_email" className="text-muted mr-2" />
              <span className="text-muted mr-0.5 select-none">@</span>
              <input
                id="roamTag"
                type="text"
                value={roamTagDraft.replace(/^@+/, '')}
                placeholder="your_tag"
                readOnly={roamTagLocked}
                onChange={(e) =>
                  setRoamTagDraft(
                    e.target.value
                      .replace(/^@+/, '')
                      .toLowerCase()
                      .replace(/[^a-z0-9_]/g, ''),
                  )
                }
                className="w-full bg-transparent border-none p-0 text-base text-on-surface focus:ring-0 placeholder:text-muted read-only:cursor-default"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
            <p className="text-[11px] text-muted ml-1 mt-1">
              {roamTagLocked
                ? `Your permanent Roam Tag is ${formatCourierRoamTagDisplay(roamTagDraft)}. Fleets use this to invite you.`
                : 'Choose a unique @tag so delivery companies can invite you. You can’t change it later.'}
            </p>
          </div>

          {FIELDS_AFTER_TAG.map((field) => (
            <FieldRow
              key={field.id}
              field={field}
              value={form[field.id]}
              onChange={(v) => setForm((prev) => ({ ...prev, [field.id]: v }))}
            />
          ))}
        </form>
      </main>

      <div className="fixed bottom-0 w-full bg-surface/90 backdrop-blur-md px-[var(--spacing-edge)] py-4 pb-safe shadow-[0_-6px_12px_rgba(0,108,73,0.1)] border-t border-surface-container-low">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || loadState !== 'ready'}
          className="w-full h-14 bg-primary text-on-primary rounded-xl text-xs font-semibold uppercase tracking-wide flex items-center justify-center shadow-primary active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {tagTip ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-[var(--spacing-edge)]">
          <button
            type="button"
            className="absolute inset-0 bg-inverse-surface/30 backdrop-blur-sm"
            onClick={() => setTagTip(null)}
            aria-label="Dismiss"
          />
          <div
            role="dialog"
            aria-labelledby="roam-tag-tip-title"
            className="relative z-10 w-full max-w-sm bg-surface rounded-2xl shadow-lg overflow-hidden"
          >
            <div className="h-1 w-full bg-primary" />
            <div className="p-6 flex flex-col items-center text-center gap-5">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <MaterialIcon name="alternate_email" className="text-[28px] text-primary" filled />
              </div>
              <div className="space-y-2">
                <h2 id="roam-tag-tip-title" className="text-lg font-semibold text-on-surface">
                  About your Roam Tag
                </h2>
                <p className="text-sm text-muted leading-relaxed">{tagTip}</p>
              </div>
              <button
                type="button"
                onClick={() => setTagTip(null)}
                className="w-full min-h-12 rounded-xl bg-primary text-on-primary text-sm font-semibold uppercase tracking-wide active:scale-[0.98] transition-transform"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
