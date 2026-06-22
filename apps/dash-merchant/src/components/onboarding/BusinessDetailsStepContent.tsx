import { DELIVERY_RADIUS_OPTIONS, PREP_TIME_OPTIONS, SignUpFormData } from '../../signup/types';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { inputClass, SectionCard, SectionHeader } from './OnboardingShell';

interface BusinessDetailsStepContentProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
}

const fieldClass = inputClass;

export default function BusinessDetailsStepContent({
  data,
  onChange,
}: BusinessDetailsStepContentProps) {
  return (
    <SectionCard>
      <SectionHeader
        icon="description"
        title="Business details"
        subtitle="Tell us a bit more about your operations so we can configure your dashboard correctly."
      />
      <hr className="border-outline-variant/50" />
      <div className="flex flex-col gap-inset-md">
        <div className="flex flex-col gap-inset-base">
          <label className="flex justify-between text-label-md font-semibold text-on-surface" htmlFor="biz_reg">
            Business registration number
            <span className="font-normal text-on-surface-variant">Optional</span>
          </label>
          <input
            id="biz_reg"
            type="text"
            className={fieldClass}
            placeholder="e.g. 123456789"
            value={data.businessRegistrationNumber}
            onChange={(e) => onChange({ businessRegistrationNumber: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-inset-base">
          <label className="flex justify-between text-label-md font-semibold text-on-surface" htmlFor="tax_id">
            Tax ID / TRN
            <span className="font-normal text-on-surface-variant">Optional</span>
          </label>
          <input
            id="tax_id"
            type="text"
            className={fieldClass}
            placeholder="e.g. TAX-987654"
            value={data.taxId}
            onChange={(e) => onChange({ taxId: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-inset-base">
          <label className="text-label-md font-semibold text-on-surface">Average prep time</label>
          <p className="text-body-sm text-on-surface-variant">
            Helps us calculate accurate pickup times for couriers.
          </p>
          <div className="flex flex-wrap gap-2">
            {PREP_TIME_OPTIONS.map((minutes) => (
              <label key={minutes} className="relative cursor-pointer select-none">
                <input
                  type="radio"
                  name="prep_time"
                  value={minutes}
                  checked={data.avgPrepTime === minutes}
                  onChange={() => onChange({ avgPrepTime: minutes })}
                  className="peer sr-only"
                />
                <div className="flex h-12 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-lowest px-5 text-body-sm text-on-surface-variant transition-colors hover:bg-surface-container-low peer-checked:border-primary-container peer-checked:bg-primary-container peer-checked:font-medium peer-checked:text-on-primary-container">
                  {minutes} min
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-inset-base">
          <label className="text-label-md font-semibold text-on-surface" htmlFor="delivery_radius">
            Delivery radius preference
          </label>
          <div className="relative">
            <select
              id="delivery_radius"
              className={`${fieldClass} cursor-pointer appearance-none pr-12`}
              value={data.deliveryRadius}
              onChange={(e) => onChange({ deliveryRadius: e.target.value })}
            >
              <option disabled value="">
                Select maximum distance
              </option>
              {DELIVERY_RADIUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <MaterialIcon
              name="expand_more"
              className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
