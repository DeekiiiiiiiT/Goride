import { ReactNode } from 'react';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import {
  APPLIES_TO_OPTIONS,
  ELIGIBILITY_OPTIONS,
  PROMOTION_TYPE_OPTIONS,
  PromotionFormData,
  PromotionType,
  USAGE_LIMIT_OPTIONS,
} from '../../types/promotions';

interface CreatePromotionViewProps {
  form: PromotionFormData;
  onChange: (updates: Partial<PromotionFormData>) => void;
  onSetType: (type: PromotionType) => void;
  onSetAutoGenerateCode: (enabled: boolean) => void;
  onBack: () => void;
  onCreate: () => boolean;
}

const fieldClass =
  'block h-12 w-full rounded-lg border border-outline-variant bg-surface px-sm text-body-lg text-on-surface outline-none transition-shadow placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-2 focus:ring-primary';

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-outline-variant bg-surface-container-lowest p-sm shadow-sm">
      <h2 className="mb-xs text-label-md uppercase tracking-wider text-on-surface-variant">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SettingsToggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
}) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <div className="h-6 w-11 rounded-full bg-surface-variant transition-colors peer-checked:bg-primary-container peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary peer-focus:ring-offset-2 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:bg-surface-container-lowest after:shadow-sm after:transition-all peer-checked:after:translate-x-5" />
    </label>
  );
}

export default function CreatePromotionView({
  form,
  onChange,
  onSetType,
  onSetAutoGenerateCode,
  onBack,
  onCreate,
}: CreatePromotionViewProps) {
  const showDiscountValue = form.type === 'percent_off' || form.type === 'amount_off';
  const discountSuffix = form.type === 'amount_off' ? 'J$' : '%';
  const discountSuffixPosition = form.type === 'amount_off' ? 'left' : 'right';

  const handleCreate = () => {
    if (onCreate()) onBack();
  };

  return (
    <div className="fixed inset-0 z-[65] flex min-h-dvh flex-col bg-background text-on-surface">
      <header className="sticky top-0 z-50 flex h-16 w-full shrink-0 items-center border-b border-outline-variant bg-surface-container-lowest/90 px-margin-mobile backdrop-blur-md">
        <button
          type="button"
          onClick={onBack}
          className="flex h-12 w-12 items-center justify-start text-on-surface-variant transition-colors hover:text-primary"
          aria-label="Go back"
        >
          <MaterialIcon name="arrow_back" size={24} />
        </button>
        <h1 className="flex-1 pr-12 text-center text-headline-md text-on-surface">New Promotion</h1>
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-sm px-margin-mobile py-sm pb-32">
        <SectionCard title="Promotion Details">
          <div className="mb-sm">
            <span className="mb-xs block text-label-md text-on-surface">Promotion Type</span>
            <div className="grid grid-cols-2 gap-xs">
              {PROMOTION_TYPE_OPTIONS.map((option) => {
                const isActive = form.type === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onSetType(option.value)}
                    className={`flex h-12 items-center justify-center rounded-lg border text-label-md transition-colors ${
                      isActive
                        ? 'border-transparent bg-primary-container text-on-primary-container shadow-sm'
                        : 'border-outline-variant bg-surface text-on-surface-variant hover:bg-surface-container'
                    }`}
                  >
                    {option.createLabel}
                  </button>
                );
              })}
            </div>
          </div>

          {showDiscountValue && (
            <div>
              <label className="mb-xs block text-label-md text-on-surface" htmlFor="discount-value">
                Discount Value
              </label>
              <div className="relative">
                {discountSuffixPosition === 'left' && (
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-sm">
                    <span className="text-body-lg text-on-surface-variant">{discountSuffix}</span>
                  </div>
                )}
                <input
                  id="discount-value"
                  type="number"
                  min={0}
                  value={form.discountValue}
                  onChange={(event) => onChange({ discountValue: event.target.value })}
                  className={`${fieldClass} ${discountSuffixPosition === 'left' ? 'pl-12' : 'pr-10'}`}
                />
                {discountSuffixPosition === 'right' && (
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-sm">
                    <span className="text-body-lg text-on-surface-variant">{discountSuffix}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Conditions">
          <div className="mb-sm">
            <label className="mb-xs block text-label-md text-on-surface" htmlFor="applies-to">
              Applies To
            </label>
            <div className="relative">
              <select
                id="applies-to"
                value={form.appliesTo}
                onChange={(event) =>
                  onChange({ appliesTo: event.target.value as PromotionFormData['appliesTo'] })
                }
                className={`${fieldClass} appearance-none pr-10`}
              >
                {APPLIES_TO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-sm">
                <MaterialIcon name="expand_more" className="text-on-surface-variant" />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-xs block text-label-md text-on-surface" htmlFor="min-order">
              Minimum Order (Optional)
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-sm">
                <span className="text-body-lg text-on-surface-variant">J$</span>
              </div>
              <input
                id="min-order"
                type="text"
                inputMode="numeric"
                value={form.minOrder}
                onChange={(event) => onChange({ minOrder: event.target.value })}
                placeholder="1,000"
                className={`${fieldClass} pl-12`}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Schedule & Code">
          <div className="mb-sm">
            <div className="mb-xs flex items-center justify-between">
              <span className="text-label-md text-on-surface">Promo Code</span>
              <div className="flex items-center gap-2">
                <span className="text-label-sm text-on-surface-variant">Auto-generate</span>
                <SettingsToggle
                  id="auto-generate-code"
                  checked={form.autoGenerateCode}
                  onChange={onSetAutoGenerateCode}
                />
              </div>
            </div>
            <input
              id="promo-code"
              type="text"
              value={form.promoCode}
              disabled={form.autoGenerateCode}
              onChange={(event) =>
                onChange({ promoCode: event.target.value.toUpperCase() })
              }
              placeholder="e.g. SUMMER20"
              className={`${fieldClass} uppercase placeholder:normal-case disabled:opacity-70`}
            />
          </div>

          <div className="grid grid-cols-2 gap-sm">
            <div>
              <label className="mb-xs block text-label-md text-on-surface" htmlFor="valid-from">
                Valid From
              </label>
              <div className="relative">
                <input
                  id="valid-from"
                  type="date"
                  value={form.dateStart}
                  onChange={(event) => onChange({ dateStart: event.target.value })}
                  className={`${fieldClass} pr-10 text-body-sm`}
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <MaterialIcon name="calendar_today" size={20} className="text-on-surface-variant" />
                </div>
              </div>
            </div>
            <div>
              <label className="mb-xs block text-label-md text-on-surface" htmlFor="valid-until">
                Valid Until
              </label>
              <div className="relative">
                <input
                  id="valid-until"
                  type="date"
                  value={form.dateEnd}
                  onChange={(event) => onChange({ dateEnd: event.target.value })}
                  className={`${fieldClass} pr-10 text-body-sm`}
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <MaterialIcon name="calendar_today" size={20} className="text-on-surface-variant" />
                </div>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Eligibility & Limits">
          <div className="mb-sm">
            <span className="mb-xs block text-label-md text-on-surface">Customer Eligibility</span>
            <div className="space-y-2">
              {ELIGIBILITY_OPTIONS.map((option) => {
                const isSelected = form.customerEligibility === option.value;
                return (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center rounded-lg border p-3 transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary-container/10'
                        : 'border-outline-variant hover:bg-surface-container'
                    }`}
                  >
                    <input
                      type="radio"
                      name="eligibility"
                      value={option.value}
                      checked={isSelected}
                      onChange={() => onChange({ customerEligibility: option.value })}
                      className="h-5 w-5 border-outline-variant text-primary focus:ring-primary"
                    />
                    <span className="ml-3 text-body-sm text-on-surface">{option.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <span className="mb-xs block text-label-md text-on-surface">Usage Limits</span>
            <div className="relative">
              <select
                value={form.usageLimitType}
                onChange={(event) =>
                  onChange({
                    usageLimitType: event.target.value as PromotionFormData['usageLimitType'],
                  })
                }
                className={`${fieldClass} appearance-none pr-10`}
              >
                {USAGE_LIMIT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-sm">
                <MaterialIcon name="expand_more" className="text-on-surface-variant" />
              </div>
            </div>
          </div>
        </SectionCard>
      </main>

      <div className="fixed bottom-0 left-0 z-50 w-full border-t border-outline-variant bg-surface-container-lowest p-margin-mobile shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={handleCreate}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-primary-container text-headline-md text-on-primary-container shadow-sm transition-colors hover:bg-primary-container/90 active:scale-[0.98]"
          >
            Create Promotion
          </button>
        </div>
      </div>
    </div>
  );
}
