import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import type { OrgPayoutAccount } from '../../types/orgBilling';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { cn } from '../ui/utils';

export function PayoutTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountHolderName, setAccountHolderName] = useState('');
  const [accountType, setAccountType] = useState<'checking' | 'savings'>('checking');
  const [accountNumber, setAccountNumber] = useState('');
  const [isDefault, setIsDefault] = useState(true);

  const listQuery = useQuery({
    queryKey: ['org-payout-accounts'],
    queryFn: () => api.getOrgPayoutAccounts(),
    staleTime: 15_000,
  });

  const accounts = listQuery.data?.data ?? [];

  const createMut = useMutation({
    mutationFn: () =>
      api.createOrgPayoutAccount({
        bankName: bankName.trim(),
        accountHolderName: accountHolderName.trim(),
        accountType,
        accountNumber: accountNumber.replace(/\D/g, ''),
        isDefault,
      }),
    onSuccess: async () => {
      toast.success('Bank account saved');
      setOpen(false);
      setBankName('');
      setAccountHolderName('');
      setAccountNumber('');
      await qc.invalidateQueries({ queryKey: ['org-payout-accounts'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save account'),
  });

  const patchMut = useMutation({
    mutationFn: (id: string) => api.patchOrgPayoutAccount(id, { isDefault: true }),
    onSuccess: async () => {
      toast.success('Default payout account updated');
      await qc.invalidateQueries({ queryKey: ['org-payout-accounts'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Update failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteOrgPayoutAccount(id),
    onSuccess: async () => {
      toast.success('Bank account removed');
      await qc.invalidateQueries({ queryKey: ['org-payout-accounts'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Remove failed'),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        Roam will deposit period payouts here once org payout is live. Deposits are not enabled yet.
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Bank accounts for Roam period deposits (JMD).
        </p>
        <Button type="button" className="min-h-11" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add bank account
        </Button>
      </div>

      {listQuery.isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Could not load payout accounts.
        </div>
      ) : null}

      {listQuery.isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-600">
          No bank accounts yet. Add one for future Roam deposits.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {accounts.map((a) => (
            <AccountCard
              key={a.id}
              account={a}
              onMakeDefault={() => patchMut.mutate(a.id)}
              onRemove={() => {
                if (confirm('Remove this bank account?')) deleteMut.mutate(a.id);
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add bank account</DialogTitle>
            <DialogDescription>
              Account number is used once to save the last four digits — full number is not stored.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Bank name</Label>
              <Input
                className="min-h-11"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Sagicor Bank Jamaica"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Account holder</Label>
              <Input
                className="min-h-11"
                value={accountHolderName}
                onChange={(e) => setAccountHolderName(e.target.value)}
                placeholder="Fleet company name"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Account type</Label>
              <Select
                value={accountType}
                onValueChange={(v) => setAccountType(v as 'checking' | 'savings')}
              >
                <SelectTrigger className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Checking</SelectItem>
                  <SelectItem value="savings">Savings</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Account number</Label>
              <Input
                className="min-h-11"
                inputMode="numeric"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 34))}
                placeholder="Digits only"
              />
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              Set as default
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                !bankName.trim() ||
                !accountHolderName.trim() ||
                accountNumber.replace(/\D/g, '').length < 4 ||
                createMut.isPending
              }
              onClick={() => createMut.mutate()}
            >
              Save account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountCard({
  account,
  onMakeDefault,
  onRemove,
}: {
  account: OrgPayoutAccount;
  onMakeDefault: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-700 dark:bg-slate-900',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            {account.bankName}
            {account.isDefault ? (
              <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Default
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-slate-500">{account.accountHolderName}</p>
          <p className="mt-3 font-mono text-base text-slate-800 dark:text-slate-100">
            ••••••••{account.accountLast4}
          </p>
          <p className="mt-1 text-xs capitalize text-slate-500">
            {account.accountType} · {account.currency || 'JMD'}
          </p>
        </div>
        <Building2 className="h-6 w-6 text-slate-400" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!account.isDefault ? (
          <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={onMakeDefault}>
            Make default
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={onRemove}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Remove
        </Button>
      </div>
    </div>
  );
}
