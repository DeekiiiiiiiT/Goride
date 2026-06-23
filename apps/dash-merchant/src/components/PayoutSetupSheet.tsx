import { useState } from 'react';
import { toast } from 'sonner';
import { JAMAICAN_BANKS } from '../signup/types';
import { MaterialIcon } from '../signup/components/MaterialIcon';
import { saveBankAccount } from '../lib/partner-api';
import type { MerchantBankAccountInput } from '@roam/types';

const fieldClass =
  'h-12 w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-inset-sm text-body-lg text-on-surface placeholder:text-on-surface-variant/50 partner-field';

interface PayoutSetupSheetProps {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function PayoutSetupSheet({ open, onClose, onSaved }: PayoutSetupSheetProps) {
  const [bankName, setBankName] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>('checking');
  const [isSaving, setIsSaving] = useState(false);

  if (!open) return null;

  const canSave =
    bankName !== '' &&
    accountHolderName.trim().length >= 2 &&
    accountNumber.trim().length >= 4;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const input: MerchantBankAccountInput = {
        bankName,
        accountHolderName: accountHolderName.trim(),
        accountNumber: accountNumber.trim(),
        routingNumber: routingNumber.trim(),
        accountType,
      };
      await saveBankAccount(input);
      toast.success('Payout details saved');
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save payout details');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="partner-modal-fade fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface shadow-lg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payout-setup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-outline-variant px-inset-md py-inset-sm">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary-container/15">
            <MaterialIcon name="account_balance" className="text-primary" />
          </div>
          <h2 id="payout-setup-title" className="text-headline-md font-semibold text-on-surface">
            Set up payouts
          </h2>
          <p className="mt-1 text-body-sm text-on-surface-variant">
            You received your first order — add where we should send your earnings.
          </p>
        </div>

        <form
          className="flex flex-col gap-inset-md overflow-y-auto p-inset-md"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          <div className="flex flex-col gap-inset-base">
            <label className="text-label-md font-semibold text-on-surface" htmlFor="payout-bank">
              Bank name
            </label>
            <div className="relative">
              <select
                id="payout-bank"
                className={`${fieldClass} cursor-pointer appearance-none`}
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
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
            <label className="text-label-md font-semibold text-on-surface" htmlFor="payout-holder">
              Account holder name
            </label>
            <input
              id="payout-holder"
              type="text"
              className={fieldClass}
              placeholder="e.g., Jane Doe or Business Name"
              value={accountHolderName}
              onChange={(e) => setAccountHolderName(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-inset-base">
            <label className="text-label-md font-semibold text-on-surface" htmlFor="payout-account">
              Account number
            </label>
            <input
              id="payout-account"
              type="password"
              className={fieldClass}
              placeholder="Enter account number"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-inset-base">
            <label className="text-label-md font-semibold text-on-surface" htmlFor="payout-routing">
              Routing number
            </label>
            <input
              id="payout-routing"
              type="text"
              className={fieldClass}
              placeholder="9 digit routing number"
              value={routingNumber}
              onChange={(e) => setRoutingNumber(e.target.value)}
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
                    name="payoutAccountType"
                    value={type}
                    checked={accountType === type}
                    onChange={() => setAccountType(type)}
                    className="h-5 w-5 border-outline text-primary focus:ring-primary"
                  />
                  <span className="text-body-sm capitalize text-on-surface">{type}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-start gap-inset-xs rounded bg-surface-container-low p-inset-sm text-on-surface-variant">
            <MaterialIcon name="lock" size={16} className="mt-0.5 shrink-0" />
            <p className="text-body-sm">
              Your banking information is securely encrypted and used solely for depositing your
              earnings.
            </p>
          </div>
        </form>

        <div className="flex flex-col gap-inset-sm border-t border-outline-variant p-inset-md">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave || isSaving}
            className="flex h-12 w-full items-center justify-center rounded-lg bg-primary-container text-label-md font-semibold text-on-primary-container disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? 'Saving…' : 'Save payout details'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex h-12 w-full items-center justify-center rounded-lg text-label-md font-semibold text-primary"
          >
            Set up later
          </button>
        </div>
      </div>
    </div>
  );
}
