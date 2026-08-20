import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { DayToggle, SectionCard } from './OnboardingShell';
import { DAYS, type DayHours } from './operating-hours';

const timeInputClass =
  'h-12 w-full appearance-none rounded-lg border border-outline-variant bg-white px-3 text-body-sm text-on-surface outline-none partner-field focus:border-primary focus:ring-1 focus:ring-primary';

interface OperatingHoursStepContentProps {
  hours: DayHours[];
  onHoursChange: (hours: DayHours[]) => void;
}

export default function OperatingHoursStepContent({
  hours,
  onHoursChange,
}: OperatingHoursStepContentProps) {
  const updateHours = (dayIndex: number, field: keyof DayHours, value: string | boolean) => {
    const updated = [...hours];
    updated[dayIndex] = { ...updated[dayIndex], [field]: value };
    onHoursChange(updated);
  };

  const applyToAllDays = (sourceIndex: number) => {
    const source = hours[sourceIndex];
    onHoursChange(DAYS.map(() => ({ ...source })));
    toast.success('Applied to all days');
  };

  return (
    <SectionCard className="p-6">
      <div className="mb-6 flex flex-col gap-inset-xs">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <MaterialIcon name="schedule" className="text-primary" size={28} />
        </div>
        <h2 className="text-headline-lg-mobile font-bold text-on-surface">Operating Hours</h2>
        <p className="text-body-sm text-on-surface-variant">When is your restaurant open for orders?</p>
      </div>
      <div className="flex flex-col gap-6">
        {DAYS.map((day, index) => {
          const isOpen = !hours[index].isClosed;
          return (
            <div
              key={day}
              className="flex flex-col gap-3 border-b border-outline-variant/30 pb-6 last:border-0 last:pb-0"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-label-md font-semibold uppercase ${
                    isOpen ? 'text-on-surface' : 'text-on-surface-variant'
                  }`}
                >
                  {day}
                </span>
                <DayToggle
                  id={`wizard-day-${index}`}
                  checked={isOpen}
                  onChange={(checked) => updateHours(index, 'isClosed', !checked)}
                />
              </div>
              {isOpen ? (
                <>
                  <div className="flex w-full items-center gap-3">
                    <input
                      type="time"
                      value={hours[index].open}
                      onChange={(e) => updateHours(index, 'open', e.target.value)}
                      className={timeInputClass}
                    />
                    <span className="text-body-sm text-on-surface-variant">to</span>
                    <input
                      type="time"
                      value={hours[index].close}
                      onChange={(e) => updateHours(index, 'close', e.target.value)}
                      className={timeInputClass}
                    />
                  </div>
                  {index === 1 && (
                    <button
                      type="button"
                      onClick={() => applyToAllDays(index)}
                      className="self-start text-label-md font-semibold text-primary-container"
                    >
                      Apply to all days
                    </button>
                  )}
                </>
              ) : (
                <div className="flex h-12 items-center rounded-lg border border-outline-variant/20 bg-surface px-4">
                  <span className="text-body-sm italic text-on-surface-variant">Closed</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}
