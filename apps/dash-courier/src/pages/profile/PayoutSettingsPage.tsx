import React, { useEffect, useState } from 'react';
import { MaterialIcon } from '@/components/icons/MaterialIcon';
import { SubPageHeader } from '@/components/layout/SubPageHeader';
import { fetchCourierBankAccount, saveCourierBankAccount } from '@/lib/courierApi';
import { toast } from '@/lib/toast';

type PayoutSettingsPageProps = {
  onBack: () => void;
  onViewHistory?: () => void;
};

export function PayoutSettingsPage({ onBack, onViewHistory }: PayoutSettingsPageProps) {
  const [busy, setBusy] = useState(false);
  const [bankName, setBankName] = useState('');
  const [branch, setBranch] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>('checking');
  const [savedLast4, setSavedLast4] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void fetchCourierBankAccount().then((account) => {
      if (!account) return;
      setBankName(account.bank_name || '');
      setBranch(account.branch || '');
      setAccountHolderName(account.account_holder_name || '');
      setSavedLast4(account.account_last4 || null);
      setAccountType(account.account_type === 'savings' ? 'savings' : 'checking');
      setReady(Boolean(account.is_verified));
    });
  }, []);

  const saveBank = async () => {
    setBusy(true);
    try {
      const words = await saveCourierBankAccount({
        bankName: bankName.trim(),
        branch: branch.trim(),
        accountHolderName: accountHolderName.trim(),
        accountNumber,
        accountType,
      });
      setSavedLast4(accountNumber.replace(/\D/g, '').slice(-4));
      setAccountNumber('');
      setReady(false);
      toast.success(words);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save the bank account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col overflow-hidden">
      <SubPageHeader title="Payout Settings" onBack={onBack} />

      <main className="flex-1 overflow-y-auto px-[var(--spacing-edge)] py-6 pb-8 max-w-2xl mx-auto w-full space-y-6">
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-on-background">Payout Method</h2>
          <div className="bg-surface rounded-xl p-4 shadow-soft border border-surface-variant space-y-3">
            <p className="text-sm text-on-surface-variant">
              {savedLast4
                ? `Account ending ${savedLast4}${ready ? ' is ready to be paid.' : ' is waiting for finance to mark it ready.'}`
                : 'Add the account Roam should pay. After you save, only the last four digits stay on this screen.'}
            </p>
            <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bank" className="w-full min-h-12 rounded-xl border border-outline px-3" />
            <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Branch" className="w-full min-h-12 rounded-xl border border-outline px-3" />
            <input value={accountHolderName} onChange={(e) => setAccountHolderName(e.target.value)} placeholder="Name on the account" className="w-full min-h-12 rounded-xl border border-outline px-3" />
            <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" type="password" className="w-full min-h-12 rounded-xl border border-outline px-3" />
            <div className="flex gap-2">
              {(['checking', 'savings'] as const).map((type) => (
                <button key={type} type="button" onClick={() => setAccountType(type)} className={`flex-1 min-h-12 rounded-xl border ${accountType === type ? 'border-primary text-primary' : 'border-outline'}`}>
                  {type === 'checking' ? 'Chequing' : 'Savings'}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveBank()}
              className="w-full min-h-12 rounded-xl bg-primary text-on-primary font-semibold disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save bank account'}
            </button>
          </div>
        </section>

        <section className="space-y-3">
          {onViewHistory && (
            <button
              type="button"
              onClick={onViewHistory}
              className="w-full min-h-12 rounded-xl text-primary font-medium"
            >
              View payout history
            </button>
          )}
        </section>

        <div className="flex items-start gap-2 text-sm text-muted">
          <MaterialIcon name="info" className="text-base shrink-0 mt-0.5" />
          <p>Weekly pay is a bank file. An account that is not ready waits until the next week.</p>
        </div>
      </main>
    </div>
  );
}
