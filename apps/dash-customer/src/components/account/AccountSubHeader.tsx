import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { getProfile, PROFILE_HEADER_AVATAR } from '@/lib/accountContent';

export function AccountSubHeader() {
  const profile = getProfile();

  return (
    <header className="w-full top-0 sticky bg-surface shadow-sm z-40">
      <div className="flex items-center justify-between px-4 py-2 w-full max-w-[1200px] mx-auto">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-high border border-outline-variant shrink-0">
            <img src={profile.avatarUrl || PROFILE_HEADER_AVATAR} alt="Profile" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-headline-sm font-bold text-primary tracking-tight">Roam Dash</h1>
        </div>
        <button type="button" className="p-2 rounded-full text-on-surface-variant">
          <MaterialIcon name="notifications" />
        </button>
      </div>
    </header>
  );
}
