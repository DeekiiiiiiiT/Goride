import React, { useEffect, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { MOCK_EDIT_PROFILE_DRAFT } from '@/lib/mockProfile';
import { loadCourierProfile, updateCourierProfile } from '@/lib/courierProfileService';
import { uploadAndGetProofUrl, resolveCourierFileUrl } from '@/lib/courierFileUpload';
import { toast } from '@/lib/toast';

type EditProfilePageProps = {
  onBack: () => void;
  onSave: () => void;
};

type FieldConfig = {
  id: keyof typeof MOCK_EDIT_PROFILE_DRAFT;
  label: string;
  icon: string;
  type: string;
  placeholder: string;
};

const FIELDS: FieldConfig[] = [
  { id: 'fullName', label: 'Full Name', icon: 'person', type: 'text', placeholder: 'Enter your full name' },
  { id: 'displayName', label: 'Display Name', icon: 'badge', type: 'text', placeholder: 'How customers see you' },
  { id: 'phone', label: 'Phone Number', icon: 'call', type: 'tel', placeholder: 'Phone number' },
  { id: 'email', label: 'Email Address', icon: 'mail', type: 'email', placeholder: 'Email address' },
];

export function EditProfilePage({ onBack, onSave }: EditProfilePageProps) {
  const [form, setForm] = useState(MOCK_EDIT_PROFILE_DRAFT);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void loadCourierProfile().then(async (row) => {
      if (!row) return;
      setForm((prev) => ({
        ...prev,
        fullName: row.display_name ?? prev.fullName,
        displayName: row.display_name ?? prev.displayName,
        phone: row.phone ?? prev.phone,
        email: row.email ?? prev.email,
      }));
      const raw = row.profile_photo_url || '';
      if (raw) {
        const resolved = (await resolveCourierFileUrl(raw)) || raw;
        setExistingPhotoUrl(raw);
        setPhotoPreview(resolved);
      }
    });
  }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
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
          {FIELDS.map((field) => (
            <div key={field.id} className="flex flex-col gap-1">
              <label htmlFor={field.id} className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant ml-1">
                {field.label}
              </label>
              <div className="rounded-xl bg-surface border border-outline-variant shadow-soft flex items-center px-4 h-14 focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-shadow">
                <MaterialIcon name={field.icon} className="text-muted mr-2" />
                <input
                  id={field.id}
                  type={field.type}
                  value={form[field.id]}
                  placeholder={field.placeholder}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.id]: e.target.value }))}
                  className="w-full bg-transparent border-none p-0 text-base text-on-surface focus:ring-0 placeholder:text-muted"
                />
              </div>
            </div>
          ))}
        </form>
      </main>

      <div className="fixed bottom-0 w-full bg-surface/90 backdrop-blur-md px-[var(--spacing-edge)] py-4 pb-safe shadow-[0_-6px_12px_rgba(0,108,73,0.1)] border-t border-surface-container-low">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="w-full h-14 bg-primary text-on-primary rounded-xl text-xs font-semibold uppercase tracking-wide flex items-center justify-center shadow-primary active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
