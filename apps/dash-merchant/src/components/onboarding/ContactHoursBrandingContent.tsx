import { toast } from 'sonner';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import PartnerImageUploadField from './PartnerImageUploadField';
import {
  DayToggle,
  inputClass,
  SectionCard,
  SectionHeader,
  TipCard,
} from './OnboardingShell';
import { SignUpFormData } from '../../signup/types';

export interface DayHours {
  open: string;
  close: string;
  isClosed: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_HOURS: DayHours = { open: '09:00', close: '21:00', isClosed: false };

const timeInputClass =
  'h-12 w-full appearance-none rounded-lg border border-outline-variant bg-white px-3 text-body-sm text-on-surface outline-none partner-field focus:border-primary focus:ring-1 focus:ring-primary';

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

interface ContactHoursBrandingContentProps {
  data: SignUpFormData;
  hours: DayHours[];
  onChange: (patch: Partial<SignUpFormData>) => void;
  onHoursChange: (hours: DayHours[]) => void;
}

export function createDefaultHours(): DayHours[] {
  return DAYS.map(() => ({ ...DEFAULT_HOURS }));
}

export default function ContactHoursBrandingContent({
  data,
  hours,
  onChange,
  onHoursChange,
}: ContactHoursBrandingContentProps) {
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
    <>
      <SectionCard>
        <SectionHeader
          icon="contact_phone"
          title="Contact Information"
          subtitle="How can customers reach your restaurant?"
        />
        <hr className="border-outline-variant/50" />
        <div className="flex flex-col gap-inset-sm">
          <div className="flex flex-col gap-inset-base">
            <label className="text-label-md font-semibold text-on-surface" htmlFor="wizard-phone">
              Business phone <span className="text-error">*</span>
            </label>
            <input
              id="wizard-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={data.phone}
              onChange={(e) => onChange({ phone: digitsOnly(e.target.value) })}
              placeholder="8765551234"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-inset-base">
            <label className="text-label-md font-semibold text-on-surface" htmlFor="wizard-email">
              Business email <span className="text-error">*</span>
            </label>
            <input
              id="wizard-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={data.email}
              onChange={(e) => onChange({ email: e.target.value.trim() })}
              className={inputClass}
            />
            <p className="text-label-sm text-on-surface-variant">
              Prefilled from your account. Update if your business uses a different email.
            </p>
          </div>
          <div className="flex flex-col gap-inset-base">
            <label className="text-label-md font-semibold text-on-surface" htmlFor="wizard-website">
              Website <span className="font-normal text-on-surface-variant">(optional)</span>
            </label>
            <input
              id="wizard-website"
              type="url"
              value={data.website}
              onChange={(e) => onChange({ website: e.target.value })}
              placeholder="https://www.yourrestaurant.com"
              className={inputClass}
            />
          </div>
        </div>
      </SectionCard>

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

      <SectionCard>
        <SectionHeader
          icon="image"
          title="Branding"
          subtitle="Add images to make your restaurant stand out"
        />
        <div className="mt-inset-sm flex flex-col gap-inset-sm">
          <PartnerImageUploadField
            label="Restaurant Logo"
            hint="Upload Square"
            value={data.logoUrl}
            onChange={(url) => onChange({ logoUrl: url })}
            folder="logos"
            aspectRatio="logo"
          />
          <PartnerImageUploadField
            label="Cover Image"
            hint="Upload 16:9 Image"
            value={data.coverImageUrl}
            onChange={(url) => onChange({ coverImageUrl: url })}
            folder="covers"
            aspectRatio="cover"
          />
        </div>
        <TipCard icon="lightbulb">
          Restaurants with high-quality photos receive more orders on average.
        </TipCard>
      </SectionCard>
    </>
  );
}
