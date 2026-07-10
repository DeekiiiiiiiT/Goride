/**
 * Toll class picker — options from Super Admin Toll Info vehicleClasses.
 */
import React, { useEffect, useState } from 'react';
import { Label } from '../ui/label';
import { api } from '../../services/api';
import { listVehicleClassesFromStore, migrateToVersionedStore } from '../../utils/officialTollRate';
import type { TollVehicleClassDef } from '../../types/tollRateSchedule';
import { cn } from '../ui/utils';

interface TollClassPickerProps {
  value?: string;
  onChange: (classId: string) => void;
  required?: boolean;
  className?: string;
  /** When true, show needs-review hint. */
  needsReview?: boolean;
}

export function TollClassPicker({
  value,
  onChange,
  required,
  className,
  needsReview,
}: TollClassPickerProps) {
  const [classes, setClasses] = useState<TollVehicleClassDef[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await api.getTollInfo();
        const store = migrateToVersionedStore(raw);
        if (!cancelled) setClasses(listVehicleClassesFromStore(store));
      } catch {
        if (!cancelled) setClasses(listVehicleClassesFromStore(null));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs font-medium uppercase text-slate-500">
        Toll class{required ? ' *' : ''}
      </Label>
      <select
        className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
        value={value || ''}
        disabled={loading}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{loading ? 'Loading…' : 'Select class…'}</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label} — {c.examples}
          </option>
        ))}
      </select>
      {needsReview && (
        <p className="text-[11px] text-amber-700">Confirm toll class (defaulted to Class 1).</p>
      )}
      <p className="text-[11px] text-slate-500">
        From Super Admin Toll Info classifications. Used for official rate lookup.
      </p>
    </div>
  );
}
