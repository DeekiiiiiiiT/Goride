import type { MerchantBusinessTypeConfig } from '@roam/types';
import { getVerticalLabels } from '@roam/vertical-config';
import {
  DELIVERY_RADIUS_OPTIONS,
  PREP_TIME_OPTIONS,
  RETAIL_DELIVERY_RADIUS_OPTIONS,
  RETAIL_PREP_TIME_OPTIONS,
  SignUpFormData,
} from '../../signup/types';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { inputClass } from './OnboardingShell';
import { PartnerWizardProgress } from './PartnerWizardProgress';

interface BusinessDetailsStepContentProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
  typeConfig?: MerchantBusinessTypeConfig | null;
  stepNumber?: number;
}

function ChipPill({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-6 py-2.5 text-label-lg transition-all active:scale-95 ${
        selected
          ? 'border-primary bg-primary text-on-primary shadow-sm'
          : 'border-outline text-primary hover:bg-surface-container-low'
      }`}
    >
      {label}
    </button>
  );
}

export default function BusinessDetailsStepContent({
  data,
  onChange,
  typeConfig,
  stepNumber = 4,
}: BusinessDetailsStepContentProps) {
  const labels = getVerticalLabels(typeConfig?.vertical_type, typeConfig?.fulfillment_type);
  const isPickAndPack = typeConfig?.fulfillment_type === 'pick_and_pack';
  const prepOptions = isPickAndPack ? RETAIL_PREP_TIME_OPTIONS : PREP_TIME_OPTIONS;
  const radiusOptions = isPickAndPack ? RETAIL_DELIVERY_RADIUS_OPTIONS : DELIVERY_RADIUS_OPTIONS;

  if (isPickAndPack) {
    return (
      <div className="space-y-10">
        <PartnerWizardProgress currentStep={stepNumber} />

        <header>
          <h2 className="text-headline-md font-semibold text-on-surface">Operations Setup</h2>
          <p className="mt-2 text-body-lg text-on-surface-variant">
            Configure your pick-and-pack efficiency to optimize courier dispatching and delivery times.
          </p>
        </header>

        <section>
          <label className="text-title-md font-semibold text-on-surface">{labels.prepTimeLabel}*</label>
          <p className="mt-1 text-body-md text-on-surface-variant">{labels.prepTimeHelper}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {prepOptions.map((minutes) => (
              <ChipPill
                key={minutes}
                label={`${minutes} min`}
                selected={data.avgPrepTime === minutes}
                onClick={() => onChange({ avgPrepTime: minutes })}
              />
            ))}
          </div>
        </section>

        <section>
          <label className="text-title-md font-semibold text-on-surface">Delivery radius*</label>
          <p className="mt-1 text-body-md text-on-surface-variant">{labels.deliveryRadiusHelper}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {radiusOptions.map((option) => (
              <ChipPill
                key={option.value}
                label={option.label.replace(' km', 'km')}
                selected={data.deliveryRadius === option.value}
                onClick={() => onChange({ deliveryRadius: option.value })}
              />
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
          <h3 className="flex items-center gap-2 text-title-md font-semibold text-on-surface">
            <MaterialIcon name="inventory_2" className="text-primary" />
            Inventory Automation (Optional)
          </h3>
          <p className="text-body-sm text-on-surface-variant">
            Connect stock alerts later from your partner dashboard.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-headline-md font-semibold text-on-surface">Configure Your Kitchen</h2>
        <p className="mt-2 text-body-md text-on-surface-variant">
          Help us sync your kitchen flow with our delivery network for the best customer experience.
        </p>
      </header>

      <section className="rounded-xl border border-outline-variant bg-white/80 p-6 shadow-sm backdrop-blur-sm">
        <h3 className="mb-4 text-title-md font-semibold text-on-surface">Business Identification (Optional)</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-label-md text-on-surface-variant" htmlFor="biz_reg">
              Business registration #
            </label>
            <input
              id="biz_reg"
              type="text"
              className={inputClass}
              placeholder="BRN-000000"
              value={data.businessRegistrationNumber}
              onChange={(e) => onChange({ businessRegistrationNumber: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-label-md text-on-surface-variant" htmlFor="tax_id">
              Tax ID / TRN
            </label>
            <input
              id="tax_id"
              type="text"
              className={inputClass}
              placeholder="TRN-123-456-789"
              value={data.taxId}
              onChange={(e) => onChange({ taxId: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-outline-variant bg-white/80 p-6 shadow-sm backdrop-blur-sm">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-title-md font-semibold text-on-surface">{labels.prepTimeLabel}*</h3>
            <p className="mt-1 text-body-md text-on-surface-variant">{labels.prepTimeHelper}</p>
          </div>
          <MaterialIcon name="timer" className="text-on-surface-variant" />
        </div>
        <div className="flex flex-wrap gap-3">
          {prepOptions.map((minutes) => (
            <ChipPill
              key={minutes}
              label={`${minutes} min`}
              selected={data.avgPrepTime === minutes}
              onClick={() => onChange({ avgPrepTime: minutes })}
            />
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-outline-variant bg-white/80 p-6 shadow-sm backdrop-blur-sm">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-title-md font-semibold text-on-surface">Delivery radius*</h3>
            <div className="mt-1 flex items-center gap-2">
              <MaterialIcon name="info" filled className="text-sm text-primary" />
              <p className="text-body-md text-on-surface-variant">{labels.deliveryRadiusHelper}</p>
            </div>
          </div>
          <MaterialIcon name="distance" className="text-on-surface-variant" />
        </div>

        <div className="relative mb-6 h-40 overflow-hidden rounded-lg border border-outline-variant bg-surface-container-high">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex h-20 w-20 animate-pulse items-center justify-center rounded-full border-2 border-primary bg-primary/20">
              <MaterialIcon name="restaurant" className="text-primary" />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          {radiusOptions.map((option) => (
            <ChipPill
              key={option.value}
              label={option.label}
              selected={data.deliveryRadius === option.value}
              onClick={() => onChange({ deliveryRadius: option.value })}
            />
          ))}
        </div>
      </section>

      <div className="flex items-center gap-4 rounded-xl bg-warning-container p-4">
        <MaterialIcon name="lightbulb" className="text-tertiary" />
        <p className="text-body-md text-on-tertiary-fixed-variant">
          Cook-to-order kitchens perform 24% better with a 15-minute prep window.
        </p>
      </div>
    </div>
  );
}
