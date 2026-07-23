import React from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner@2.0.3';
import { api } from '../../services/api';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';
import { useVehicleOptions } from './expense-hub/useVehicleOptions';

/** Display label → storage category (Maintenance maps to ledger eventType maintenance). */
const EXPENSE_CATEGORIES: { value: string; label: string }[] = [
  { value: 'Other Expenses', label: 'Other Expenses' },
  { value: 'Maintenance', label: 'Other vehicle-related (not a service log)' },
  { value: 'Insurance', label: 'Insurance' },
  { value: 'Registration', label: 'Registration' },
  { value: 'Bank Charges', label: 'Bank Charges' },
  { value: 'Office Expenses', label: 'Office Expenses' },
  { value: 'Software/Subscription', label: 'Software/Subscription' },
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Vehicle Payment', label: 'Vehicle Payment' },
  { value: 'Supplier Payment', label: 'Supplier Payment' },
  { value: 'Tax Payment', label: 'Tax Payment' },
  { value: 'Cash Collection Fees', label: 'Cash Collection Fees' },
];

export function LogBusinessExpenseDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = React.useState<string>('Other Expenses');
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('Bank Transfer');
  const [vehicleId, setVehicleId] = React.useState<string>('');
  const [saving, setSaving] = React.useState(false);
  const { data: vehicleOptions = [] } = useVehicleOptions();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error('Enter a positive amount');
      return;
    }
    if (!description.trim()) {
      toast.error('Description is required');
      return;
    }
    setSaving(true);
    try {
      await api.saveTransaction({
        date,
        type: 'Expense',
        category: category as never,
        description: description.trim(),
        amount: numericAmount,
        paymentMethod: paymentMethod as never,
        status: 'Completed',
        isReconciled: true,
        ...(vehicleId ? { vehicleId } : {}),
      });
      toast.success('Expense posted to Business Finance');
      setAmount('');
      setDescription('');
      setVehicleId('');
      setCategory('Other Expenses');
      onOpenChange(false);
      onSaved();
    } catch (error) {
      console.error('[LogBusinessExpenseDialog] save failed', error);
      toast.error(error instanceof Error ? error.message : 'Failed to post expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Log business expense</DialogTitle>
          <DialogDescription>
            Posts a realized cost to the canonical ledger and Business Finance. Use Fixed Expenses for
            recurring schedules. Shop work (oil, tires, battery) → Fleet Maintenance → Log service —
            that posts to the books automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="business-expense-category">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger id="business-expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {category === 'Maintenance' ? (
                <p className="text-xs text-slate-500">
                  Prefer Fleet Maintenance → Log service for shop jobs so vehicle history and books stay in sync.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="business-expense-date">Date incurred / paid</Label>
              <Input
                id="business-expense-date"
                type="date"
                value={date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="business-expense-vehicle">Vehicle (optional)</Label>
            <Select
              value={vehicleId || '__none__'}
              onValueChange={(v) => setVehicleId(v === '__none__' ? '' : v)}
            >
              <SelectTrigger id="business-expense-vehicle">
                <SelectValue placeholder="No vehicle" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No vehicle</SelectItem>
                {vehicleOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="business-expense-amount">Amount (JMD)</Label>
              <Input
                id="business-expense-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business-expense-payment">Payment method</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger id="business-expense-payment">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['Bank Transfer', 'Cash', 'Credit Card', 'Digital Wallet', 'Check', 'Other'].map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="business-expense-description">Description</Label>
            <Textarea
              id="business-expense-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Post expense
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
