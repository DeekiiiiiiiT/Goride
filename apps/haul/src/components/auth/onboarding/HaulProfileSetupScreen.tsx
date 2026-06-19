import React, { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, User } from 'lucide-react';
import { HaulAuthAtmosphere } from '../HaulAuthAtmosphere';
import { haulErrorBox, haulFieldLabel, haulInput, haulPrimaryBtn } from '../haulAuthUi';

export type ProfileSetupData = {
  fullName: string;
  displayName: string;
  phone: string;
  photoFile: File | null;
};

type Props = {
  initialPhone?: string;
  onBack?: () => void;
  onContinue: (data: ProfileSetupData) => void;
};

export function HaulProfileSetupScreen({ initialPhone = '', onBack, onContinue }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fullName, setFullName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState(initialPhone);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePhoto = (file: File | null) => {
    if (!file) return;
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) {
      setError('Enter your full legal name.');
      return;
    }
    if (!phone.trim()) {
      setError('Enter your primary phone number.');
      return;
    }
    setError(null);
    onContinue({
      fullName: fullName.trim(),
      displayName: displayName.trim(),
      phone: phone.trim(),
      photoFile,
    });
  };

  return (
    <div className="relative min-h-[100dvh] bg-[#0b1326] text-[#dae2fd] antialiased">
      <HaulAuthAtmosphere />

      <main className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-[600px] flex-col px-4 pt-12 pb-8 md:px-12 md:pt-20">
        <header className="mb-10 w-full">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="-ml-2 mb-6 flex h-11 w-11 items-center justify-center text-[#d8c3ad] hover:text-[#ffc174]"
              aria-label="Go back"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
          ) : null}
          <h1 className="text-[28px] leading-9 font-bold tracking-tight md:text-[32px]">
            Set up your profile
          </h1>
          <p className="mt-2 text-base text-[#d8c3ad]">Let dispatch know who&apos;s behind the wheel.</p>
        </header>

        {error ? <div className={`${haulErrorBox} mb-6`}>{error}</div> : null}

        <form className="flex flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="mb-10 flex justify-center">
            <button
              type="button"
              className="group relative"
              onClick={() => fileRef.current?.click()}
            >
              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-[#534434] bg-[#171f33] transition-all group-hover:border-[#ffc174] group-hover:shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-10 w-10 text-[#d8c3ad] group-hover:text-[#ffc174]" />
                )}
              </div>
              <div className="absolute right-0 bottom-0 flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-[#0b1326] bg-[#f59e0b] shadow-lg transition-transform group-hover:scale-110">
                <Camera className="h-5 w-5 text-[#472a00]" />
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
              />
            </button>
          </div>

          <div className="space-y-6">
            <div className="flex flex-col gap-2">
              <label className={haulFieldLabel} htmlFor="fullName">
                Full Legal Name
              </label>
              <input
                id="fullName"
                required
                className={`${haulInput} rounded-lg border border-[#534434] bg-[#171f33]`}
                placeholder="e.g. Jack Reynolds"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-end justify-between">
                <label className={haulFieldLabel} htmlFor="displayName">
                  Display Name / Handle
                </label>
                <span className="text-xs text-[#d8c3ad]/70">Optional</span>
              </div>
              <input
                id="displayName"
                className={`${haulInput} rounded-lg border border-[#534434] bg-[#171f33]`}
                placeholder="e.g. HeavyHaul Jack"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className={haulFieldLabel} htmlFor="phoneNumber">
                Primary Phone Number
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute top-1/2 left-4 -translate-y-1/2 text-[20px] text-[#d8c3ad]">
                  call
                </span>
                <input
                  id="phoneNumber"
                  required
                  type="tel"
                  className={`${haulInput} rounded-lg border border-[#534434] bg-[#171f33] pl-12`}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mt-auto pt-8">
            <button type="submit" className={`${haulPrimaryBtn} h-14`}>
              Continue
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
