import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface DashboardSimpleHeaderProps {
  notificationCount?: number;
  onNotificationsClick: () => void;
}

export default function DashboardSimpleHeader({
  notificationCount = 0,
  onNotificationsClick,
}: DashboardSimpleHeaderProps) {
  return (
    <header className="fixed top-0 left-0 z-50 flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile shadow-sm">
      <button
        type="button"
        className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant transition-transform duration-200 hover:bg-surface-container active:scale-95"
        aria-label="Restaurant"
      >
        <MaterialIcon name="restaurant" size={24} />
      </button>

      <h1 className="text-headline-md font-bold text-primary">Roam Dash</h1>

      <button
        type="button"
        onClick={onNotificationsClick}
        className="relative flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant transition-transform duration-200 hover:bg-surface-container active:scale-95"
        aria-label="Notifications"
      >
        <MaterialIcon name="notifications" size={24} />
        {notificationCount > 0 && (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-error" />
        )}
      </button>
    </header>
  );
}
