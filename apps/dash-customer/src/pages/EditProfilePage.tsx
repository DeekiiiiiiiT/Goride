import { FormEvent, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { DEFAULT_PROFILE, getProfile, saveProfile } from '@/lib/accountContent';

type Props = {
  onNavigate: (page: string) => void;
};

export default function EditProfilePage({ onNavigate }: Props) {
  const initial = getProfile();
  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    saveProfile({ firstName, lastName, email, phone });
    onNavigate('account');
  };

  return (
    <div className="bg-surface text-on-surface min-h-screen flex flex-col">
      <header className="bg-surface w-full top-0 sticky shadow-sm z-50">
        <div className="flex items-center justify-between px-4 py-2 w-full max-w-[1200px] mx-auto h-16">
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
          <div className="relative group cursor-pointer">
            <div className="w-32 h-32 rounded-full overflow-hidden shadow-sm">
              <img src={DEFAULT_PROFILE.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
            </div>
            <div className="absolute inset-0 bg-black/40 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <MaterialIcon name="photo_camera" className="text-white mb-1" filled />
              <span className="text-white text-label-sm">Edit</span>
            </div>
            <div className="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full shadow-md border-2 border-surface md:hidden">
              <MaterialIcon name="edit" className="text-sm" filled />
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 max-w-md mx-auto">
          <div className="space-y-4">
            <div>
              <label htmlFor="firstName" className="block text-label-md font-semibold text-on-surface-variant mb-2">
                First name
              </label>
              <input
                id="firstName"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
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
                onChange={e => setLastName(e.target.value)}
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
                  onChange={e => setEmail(e.target.value)}
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
                  onChange={e => setPhone(e.target.value)}
                  className="input-field w-full rounded-lg pl-12 pr-4 py-3 text-body-md"
                  required
                />
              </div>
            </div>
          </div>

          <div className="pt-6 mt-8 border-t border-surface-container-high">
            <button
              type="submit"
              className="w-full bg-primary text-white text-headline-sm font-semibold py-4 rounded-lg shadow-sm hover:opacity-90 active:scale-[0.98] transition-all"
            >
              Save Changes
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
