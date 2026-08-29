import { SignUpFormData } from '../../signup/types';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

export const PARTNER_PLAN_OPTIONS = [
  {
    slug: 'economy',
    name: 'Economy',
    tagline: 'Lowest commission — customers pay more for delivery.',
    commissionPct: 15,
    deliveryFeeJmd: 900,
    boostLabel: 'Standard listing',
  },
  {
    slug: 'growth',
    name: 'Growth',
    tagline: 'Balanced commission with a mid-range delivery fee.',
    commissionPct: 25,
    deliveryFeeJmd: 450,
    boostLabel: 'Higher search placement',
  },
  {
    slug: 'dominant',
    name: 'Dominant',
    tagline: 'Highest commission — we buy down delivery and push you up search.',
    commissionPct: 30,
    deliveryFeeJmd: 150,
    boostLabel: 'Top search boost',
  },
] as const;

export type PartnerPlanSlug = (typeof PARTNER_PLAN_OPTIONS)[number]['slug'];

interface PlanStepContentProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
}

export default function PlanStepContent({ data, onChange }: PlanStepContentProps) {
  return (
    <div className="flex flex-col gap-inset-md">
      <div>
        <h1 className="text-headline-lg text-on-surface">Choose your plan</h1>
        <p className="mt-2 text-body-md text-on-surface-variant">
          Pick how you want to show up on Roam Rush. You can change this later with our team.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {PARTNER_PLAN_OPTIONS.map((plan) => {
          const selected = data.pricingTierSlug === plan.slug;
          return (
            <button
              key={plan.slug}
              type="button"
              onClick={() => onChange({ pricingTierSlug: plan.slug })}
              className={`rounded-xl border p-4 text-left transition-all active:scale-[0.99] ${
                selected
                  ? 'border-primary bg-primary-container/15 shadow-sm'
                  : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-title-md text-on-surface">{plan.name}</p>
                  <p className="mt-1 text-body-sm text-on-surface-variant">{plan.tagline}</p>
                </div>
                <MaterialIcon
                  name={selected ? 'check_circle' : 'radio_button_unchecked'}
                  className={selected ? 'text-primary' : 'text-on-surface-variant'}
                />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-surface-container-low px-2 py-2">
                  <dt className="text-label-sm text-on-surface-variant">Commission</dt>
                  <dd className="text-label-lg text-on-surface">{plan.commissionPct}%</dd>
                </div>
                <div className="rounded-lg bg-surface-container-low px-2 py-2">
                  <dt className="text-label-sm text-on-surface-variant">Delivery</dt>
                  <dd className="text-label-lg text-on-surface">
                    J${plan.deliveryFeeJmd.toLocaleString()}
                  </dd>
                </div>
                <div className="rounded-lg bg-surface-container-low px-2 py-2">
                  <dt className="text-label-sm text-on-surface-variant">Boost</dt>
                  <dd className="text-label-md text-on-surface leading-tight">{plan.boostLabel}</dd>
                </div>
              </dl>
            </button>
          );
        })}
      </div>
    </div>
  );
}
