import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import {
  DEFAULT_PROFILE,
  getProfile,
  persistProfile,
  persistProfilePhoto,
  syncProfileFromBackend,
  type UserProfile,
} from '@/lib/accountContent';
import { CUSTOMER_AVATAR_ACCEPT } from '@/lib/profileAvatar';
import { toast } from '@/lib/toast';

type Props = {
  onNavigate: (page: string) => void;
};

export default function EditProfilePage({ onNavigate }: Props) {
  const [profile, setProfile] = useState<UserProfile>(getProfile);
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const remote = await syncProfileFromBackend();
      if (cancelled) return;
      setProfile(remote);
      setFirstName(remote.firstName);
      setLastName(remote.lastName);
      setEmail(remote.email);
      setPhone(remote.phone);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await persistProfile({ firstName, lastName, email, phone });
      toast.success('Profile saved');
      onNavigate('account');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePhotoPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setProfile((prev) => ({ ...prev, avatarUrl: preview }));
    setUploadingPhoto(true);
    try {
      const next = await persistProfilePhoto(file);
      setProfile(next);
      toast.success('Photo updated');
    } catch (err) {
      setProfile(getProfile());
      toast.error(err instanceof Error ? err.message : 'Could not update photo');
    } finally {
      URL.revokeObjectURL(preview);
      setUploadingPhoto(false);
    }
  };

  return (
    <div className="bg-surface text-on-surface min-h-dvh flex flex-col">
      <header className="bg-surface w-full top-0 sticky shadow-sm z-50 safe-t">
        <div className="flex items-center justify-between px-4 py-2 w-full max-w-[1200px] mx-auto min-h-16">
          <button
            type="button"
            aria-label="Go back"
            onClick={() => onNavigate('account')}
            className="text-primary p-2 -ml-2"
          >
            <MaterialIcon name="arrow_back" />
          </button>
          <h1 className="text-headline-sm font-bold">Edit Profile</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="flex-grow w-full max-w-[1200px] mx-auto px-4 pt-6 pb-8">
        <div className="flex flex-col items-center justify-center mb-8">
          <input
            ref={fileRef}
            type="file"
            accept={CUSTOMER_AVATAR_ACCEPT}
            className="hidden"
            onChange={(e) => void handlePhotoPick(e)}
          />
          <button
            type="button"
            aria-label="Change profile photo"
            disabled={uploadingPhoto || loading}
            onClick={() => fileRef.current?.click()}
            className="relative group disabled:opacity-70"
          >
            <div className="w-32 h-32 rounded-full overflow-hidden shadow-sm">
              <img
                src={profile.avatarUrl || DEFAULT_PROFILE.avatarUrl}
                alt="Profile"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <MaterialIcon name="photo_camera" className="text-white mb-1" filled />
              <span className="text-white text-label-sm">{uploadingPhoto ? 'Uploading…' : 'Edit'}</span>
            </div>
            <div className="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full shadow-md border-2 border-surface md:hidden">
              <MaterialIcon name="edit" className="text-sm" filled />
            </div>
          </button>
        </div>

        {loading ? (
          <p className="text-center text-on-surface-variant text-body-md">Loading profile…</p>
        ) : (
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-6 max-w-md mx-auto">
            <div className="space-y-4">
              <div>
                <label htmlFor="firstName" className="block text-label-md font-semibold text-on-surface-variant mb-2">
                  First name
                </label>
                <input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="input-field w-full rounded-lg px-4 py-3 text-body-md"
                  required
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-label-md font-semibold text-on-surface-variant mb-2">
                  Last name
                </label>
                <input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="input-field w-full rounded-lg px-4 py-3 text-body-md"
                  required
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-label-md font-semibold text-on-surface-variant mb-2">
                  Email
                </label>
                <div className="relative">
                  <MaterialIcon name="mail" className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field w-full rounded-lg pl-12 pr-4 py-3 text-body-md"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="phone" className="block text-label-md font-semibold text-on-surface-variant mb-2">
                  Phone number
                </label>
                <div className="relative">
                  <MaterialIcon name="phone" className="absolute left-4 top-1/2 -translate-y-1/2 text-outline" />
                  <input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="input-field w-full rounded-lg pl-12 pr-4 py-3 text-body-md"
                    required
                  />
                </div>
              </div>
            </div>

            <div className="pt-6 mt-8 border-t border-surface-container-high">
              <button
                type="submit"
                disabled={saving}
                className="w-full bg-primary text-white text-headline-sm font-semibold py-4 rounded-lg shadow-sm hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
