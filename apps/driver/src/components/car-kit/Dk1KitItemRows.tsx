import type { DriverCarKitItem } from '../../services/driverInventoryApi';
import { formatReportedDate } from './carKitDisplay';
import {
  carKitItemIcon,
  carKitItemStatusClass,
  carKitItemStatusLabel,
} from './carKitItemUi';

function rowShellClass(status?: DriverCarKitItem['status']) {
  if (status === 'missing' || status === 'reported') {
    return 'p-space-md flex flex-col gap-space-xs bg-surface-container-low';
  }
  return 'p-space-md flex flex-col gap-space-xs bg-surface-container-lowest hover:bg-surface-container-low transition-colors';
}

export function Dk1KitItemRows({
  items,
  onReport,
  onUpdateStatus,
}: {
  items: DriverCarKitItem[];
  onReport?: (name: string) => void;
  onUpdateStatus?: (item: DriverCarKitItem) => void;
}) {
  return (
    <>
      {items.map((item) => {
        const reportedDate = formatReportedDate(item.reportedAt);
        const isOut = item.status === 'missing' || item.status === 'reported';
        const isLinked = item.status === 'linked';
        return (
          <div key={item.id ?? item.name}>
            <div className={rowShellClass(item.status)}>
              <div className="flex items-start justify-between gap-space-xs">
                <div className="flex items-center gap-space-sm min-w-0">
                  <div className="w-10 h-10 rounded-full bg-inverse-surface flex items-center justify-center flex-shrink-0 text-inverse-on-surface">
                    <span className="material-symbols-outlined text-[20px]">{carKitItemIcon(item.status)}</span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-body-md text-body-md font-semibold text-on-surface truncate">{item.name}</span>
                    {isLinked ? (
                      <span className="font-body-sm text-body-sm text-on-surface-variant">Managed by fleet</span>
                    ) : isOut && reportedDate ? (
                      <span className="font-body-sm text-body-sm text-error font-medium">
                        Reported {reportedDate}
                        {item.statusHint ? ` · ${item.statusHint}` : ' · Fleet informed'}
                      </span>
                    ) : item.locationHint ? (
                      <span className="font-body-sm text-body-sm text-on-surface-variant">{item.locationHint}</span>
                    ) : null}
                  </div>
                </div>
                <span className={carKitItemStatusClass(item.status)}>
                  <span className="material-symbols-outlined text-[16px]">{carKitItemIcon(item.status)}</span>
                  {carKitItemStatusLabel(item.status)}
                </span>
              </div>
              {isLinked ? null : isOut ? (
                <div className="flex items-center justify-between pt-1">
                  {item.statusHint ? (
                    <span className="font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1 min-w-0">
                      <span className="material-symbols-outlined text-[16px] text-tertiary shrink-0">schedule</span>
                      <span className="truncate">{item.statusHint}</span>
                    </span>
                  ) : (
                    <span className="font-body-sm text-body-sm text-on-surface-variant">Fleet notified</span>
                  )}
                  <button
                    type="button"
                    className="font-body-sm text-body-sm font-semibold text-on-surface hover:text-primary transition-colors py-1.5 px-2 -mr-2 min-h-[48px] flex items-center shrink-0"
                    onClick={() => onUpdateStatus?.(item)}
                  >
                    Update status
                  </button>
                </div>
              ) : (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    className="font-body-sm text-body-sm font-semibold text-secondary hover:text-error transition-colors py-1.5 px-2 -mr-2 min-h-[48px] flex items-center"
                    onClick={() => onReport?.(item.name)}
                  >
                    Report a problem
                  </button>
                </div>
              )}
            </div>
            <div className="h-px bg-surface-container-high mx-space-md" />
          </div>
        );
      })}
    </>
  );
}
