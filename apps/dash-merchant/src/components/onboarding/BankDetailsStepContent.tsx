import { JAMAICAN_BANKS, SignUpFormData } from '../../signup/types';
import { MaterialIcon } from '../../signup/components/MaterialIcon';
import { SectionCard, SectionHeader } from './OnboardingShell';

const fieldClass =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-inset-sm text-body-lg text-on-surface placeholder:text-on-surface-variant/50 partner-field';

interface BankDetailsStepContentProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
  onSave: () => void;
  onSkip: () => void;
  isSubmitting?: boolean;
}

export default function BankDetailsStepContent({
  data,
  onChange,
  onSave,
  onSkip,
  isSubmitting = false,
}: BankDetailsStepContentProps) {
  const canSave =
    data.bankName !== '' &&
    data.accountHolderName.trim().length >= 2 &&
    data.accountNumber.trim().length >= 4;

  return (
    <SectionCard>
      <SectionHeader
        icon="account_balance"
        title="Set up payouts"
        subtitle="Where should we send your earnings? You can skip and add this later."
      />
      <hr className="border-outline-variant/50" />
      <form className="flex flex-col gap-inset-md" onSubmit={(e) => e.preventDefault()}>
        <div className="flex flex-col gap-inset-base">
          <label className="text-label-md font-semibold text-on-surface" htmlFor="bankName">
            Bank name
          </label>
          <div className="relative">
            <select
              id="bankName"
              className={`${fieldClass} cursor-pointer appearance-none`}
              value={data.bankName}
              onChange={(e) => onChange({ bankName: e.target.value })}
            >
              <option disabled value="">
                Select your bank
              </option>
              {JAMAICAN_BANKS.map((bank) => (
                <option key={bank} value={bank}>
                  {bank}
                </option>
              ))}
            </select>
            <MaterialIcon
              name="expand_more"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
          </div>
        </div>

        <div className="flex flex-col gap-inset-base">
          <label className="text-label-md font-semibold text-on-surface" htmlFor="accountHolder">
            Account holder name
          </label>
          <input
            id="accountHolder"
            type="text"
            className={fieldClass}
            placeholder="e.g., Jane Doe or Business Name"
            value={data.accountHolderName}
            onChange={(e) => onChange({ accountHolderName: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-inset-base">
          <label className="text-label-md font-semibold text-on-surface" htmlFor="accountNumber">
            Account number
          </label>
          <input
            id="accountNumber"
            type="password"
            className={fieldClass}
            placeholder="Enter account number"
            value={data.accountNumber}
            onChange={(e) => onChange({ accountNumber: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-inset-base">
          <label className="text-label-md font-semibold text-on-surface" htmlFor="routingNumber">
            Routing number
          </label>
          <input
            id="routingNumber"
            type="text"
            className={fieldClass}
            placeholder="9 digit routing number"
            value={data.routingNumber}
            onChange={(e) => onChange({ routingNumber: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-inset-xs">
          <span className="text-label-md font-semibold text-on-surface">Account type</span>
          <div className="flex gap-gutter">
            {(['checking', 'savings'] as const).map((type) => (
              <label
                key={type}
                className="flex flex-1 cursor-pointer items-center gap-inset-xs rounded border border-outline-variant bg-surface-container-low p-inset-sm"
              >
                <input
                  type="radio"
                  name="accountType"
                  value={type}
                  checked={data.accountType === type}
                  onChange={() => onChange({ accountType: type })}
                  className="h-5 w-5 border-outline text-primary focus:ring-primary"
                />
                <span className="text-body-sm capitalize text-on-surface">{type}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-inset-sm border-t border-outline-variant pt-inset-md">
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave || isSubmitting}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-primary-container text-label-md font-semibold text-on-primary-container disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting…' : 'Submit application'}
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={isSubmitting}
            className="flex h-12 w-full items-center justify-center rounded-lg text-label-md font-semibold text-primary"
          >
            Skip for now
          </button>
        </div>

        <div className="flex items-start gap-inset-xs rounded bg-surface-container-low p-inset-sm text-on-surface-variant">
          <MaterialIcon name="lock" size={16} className="mt-0.5 shrink-0" />
          <p className="text-body-sm">
            Your banking information is securely encrypted and used solely for depositing your
            earnings.
          </p>
        </div>
      </form>
    </SectionCard>
  );
}
