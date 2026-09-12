import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../services/api';
import type { OrgPaymentMethod } from '../../types/orgBilling';
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

const BRANDS = ['Visa', 'Mastercard', 'Amex', 'Other'] as const;

export function PaymentMethodsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState<string>('Visa');
  const [last4, setLast4] = useState('');
  const [expMonth, setExpMonth] = useState('12');
  const [expYear, setExpYear] = useState(String(new Date().getFullYear() + 2));
  const [nickname, setNickname] = useState('');
  const [isDefault, setIsDefault] = useState(true);

  const listQuery = useQuery({
    queryKey: ['org-payment-methods'],
    queryFn: () => api.getOrgPaymentMethods(),
    staleTime: 15_000,
  });

  const methods = listQuery.data?.data ?? [];

  const createMut = useMutation({
    mutationFn: () =>
      api.createOrgPaymentMethod({
        brand,
        last4: last4.replace(/\D/g, '').slice(-4),
        expMonth: Number(expMonth),
        expYear: Number(expYear),
        nickname: nickname.trim() || undefined,
        isDefault,
      }),
    onSuccess: async () => {
      toast.success('Card saved');
      setOpen(false);
      setLast4('');
      setNickname('');
      await qc.invalidateQueries({ queryKey: ['org-payment-methods'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Could not save card'),
  });

  const patchMut = useMutation({
    mutationFn: (id: string) => api.patchOrgPaymentMethod(id, { isDefault: true }),
    onSuccess: async () => {
      toast.success('Default card updated');
      await qc.invalidateQueries({ queryKey: ['org-payment-methods'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Update failed'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteOrgPaymentMethod(id),
    onSuccess: async () => {
      toast.success('Card removed');
      await qc.invalidateQueries({ queryKey: ['org-payment-methods'] });
    },
    onError: (e: Error) => toast.error(e.message || 'Remove failed'),
  });

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return Array.from({ length: 16 }, (_, i) => String(y + i));
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
        Roam will use this card to collect unsettled debt and load Roam Cash once billing goes live
        (WiPay). Charging is not enabled yet.
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Debit or credit cards on file for this fleet.
        </p>
        <Button type="button" className="min-h-11" onClick={() => setOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add card
        </Button>
      </div>

      {listQuery.isError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Could not load payment methods.
        </div>
      ) : null}

      {listQuery.isLoading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : methods.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-5 py-10 text-center text-sm text-slate-500 dark:border-slate-600">
          No cards yet. Add a card to prepare for Roam billing.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {methods.map((m) => (
            <MethodCard
              key={m.id}
              method={m}
              onMakeDefault={() => patchMut.mutate(m.id)}
              onRemove={() => {
                if (confirm('Remove this card?')) deleteMut.mutate(m.id);
              }}
            />
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add card</DialogTitle>
            <DialogDescription>
              Enter last four digits only — never a full card number. WiPay vault comes later.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1.5">
              <Label>Brand</Label>
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BRANDS.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Last 4 digits</Label>
              <Input
                className="min-h-11"
                inputMode="numeric"
                maxLength={4}
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="1234"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Exp month</Label>
                <Select value={expMonth} onValueChange={setExpMonth}>
                  <SelectTrigger className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((m) => (
                      <SelectItem key={m} value={m}>
                        {m.padStart(2, '0')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Exp year</Label>
                <Select value={expYear} onValueChange={setExpYear}>
                  <SelectTrigger className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Nickname (optional)</Label>
              <Input
                className="min-h-11"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Fleet ops card"
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
              disabled={last4.length !== 4 || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Save card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MethodCard({
  method,
  onMakeDefault,
  onRemove,
}: {
  method: OrgPaymentMethod;
  onMakeDefault: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl px-5 py-4 text-white shadow-sm',
        method.brand.toLowerCase().includes('visa')
          ? 'bg-slate-800'
          : method.brand.toLowerCase().includes('master')
            ? 'bg-indigo-950'
            : 'bg-slate-700',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium opacity-90">
            {method.nickname || method.brand}
            {method.isDefault ? (
              <span className="ml-2 rounded bg-white/20 px-1.5 py-0.5 text-[10px] uppercase">
                Default
              </span>
            ) : null}
          </p>
          <p className="mt-3 font-mono text-lg tracking-widest">•••• {method.last4}</p>
          <p className="mt-1 text-xs opacity-80">
            Exp {String(method.expMonth).padStart(2, '0')}/{method.expYear}
          </p>
        </div>
        <CreditCard className="h-6 w-6 opacity-80" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {!method.isDefault ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="min-h-11 bg-white/15 text-white hover:bg-white/25"
            onClick={onMakeDefault}
          >
            Make default
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="min-h-11 bg-white/15 text-white hover:bg-white/25"
          onClick={onRemove}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Remove
        </Button>
      </div>
    </div>
  );
}
