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

const EXPENSE_CATEGORIES = [
  'Maintenance',
  'Insurance',
  'Registration',
  'Bank Charges',
  'Office Expenses',
  'Software/Subscription',
  'Marketing',
  'Vehicle Payment',
  'Supplier Payment',
  'Tax Payment',
  'Cash Collection Fees',
  'Other Expenses',
] as const;

export function LogBusinessExpenseDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = React.useState<string>('Maintenance');
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = React.useState('');
  const [paymentMethod, setPaymentMethod] = React.useState('Bank Transfer');
  const [saving, setSaving] = React.useState(false);

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
      });
      toast.success('Expense posted to Business Finance');
      setAmount('');
      setDescription('');
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
            Posts a realized cost to the canonical ledger and Business Finance. Use Fixed Expenses for recurring schedules.
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
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              placeholder="e.g. Front brake pads and labor"
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Post expense
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
