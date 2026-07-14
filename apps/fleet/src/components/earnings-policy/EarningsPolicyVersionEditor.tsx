import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { EarningsPolicyCardPreview } from './EarningsPolicyCardPreview';
import type { EarningsPolicy, EarningsPolicyVersion } from '../../types/earningsPolicy';
import { upsertPolicyVersion } from '../../utils/earningsPolicyVersion';
import { toast } from 'sonner@2.0.3';

/** Create or rename a frozen version (content only — no dates/drivers). */
export function EarningsPolicyVersionEditor({
  isOpen,
  onClose,
  onSave,
  policy,
  editingVersion,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (policy: EarningsPolicy) => Promise<void>;
  policy: EarningsPolicy;
  editingVersion: EarningsPolicyVersion | null;
}) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const displayBundle = editingVersion
    ? {
        ...policy,
        tiers: editingVersion.tiers,
        quotas: editingVersion.quotas,
        personalAllowance: editingVersion.personalAllowance,
      }
    : policy;

  useEffect(() => {
    if (!isOpen) return;
    setName(editingVersion?.name || '');
  }, [isOpen, editingVersion]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const next = upsertPolicyVersion({
        policy,
        versionId: editingVersion?.id,
        name: name.trim() || null,
      });
      await onSave(next);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save version');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editingVersion ? 'Rename version' : 'Add version'}</DialogTitle>
          <DialogDescription>
            {editingVersion
              ? 'Optional label only. Frozen rules stay as they were when this version was created.'
              : 'Freezes today’s Rules (tiers, quotas, personal allowance). Assign drivers with their own start Mondays after.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="version-name">Name (optional)</Label>
            <Input
              id="version-name"
              placeholder='e.g. "Launch ladder"'
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500">
              {editingVersion ? 'Frozen snapshot (read-only)' : 'Will freeze from Rules'}
            </Label>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <EarningsPolicyCardPreview policy={displayBundle} compact />
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : editingVersion ? 'Save' : 'Add version'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
