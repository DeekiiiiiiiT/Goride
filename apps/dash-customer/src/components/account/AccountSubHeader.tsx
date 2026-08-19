import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { getProfile, PROFILE_HEADER_AVATAR } from '@/lib/accountContent';

type Props = {
  onBack?: () => void;
  onNotifications: () => void;
};

export function AccountSubHeader({ onBack, onNotifications }: Props) {
  const profile = getProfile();

  return (
    <header className="w-full top-0 sticky bg-surface shadow-sm z-40 safe-t">
      <div className="flex items-center justify-between px-4 py-2 min-h-14 w-full max-w-[1200px] mx-auto">
        <div className="flex items-center gap-3 min-w-0">
          {onBack ? (
            <button
              type="button"
              aria-label="Go back"
              onClick={onBack}
              className="min-h-11 min-w-11 rounded-full flex items-center justify-center text-primary -ml-2"
            >
              <MaterialIcon name="arrow_back" />
            </button>
          ) : (
            <div className="w-10 h-10 rounded-full overflow-hidden bg-surface-container-high border border-outline-variant shrink-0">
              <img src={profile.avatarUrl || PROFILE_HEADER_AVATAR} alt="Profile" className="w-full h-full object-cover" />
            </div>
          )}
          <h1 className="text-headline-sm font-bold text-primary tracking-tight">Roam Rush</h1>
        </div>
        <button
          type="button"
          aria-label="Notification settings"
          onClick={onNotifications}
          className="min-h-11 min-w-11 p-2 rounded-full text-on-surface-variant flex items-center justify-center"
        >
          <MaterialIcon name="notifications" />
        </button>
      </div>
    </header>
  );
}
