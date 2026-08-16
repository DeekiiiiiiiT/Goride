import React from 'react';
import type { CourierComplianceBlocker } from '@roam/types/courier';
import { BLOCKER_LABELS } from '../utils/complianceLabels';

export function BlockerChips({ blockers }: { blockers: CourierComplianceBlocker[] }) {
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

export function ComplianceChecklist({ blockers }: { blockers: CourierComplianceBlocker[] }) {
  const items: CourierComplianceBlocker[] = [
    'onboarding_incomplete',
    'background_check_not_approved',
    'license_missing',
    'vehicle_missing',
    'insurance_missing',
  ];
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((key) => {
        const blocked = blockers.includes(key);
        return (
          <li key={key} className={blocked ? 'text-amber-200' : 'text-emerald-300'}>
            {blocked ? '○' : '●'} {BLOCKER_LABELS[key]}
          </li>
        );
      })}
    </ul>
  );
}
