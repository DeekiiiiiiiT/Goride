import { formatJobStationLabel, type JobStation } from '../../types/team';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

interface StoreTabletChromeProps {
  storeName: string;
  station: JobStation;
  onUnpair?: () => void;
  children?: React.ReactNode;
}

export default function StoreTabletChrome({
  storeName,
  station,
  onUnpair,
  children,
}: StoreTabletChromeProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="safe-t flex items-center justify-between gap-inset-sm border-b border-outline-variant bg-surface px-margin-mobile py-2 md:px-margin-tablet">
        <div className="min-w-0">
          <p className="truncate text-label-md font-semibold text-on-background">{storeName}</p>
          <p className="text-label-sm text-on-surface-variant">{formatJobStationLabel(station)} tablet</p>
        </div>
        {onUnpair && (
          <button
            type="button"
            onClick={onUnpair}
            className="flex shrink-0 items-center gap-1 rounded-full border border-outline-variant px-3 py-2 text-label-sm text-on-surface-variant"
          >
            <MaterialIcon name="link_off" size={18} />
            Unpair
          </button>
        )}
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
