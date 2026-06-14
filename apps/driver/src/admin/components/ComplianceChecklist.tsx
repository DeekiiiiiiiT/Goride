import React from 'react';
import { Check, X } from 'lucide-react';
import type { DriverComplianceBlocker } from '@roam/types/driver';
import { BLOCKER_LABELS } from '../utils/complianceLabels';

const CHECKLIST_ITEMS: Array<{
  blocker: DriverComplianceBlocker;
  label: string;
}> = [
  { blocker: 'no_profile', label: 'Driver profile created' },
  { blocker: 'onboarding_incomplete', label: 'Onboarding complete' },
  { blocker: 'background_check_not_approved', label: 'Background check approved' },
  { blocker: 'insurance_missing', label: 'Insurance on file' },
  { blocker: 'vehicle_missing', label: 'Vehicle registered' },
];

type Props = {
  blockers: DriverComplianceBlocker[];
  mode?: string;
  compact?: boolean;
};

export function ComplianceChecklist({ blockers, mode, compact }: Props) {
  const items = CHECKLIST_ITEMS.filter((item) => {
    if (mode === 'fleet' && (item.blocker === 'insurance_missing' || item.blocker === 'vehicle_missing')) {
      return false;
    }
    return true;
  });

  return (
    <ul className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {items.map((item) => {
        const failed = blockers.includes(item.blocker);
        return (
          <li key={item.blocker} className="flex items-center gap-2 text-sm">
            {failed ? (
              <X className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className={failed ? 'text-slate-300' : 'text-slate-400'}>{item.label}</span>
          </li>
        );
      })}
      {blockers.includes('account_suspended') && (
        <li className="flex items-center gap-2 text-sm text-amber-300">
          <X className="w-4 h-4 shrink-0" />
          {BLOCKER_LABELS.account_suspended}
        </li>
      )}
      {blockers.includes('account_deactivated') && (
        <li className="flex items-center gap-2 text-sm text-amber-300">
          <X className="w-4 h-4 shrink-0" />
          {BLOCKER_LABELS.account_deactivated}
        </li>
      )}
    </ul>
  );
}

export function BlockerChips({ blockers }: { blockers: DriverComplianceBlocker[] }) {
  if (!blockers.length) {
    return (
      <span className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
        Ready
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {blockers.map((b) => (
        <span
          key={b}
          className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium border border-amber-500/30 bg-amber-500/10 text-amber-200"
        >
          {BLOCKER_LABELS[b]}
        </span>
      ))}
    </div>
  );
}
