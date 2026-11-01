import type { DriverCarKitItem } from '../../services/driverInventoryApi';
import {
  carKitItemIcon,
  carKitItemStatusClass,
  carKitItemStatusLabel,
} from '../carKitItemUi';

export function Dk1KitItemRows({
  items,
  onReport,
}: {
  items: DriverCarKitItem[];
  onReport?: (name: string) => void;
}) {
  return (
    <>
      {items.map((item) => (
        <div key={item.id ?? item.name}>
          <div className="p-space-md flex flex-col gap-space-xs bg-surface-container-lowest hover:bg-surface-container-low transition-colors">
            <div className="flex items-start justify-between gap-space-xs">
              <div className="flex items-center gap-space-sm min-w-0">
                <div className="w-10 h-10 rounded-full bg-inverse-surface flex items-center justify-center flex-shrink-0 text-inverse-on-surface">
                  <span className="material-symbols-outlined text-[20px]">{carKitItemIcon(item.status)}</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-body-md text-body-md font-semibold text-on-surface truncate">{item.name}</span>
                  {item.locationHint ? (
                    <span className="font-body-sm text-body-sm text-on-surface-variant">{item.locationHint}</span>
                  ) : null}
                </div>
              </div>
              <span className={carKitItemStatusClass(item.status)}>
                <span className="material-symbols-outlined text-[16px]">{carKitItemIcon(item.status)}</span>
                {carKitItemStatusLabel(item.status)}
              </span>
            </div>
            {item.status !== 'linked' ? (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  className="font-body-sm text-body-sm font-semibold text-secondary hover:text-error transition-colors py-1.5 px-2 -mr-2 min-h-[48px] flex items-center"
                  onClick={() => onReport?.(item.name)}
                >
                  Report a problem
                </button>
              </div>
            ) : null}
          </div>
          <div className="h-px bg-surface-container-high mx-space-md" />
        </div>
      ))}
    </>
  );
}
