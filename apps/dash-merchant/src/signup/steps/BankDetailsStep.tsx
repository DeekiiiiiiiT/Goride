import { JAMAICAN_BANKS, SignUpFormData } from '../types';
import { MaterialIcon } from '../components/MaterialIcon';

interface BankDetailsStepProps {
  data: SignUpFormData;
  onChange: (patch: Partial<SignUpFormData>) => void;
  onSave: () => void;
  onSkip: () => void;
  isSubmitting?: boolean;
}

const fieldClass =
  'h-inset-xl w-full rounded border border-outline-variant bg-surface-container-lowest px-inset-sm text-body-lg text-on-surface placeholder:text-on-surface-variant/50 partner-field';

export default function BankDetailsStep({ data, onChange, onSave, onSkip, isSubmitting = false }: BankDetailsStepProps) {
  const canSave =
    data.bankName !== '' &&
    data.accountHolderName.trim().length >= 2 &&
    data.accountNumber.trim().length >= 4;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-on-background">
      <header className="mx-auto flex h-16 w-full items-center justify-between border-b border-outline-variant bg-surface px-margin-mobile shadow-sm">
        <div className="flex items-center gap-2">
          <MaterialIcon name="storefront" className="text-primary" size={24} />
          <span className="text-headline-md font-semibold text-primary">Roam Dash Merchant</span>
        </div>
      </header>

      <main className="flex flex-grow flex-col items-center px-margin-mobile pb-24 pt-8 md:px-margin-tablet md:pt-16">
        <div className="w-full max-w-md rounded-lg border border-outline-variant bg-surface-container-lowest p-inset-md shadow-[0px_4px_12px_rgba(0,0,0,0.05)]">
          <div className="mb-inset-lg">
            <h1 className="mb-inset-xs text-headline-lg-mobile font-bold text-on-surface md:text-headline-lg">
              Set up payouts
            </h1>
            <p className="text-body-sm text-on-surface-variant">Where should we send your earnings?</p>
          </div>

          <form className="space-y-inset-md" onSubmit={(e) => e.preventDefault()}>
            <div className="flex flex-col gap-inset-base">
              <label className="text-label-md font-semibold text-on-surface" htmlFor="bankName">
                Bank Name
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
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-inset-sm text-on-surface-variant">
                  <MaterialIcon name="expand_more" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-inset-base">
              <label className="text-label-md font-semibold text-on-surface" htmlFor="accountHolder">
                Account Holder Name
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
                Account Number
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
                Routing Number
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

            <div className="flex flex-col gap-inset-xs pt-inset-xs">
              <span className="mb-inset-base text-label-md font-semibold text-on-surface">Account Type</span>
              <div className="flex gap-gutter">
                {(['checking', 'savings'] as const).map((type) => (
                  <label
                    key={type}
                    className="flex flex-1 cursor-pointer items-center gap-inset-xs rounded border border-outline-variant bg-surface-container-low p-inset-sm transition-colors hover:bg-surface-container"
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

            <div className="mt-inset-lg flex flex-col gap-inset-sm border-t border-outline-variant pt-inset-md">
              <button
                type="button"
                onClick={onSave}
                disabled={!canSave || isSubmitting}
                className="flex h-inset-xl w-full items-center justify-center rounded-full bg-primary-container text-label-md font-semibold text-on-primary-container shadow-sm transition-colors duration-150 hover:bg-primary-fixed active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSubmitting ? 'Submitting…' : 'Save & Continue'}
              </button>
              <button
                type="button"
                onClick={onSkip}
                disabled={isSubmitting}
                className="flex h-inset-xl w-full items-center justify-center rounded-full bg-transparent text-label-md font-semibold text-primary transition-colors hover:bg-surface-container-low"
              >
                Skip for now
              </button>
            </div>
          </form>

          <div className="mt-inset-lg flex items-start gap-inset-xs rounded bg-surface-container-low p-inset-sm text-on-surface-variant">
            <MaterialIcon name="lock" size={16} className="mt-0.5 shrink-0" />
            <p className="text-body-sm">
              Your banking information is securely encrypted and used solely for depositing your
              earnings.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
