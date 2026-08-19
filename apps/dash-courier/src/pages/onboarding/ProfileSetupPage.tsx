import React, { useEffect, useRef, useState } from 'react';
import { OnboardingHeader } from '@/components/layout/OnboardingHeader';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { loadSignupDraft, saveSignupDraft } from '@/lib/signupDraft';
import { syncCourierProfileFromDraft } from '@/lib/ensureCourierProfile';
import { uploadAndGetProofUrl } from '@/lib/courierFileUpload';
import { toast } from '@/lib/toast';
import { useVisualViewport } from '@/hooks/useVisualViewport';

type ProfileSetupPageProps = {
  onBack: () => void;
  onContinue: () => void;
};

export function ProfileSetupPage({ onBack, onContinue }: ProfileSetupPageProps) {
  const draft = loadSignupDraft();
  const [fullName, setFullName] = useState(draft.fullName);
  const [displayName, setDisplayName] = useState(draft.displayName);
  const [phone, setPhone] = useState(
    draft.phone ? `${draft.countryCode} ${draft.phone}` : '+1 ',
  );
  const [photoPreview, setPhotoPreview] = useState<string | null>(draft.profilePhotoUrl || null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const keyboardOffset = useVisualViewport();

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const nextUrl = URL.createObjectURL(file);
    objectUrlRef.current = nextUrl;
    setPhotoFile(file);
    setPhotoPreview(nextUrl);
  };

  const handleContinue = async () => {
    setUploading(true);
    let profilePhotoUrl = draft.profilePhotoUrl;
    if (photoFile) {
      const url = await uploadAndGetProofUrl(photoFile, 'avatars');
      if (!url) {
        setUploading(false);
        toast.error('Upload failed', 'Could not save your profile photo. Try again.');
        return;
      }
      profilePhotoUrl = url;
    }

    saveSignupDraft({ fullName, displayName, phone, profilePhotoUrl });
    await syncCourierProfileFromDraft();
    setUploading(false);
    onContinue();
  };

  return (
    <div className="bg-background text-on-background min-h-dvh flex flex-col">
      <div className="w-full max-w-[480px] mx-auto bg-surface min-h-dvh flex flex-col relative shadow-lg border border-surface-variant/50">
        <OnboardingHeader title="Roam Rush Courier" onBack={onBack} variant="centered" />

        <div className="flex-1 px-[var(--spacing-edge)] pt-6 pb-[100px] overflow-y-auto flex flex-col">
          <div className="mb-8 text-center flex flex-col items-center">
            <h1 className="text-[28px] leading-9 font-bold tracking-tight text-on-surface mb-2">
              Set up your profile
            </h1>
            <p className="text-sm text-muted max-w-[280px]">
              Help customers recognize you when you&apos;re delivering their orders.
            </p>
          </div>

          <div className="flex flex-col gap-6 flex-1">
            <div className="flex justify-center mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative group cursor-pointer"
                aria-label="Upload profile photo"
              >
                <div className="w-[120px] h-[120px] rounded-full bg-surface-container border-2 border-dashed border-outline-variant flex items-center justify-center overflow-hidden transition-all duration-200 group-hover:border-primary group-hover:bg-surface-container-low shadow-sm">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <MaterialIcon
                      name="person_add"
                      className="text-[40px] text-muted group-hover:text-primary transition-colors"
                    />
                  )}
                </div>
                <div className="absolute bottom-0 right-0 w-10 h-10 bg-primary rounded-full flex items-center justify-center text-on-primary shadow-md border-2 border-surface hover:scale-105 active:scale-95 transition-transform duration-100">
                  <MaterialIcon name="photo_camera" className="text-[20px]" filled />
                </div>
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label htmlFor="fullName" className="text-[11px] font-medium text-on-surface-variant uppercase tracking-wider ml-1">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full bg-surface border border-outline-variant rounded-lg px-4 h-14 text-base text-on-surface placeholder:text-muted focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none shadow-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="displayName" className="text-[11px] font-medium text-on-surface-variant uppercase tracking-wider ml-1">
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Jane (How customers see you)"
                  className="w-full bg-surface border border-outline-variant rounded-lg px-4 h-14 text-base text-on-surface placeholder:text-muted focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none shadow-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="phone" className="text-[11px] font-medium text-on-surface-variant uppercase tracking-wider ml-1">
                  Phone Number
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <MaterialIcon name="phone_iphone" className="text-muted" />
                  </div>
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full bg-surface border border-outline-variant rounded-lg pl-12 pr-4 h-14 text-base text-on-surface placeholder:text-muted focus:ring-2 focus:ring-primary focus:border-primary transition-all outline-none shadow-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] p-[var(--spacing-edge)] bg-surface/90 backdrop-blur-md border-t border-surface-variant/50 z-50"
          style={{
            paddingBottom: `max(1rem, calc(env(safe-area-inset-bottom, 0px) + ${keyboardOffset}px))`,
          }}
        >
          <button
            type="button"
            onClick={() => void handleContinue()}
            disabled={uploading}
            className="w-full h-14 bg-primary-container hover:bg-primary-container/90 text-on-primary rounded-xl font-semibold text-xl flex items-center justify-center gap-2 shadow-[0_6px_12px_rgba(16,185,129,0.2)] active:scale-[0.98] transition-all duration-200 disabled:opacity-60"
          >
            {uploading ? 'Saving…' : 'Continue'}
            {!uploading && <MaterialIcon name="arrow_forward" />}
          </button>
        </div>
      </div>
    </div>
  );
}
