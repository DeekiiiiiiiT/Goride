import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useHauler } from '../../contexts/HaulerContext';
import { updateHaulerProfile } from '../../utils/updateHaulerProfile';
import { HaulSubpageHeader } from './HaulSubpageHeader';
import { haulPrimaryBtn } from '../auth/haulAuthUi';

type Props = {
  onBack: () => void;
};

export function HaulEditProfilePage({ onBack }: Props) {
  const { user } = useAuth();
  const { profile, refreshProfile } = useHauler();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState(profile?.fullName ?? profile?.displayName ?? '');
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [photoPreview, setPhotoPreview] = useState<string | null>(profile?.profilePhotoUrl ?? null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const handlePhoto = (file: File | null) => {
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateHaulerProfile(user, { fullName, displayName, phone, photoFile });
      await refreshProfile();
      toast.success('Profile updated');
      onBack();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    'h-14 w-full rounded-xl border-2 border-[#534434]/50 bg-[#171f33] pl-[52px] pr-4 text-[#dae2fd] outline-none transition-colors focus:border-[#ffc174]';

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#0b1326]">
      <HaulSubpageHeader title="Edit Profile" onBack={onBack} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-4 pt-[88px] pb-32">
        <div className="relative mb-8">
          <button type="button" onClick={() => fileRef.current?.click()} className="group relative">
            {photoPreview ? (
              <img src={photoPreview} alt="" className="h-[140px] w-[140px] rounded-full border-4 border-[#171f33] object-cover shadow-xl" />
            ) : (
              <div className="flex h-[140px] w-[140px] items-center justify-center rounded-full border-4 border-[#171f33] bg-[#2d3449] text-4xl text-[#ffc174]">
                <span className="material-symbols-outlined text-5xl">person</span>
              </div>
            )}
            <span className="absolute right-0 bottom-0 flex h-11 w-11 items-center justify-center rounded-full border-4 border-[#0b1326] bg-[#ffc174] text-[#472a00] shadow-lg">
              <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
                photo_camera
              </span>
            </span>
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)} />
        </div>

        <form className="flex w-full flex-col gap-6" onSubmit={(e) => { e.preventDefault(); void handleSave(); }}>
          {[
            { id: 'fullName', label: 'Full Name', icon: 'person', value: fullName, onChange: setFullName, type: 'text' },
            { id: 'displayName', label: 'Display Name', icon: 'badge', value: displayName, onChange: setDisplayName, type: 'text' },
            { id: 'phone', label: 'Phone Number', icon: 'call', value: phone, onChange: setPhone, type: 'tel' },
            { id: 'email', label: 'Email Address', icon: 'mail', value: email, onChange: setEmail, type: 'email' },
          ].map((field) => (
            <div key={field.id}>
              <label htmlFor={field.id} className="mb-1 ml-1 block text-sm text-[#d8c3ad]">
                {field.label}
              </label>
              <div className="relative">
                <span className="material-symbols-outlined pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[#d8c3ad]">
                  {field.icon}
                </span>
                <input
                  id={field.id}
                  type={field.type}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  className={fieldClass}
                  readOnly={field.id === 'email'}
                />
              </div>
            </div>
          ))}
        </form>
      </main>
      <div className="fixed bottom-0 left-0 z-50 w-full border-t border-[#534434]/30 bg-[#0b1326]/90 px-4 py-4 backdrop-blur-md">
        <button type="button" disabled={saving} onClick={() => void handleSave()} className={haulPrimaryBtn}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
