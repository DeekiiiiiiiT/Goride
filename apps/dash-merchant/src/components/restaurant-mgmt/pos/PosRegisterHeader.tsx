import { MaterialIcon } from '../../../signup/components/MaterialIcon';

interface PosRegisterHeaderProps {
  storeName: string;
  staffName?: string;
  onUnpair?: () => void;
  onEndShift?: () => void;
}

export default function PosRegisterHeader({
  storeName,
  staffName,
  onUnpair,
  onEndShift,
}: PosRegisterHeaderProps) {
  const staffInitial = staffName?.trim().charAt(0).toUpperCase() || '?';

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-surface-variant bg-surface px-margin-mobile shadow-sm md:px-margin-tablet">
      <div className="flex items-center gap-4">
        <span className="text-title-lg font-bold text-primary">{storeName}</span>
        <div className="mx-2 hidden h-6 w-px bg-outline-variant sm:block" />
        <span className="hidden text-label-lg text-on-surface-variant sm:inline">POS Register</span>
      </div>

      <div className="flex items-center gap-3 md:gap-6">
        <div className="hidden gap-2 sm:flex">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-container px-3 py-1 text-label-md text-on-primary-container">
            <MaterialIcon name="wifi" size={16} />
            Roam
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-container px-3 py-1 text-label-md text-on-primary-container">
            <MaterialIcon name="storefront" size={16} />
            In-store
          </span>
        </div>

        <div className="hidden items-center gap-1 md:flex">
          <button
            type="button"
            className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high"
            aria-label="Notifications"
          >
            <MaterialIcon name="notifications" />
          </button>
          <button
            type="button"
            className="flex h-12 w-12 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container-high"
            aria-label="Settings"
          >
            <MaterialIcon name="settings" />
          </button>
        </div>

        {staffName && (
          <div className="flex items-center gap-2 rounded-lg border-l border-outline-variant pl-3 md:gap-3 md:pl-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container font-bold text-on-primary-container">
              {staffInitial}
            </div>
            <span className="hidden max-w-[120px] truncate text-label-lg text-on-surface sm:inline">
              {staffName}
            </span>
            {onEndShift && (
              <button
                type="button"
                onClick={onEndShift}
                className="hidden items-center gap-1 rounded-full border border-outline-variant px-3 py-1.5 text-label-sm text-on-surface-variant transition-colors hover:bg-surface-container-high sm:inline-flex"
              >
                <MaterialIcon name="logout" size={16} />
                End shift
              </button>
            )}
            <MaterialIcon name="expand_more" className="hidden text-on-surface-variant sm:inline" />
          </div>
        )}

        {onUnpair && (
          <button
            type="button"
            onClick={onUnpair}
            className="flex shrink-0 items-center gap-1 rounded-full border border-outline-variant px-3 py-2 text-label-sm text-on-surface-variant md:hidden"
          >
            <MaterialIcon name="link_off" size={18} />
            Unpair
          </button>
        )}
      </div>
    </header>
  );
}
