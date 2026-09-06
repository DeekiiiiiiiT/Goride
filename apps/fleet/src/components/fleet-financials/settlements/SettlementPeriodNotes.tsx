/**
 * Local period notes until a server notes table exists.
 * Key: org-agnostic `driverId|periodAnchor`.
 */
import React, { useEffect, useState } from 'react';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';

const STORAGE_PREFIX = 'settlement-period-notes:';

export function periodNotesStorageKey(driverId: string, periodAnchor: string): string {
  return `${STORAGE_PREFIX}${driverId}|${periodAnchor}`;
}

export type SettlementPeriodNotesProps = {
  driverId: string;
  periodAnchor: string;
  className?: string;
};

export function SettlementPeriodNotes({
  driverId,
  periodAnchor,
  className,
}: SettlementPeriodNotesProps) {
  const key = periodNotesStorageKey(driverId, periodAnchor);
  const [value, setValue] = useState('');

  useEffect(() => {
    try {
      setValue(localStorage.getItem(key) || '');
    } catch {
      setValue('');
    }
  }, [key]);

  const onChange = (next: string) => {
    setValue(next);
    try {
      if (next.trim()) localStorage.setItem(key, next);
      else localStorage.removeItem(key);
    } catch {
      /* ignore quota / private mode */
    }
  };

  if (!driverId || !periodAnchor) return null;

  return (
    <div className={className ?? 'space-y-1.5'}>
      <Label className="text-xs text-slate-500" htmlFor={`period-notes-${key}`}>
        Period notes (this device)
      </Label>
      <Textarea
        id={`period-notes-${key}`}
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Internal notes for this driver week…"
        className="text-sm"
      />
    </div>
  );
}
