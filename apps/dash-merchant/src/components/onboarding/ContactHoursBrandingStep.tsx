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

interface ContactHoursBrandingStepProps {
  data: SignUpFormData;
  hours: DayHours[];
  onChange: (patch: Partial<SignUpFormData>) => void;
  onHoursChange: (hours: DayHours[]) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function createDefaultHours(): DayHours[] {
  return DAYS.map(() => ({ ...DEFAULT_HOURS }));
}

export default function ContactHoursBrandingStep({
  data,
  hours,
  onChange,
  onHoursChange,
  onBack,
  onContinue,
}: ContactHoursBrandingStepProps) {
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

  const canContinue = data.phone.trim().length >= 7 && data.email.includes('@');

  return (
    <div className="flex min-h-dvh flex-col bg-background pb-28 font-body-lg text-on-background">
      <header className="sticky top-0 z-50 flex h-16 items-center bg-background/80 px-margin-mobile backdrop-blur-md">
        <button type="button" onClick={onBack} className="flex h-12 w-12 items-center justify-start text-on-surface">
          <MaterialIcon name="arrow_back" size={24} />
        </button>
        <div className="flex-1 text-center text-label-md text-on-surface-variant">Step 4 of 6</div>
        <div className="w-12" />
      </header>

      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-inset-md px-margin-mobile pt-inset-sm">
        <SectionCard>
          <SectionHeader icon="contact_phone" title="Contact Information" subtitle="How can customers reach you?" />
          <hr className="border-outline-variant/50" />
          <div className="flex flex-col gap-inset-sm">
            <div className="flex flex-col gap-inset-base">
              <label className="text-label-md font-semibold text-on-surface" htmlFor="wizard-phone">Phone</label>
              <input
                id="wizard-phone"
                type="tel"
                value={data.phone}
                onChange={(e) => onChange({ phone: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-inset-base">
              <label className="text-label-md font-semibold text-on-surface" htmlFor="wizard-email">Email</label>
              <input
                id="wizard-email"
                type="email"
                value={data.email}
                onChange={(e) => onChange({ email: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="flex flex-col gap-inset-base">
              <label className="text-label-md font-semibold text-on-surface" htmlFor="wizard-website">Website (optional)</label>
              <input
                id="wizard-website"
                type="url"
                value={data.website}
                onChange={(e) => onChange({ website: e.target.value })}
                placeholder="https://"
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
          </div>
          <div className="flex flex-col gap-6">
            {DAYS.map((day, index) => {
              const isOpen = !hours[index].isClosed;
              return (
                <div key={day} className="flex flex-col gap-3 border-b border-outline-variant/30 pb-6 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-label-md font-semibold uppercase ${isOpen ? 'text-on-surface' : 'text-on-surface-variant'}`}>
                      {day}
                    </span>
                    <DayToggle
                      id={`wizard-day-${index}`}
                      checked={isOpen}
                      onChange={(checked) => updateHours(index, 'isClosed', !checked)}
                    />
                  </div>
                  {isOpen ? (
                    <div className="flex w-full items-center gap-3">
                      <input type="time" value={hours[index].open} onChange={(e) => updateHours(index, 'open', e.target.value)} className={timeInputClass} />
                      <span className="text-body-sm text-on-surface-variant">to</span>
                      <input type="time" value={hours[index].close} onChange={(e) => updateHours(index, 'close', e.target.value)} className={timeInputClass} />
                    </div>
                  ) : (
                    <div className="flex h-12 items-center rounded-lg border border-outline-variant/20 bg-surface px-4">
                      <span className="text-body-sm italic text-on-surface-variant">Closed</span>
                    </div>
                  )}
                  {isOpen && index === 1 && (
                    <button type="button" onClick={() => applyToAllDays(index)} className="self-start text-label-md font-semibold text-primary-container">
                      Apply to all days
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard>
          <SectionHeader icon="image" title="Branding" subtitle="Add images to make your restaurant stand out" />
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
          <TipCard icon="lightbulb">Restaurants with high-quality photos receive more orders on average.</TipCard>
        </SectionCard>
      </main>

      <div className="fixed bottom-0 left-0 z-40 w-full border-t border-outline-variant bg-surface px-margin-mobile py-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className="flex h-12 w-full items-center justify-center rounded-lg bg-primary text-label-md font-semibold text-on-primary disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
