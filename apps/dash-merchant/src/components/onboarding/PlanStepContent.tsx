import { SignUpFormData } from '../../signup/types';
import { MaterialIcon } from '../../signup/components/MaterialIcon';

export const PARTNER_PLAN_OPTIONS = [
  {
    slug: 'economy',
    name: 'Economy',
    concept: 'Lowest commission — standard listing, modest reach.',
    bestFor:
      'Busy local spots with their own following — they don’t need Roam for marketing.',
    commissionPct: 15,
    radiusKm: 5,
    boostLabel: 'Standard listing',
    bullets: [
      'You keep ~85% of food sales',
      'Suggested ~5 km reach (Roam sets live coverage)',
      'Standard search placement',
      'Delivery fee is platform-wide — not set by this plan',
    ],
  },
  {
    slug: 'growth',
    name: 'Growth',
    concept: 'Balanced commission with better radius and mild search boost.',
    bestFor:
      'Mid-sized places that want more orders without Dominant-level commission.',
    commissionPct: 25,
    radiusKm: 8,
    boostLabel: 'Higher in search',
    bullets: [
      'You keep ~75% of food sales',
      'Suggested ~8 km reach + mild search boost',
      'Promo eligible for launch / free-delivery campaigns',
      'Access to Rush Pass members (free delivery + fee cut)',
      'Delivery fee is platform-wide — not set by this plan',
    ],
  },
  {
    slug: 'dominant',
    name: 'Dominant',
    concept: 'Highest commission — widest reach, top ranking, automatic promoted placement.',
    bestFor:
      'Delivery-heavy spots that want maximum visibility and volume.',
    commissionPct: 30,
    radiusKm: 12,
    boostLabel: 'Top search boost',
    bullets: [
      'You keep ~70% of food sales',
      'Suggested ~12 km reach + strong search boost',
      'Automatic promoted placement in Rush (not a paid ads marketplace)',
      'Access to Rush Pass members (free delivery + fee cut)',
      'Priority placement and promo access for more orders',
      'Delivery fee is platform-wide — not set by this plan',
    ],
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
          Higher commission = wider reach, stronger ranking, and promo access. Delivery fee is set
          by Roam for everyone — not by plan. You can change this later with our team.
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
                  <p className="mt-1 text-body-sm text-on-surface-variant">
                    <span className="font-medium text-on-surface">Concept: </span>
                    {plan.concept}
                  </p>
                  <p className="mt-1 text-body-sm text-on-surface-variant">
                    <span className="font-medium text-on-surface">Best for: </span>
                    {plan.bestFor}
                  </p>
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
                  <dt className="text-label-sm text-on-surface-variant">Reach</dt>
                  <dd className="text-label-lg text-on-surface">~{plan.radiusKm} km</dd>
                </div>
                <div className="rounded-lg bg-surface-container-low px-2 py-2">
                  <dt className="text-label-sm text-on-surface-variant">Boost</dt>
                  <dd className="text-label-md text-on-surface leading-tight">{plan.boostLabel}</dd>
                </div>
              </dl>
              <ul className="mt-3 space-y-1 text-body-sm text-on-surface-variant list-disc pl-4">
                {plan.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
}
