import {
  BUSINESS_DAYS,
  DaySchedule,
} from '../../../hooks/useMerchantSettings';
import { DayToggle, TimeField } from './hoursShared';
import { MaterialIcon } from '../../../signup/components/MaterialIcon';

interface RegularScheduleTabProps {
  hours: DaySchedule[];
  onToggleDayOpen: (dayIndex: number, isOpen: boolean) => void;
  onUpdateShift: (
    dayIndex: number,
    shiftIndex: number,
    field: 'open' | 'close',
    value: string,
  ) => void;
  onAddShift: (dayIndex: number) => void;
  onRemoveShift: (dayIndex: number, shiftIndex: number) => void;
  onCopyToAll: (sourceDayIndex: number) => void;
}

export default function RegularScheduleTab({
  hours,
  onToggleDayOpen,
  onUpdateShift,
  onAddShift,
  onRemoveShift,
  onCopyToAll,
}: RegularScheduleTabProps) {
  return (
    <section className="flex flex-col gap-inset-sm">
      <div className="mb-inset-xs flex items-center justify-between">
        <div>
          <h2 className="text-headline-md text-on-background">Weekly schedule</h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            Your normal open hours for each day of the week.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onCopyToAll(1)}
          className="flex shrink-0 items-center gap-inset-base text-label-md text-primary-container transition-colors hover:text-primary active:scale-95"
        >
          <MaterialIcon name="content_copy" size={16} />
          Copy to all
        </button>
      </div>

      {BUSINESS_DAYS.map(({ label, index }) => {
        const day = hours[index];
        const isOpen = !day.isClosed;

        return (
          <div
            key={label}
            className={`flex flex-col gap-inset-sm rounded-lg border border-outline-variant p-inset-sm shadow-sm transition-shadow md:p-inset-md ${
              isOpen
                ? 'bg-surface-container-lowest hover:shadow-md'
                : 'bg-surface-container opacity-75 grayscale-[0.5]'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-inset-sm">
                <span
                  className={`w-24 text-body-lg font-semibold ${
                    isOpen ? 'text-on-surface' : 'text-on-surface-variant'
                  }`}
                >
                  {label}
                </span>
                <DayToggle
                  id={`toggle-${index}`}
                  checked={isOpen}
                  onChange={(checked) => onToggleDayOpen(index, checked)}
                />
                <span className="hidden text-body-sm text-on-surface-variant md:inline-block">
                  {isOpen ? 'Open' : 'Closed'}
                </span>
              </div>
              {isOpen && day.shifts.length === 1 && (
                <button
                  type="button"
                  onClick={() => onAddShift(index)}
                  className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
                  title="Add split shift"
                >
                  <MaterialIcon name="add" />
                </button>
              )}
            </div>

            {isOpen ? (
              <div className="mt-inset-xs flex flex-col gap-inset-sm">
                {day.shifts.map((shift, shiftIndex) => (
                  <div key={`${label}-${shiftIndex}`}>
                    {shiftIndex > 0 && <div className="my-1 h-px w-full bg-surface-variant" />}
                    <div className="flex flex-wrap items-center gap-inset-sm">
                      <TimeField
                        label="Opening Time"
                        value={shift.open}
                        onChange={(value) => onUpdateShift(index, shiftIndex, 'open', value)}
                        showLabel={shiftIndex === 0 || day.shifts.length > 1}
                      />
                      <span className="mt-6 px-1 text-body-lg text-on-surface-variant">-</span>
                      <TimeField
                        label="Closing Time"
                        value={shift.close}
                        onChange={(value) => onUpdateShift(index, shiftIndex, 'close', value)}
                        showLabel={shiftIndex === 0 || day.shifts.length > 1}
                      />
                      {day.shifts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onRemoveShift(index, shiftIndex)}
                          className="mt-6 flex h-12 w-12 items-center justify-center self-end rounded-full text-error transition-colors hover:bg-error-container"
                          title="Remove shift"
                        >
                          <MaterialIcon name="close" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                {day.shifts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onAddShift(index)}
                    className="mt-2 flex w-full items-center justify-center gap-inset-base rounded-md border border-dashed border-primary-container py-2 text-label-md text-primary-container transition-colors hover:text-primary"
                  >
                    <MaterialIcon name="add" size={18} />
                    Add Break/Shift
                  </button>
                )}
              </div>
            ) : (
              <div className="mt-inset-xs py-inset-sm text-center">
                <p className="text-body-sm italic text-on-surface-variant">
                  Store is closed on this day.
                </p>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
