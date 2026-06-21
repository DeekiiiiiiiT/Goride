import { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { ACCOUNT_MENU, getProfile, PROFILE_HEADER_AVATAR } from '@/lib/accountContent';

type AccountPageProps = {
  session: Session | null;
  onNavigate: (page: string, data?: Record<string, unknown>) => void;
};

export default function AccountPage({ session, onNavigate }: AccountPageProps) {
  const profile = getProfile();
  const displayName = session ? `${profile.firstName} ${profile.lastName}` : 'Guest';
  const email = session ? profile.email : 'Sign in to save your preferences';
  const phone = session ? profile.phone : '';

  const handleMenuClick = (page?: string) => {
    if (!page) return;
    if (!session && page !== 'login' && page !== 'about') {
      onNavigate('login');
      return;
    }
    onNavigate(page);
  };

  return (
    <div className="pb-32 bg-background min-h-full">
      <header className="w-full sticky z-40 bg-surface shadow-sm flex items-center justify-between px-4 py-2 max-w-[1200px] mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
            <img
              src={session ? profile.avatarUrl : PROFILE_HEADER_AVATAR}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-headline-lg-mobile font-bold text-primary">Roam Dash</h1>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('notification-settings')}
          className="w-10 h-10 rounded-full flex items-center justify-center text-primary"
        >
          <MaterialIcon name="notifications" />
        </button>
      </header>

      <main className="max-w-[1200px] mx-auto px-4 pt-6 flex flex-col gap-6">
        <section className="bg-surface-container-lowest rounded-xl p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.04)] flex flex-col items-center text-center">
          <div className="relative w-24 h-24 mb-4">
            <img
              src={session ? profile.avatarUrl : PROFILE_HEADER_AVATAR}
              alt={displayName}
              className="w-full h-full object-cover rounded-full border-4 border-surface-container-lowest shadow-sm"
            />
            {session && (
              <button
                type="button"
                onClick={() => onNavigate('edit-profile')}
                className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-on-primary rounded-full flex items-center justify-center shadow-md"
              >
                <MaterialIcon name="edit" className="text-[18px]" filled />
              </button>
            )}
          </div>
          <h2 className="text-headline-md font-semibold mb-1">{displayName}</h2>
          <p className="text-body-md text-on-surface-variant mb-1">{email}</p>
          {phone && <p className="text-body-md text-on-surface-variant mb-6">{phone}</p>}
          {!phone && session && <div className="mb-6" />}

          {session ? (
            <button
              type="button"
              onClick={() => onNavigate('edit-profile')}
              className="w-full px-8 py-3 bg-primary text-on-primary rounded-lg font-semibold text-label-md active:scale-[0.98] transition-transform"
            >
              Edit Profile
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="w-full px-8 py-3 bg-primary text-on-primary rounded-lg font-semibold text-label-md"
            >
              Sign In
            </button>
          )}
        </section>

        <section className="bg-surface-container-lowest rounded-xl shadow-[0px_4px_20px_rgba(0,0,0,0.04)] overflow-hidden mb-6">
          <ul className="flex flex-col">
            {ACCOUNT_MENU.map((item, index) => (
              <li key={item.id}>
                {index > 0 && (
                  <div className="px-4">
                    <div className="h-px bg-outline-variant opacity-20" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => handleMenuClick('page' in item ? item.page : undefined)}
                  className="w-full flex items-center px-6 py-4 hover:bg-surface-container-low transition-colors active:scale-[0.99]"
                >
                  <MaterialIcon name={item.icon} className="text-outline mr-4" />
                  <span className="text-body-md flex-grow text-left">{item.label}</span>
                  <MaterialIcon name="chevron_right" className="text-outline-variant" />
                </button>
              </li>
            ))}
            {session && (
              <>
                <li>
                  <div className="px-4">
                    <div className="h-px bg-outline-variant opacity-20" />
                  </div>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      onNavigate('home');
                    }}
                    className="w-full flex items-center px-6 py-4 hover:bg-error-container transition-colors active:scale-[0.99]"
                  >
                    <MaterialIcon name="logout" className="text-error mr-4" />
                    <span className="text-body-md text-error flex-grow text-left font-medium">Sign Out</span>
                    <MaterialIcon name="chevron_right" className="text-outline-variant" />
                  </button>
                </li>
              </>
            )}
          </ul>
        </section>
      </main>
    </div>
  );
}
