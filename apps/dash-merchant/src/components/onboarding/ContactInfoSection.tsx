import { inputClass, SectionCard, SectionHeader } from './OnboardingShell';
import { SignUpFormData } from '../../signup/types';

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

interface ContactInfoSectionProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
}

export default function ContactInfoSection({ data, onChange }: ContactInfoSectionProps) {
  return (
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
  );
}
