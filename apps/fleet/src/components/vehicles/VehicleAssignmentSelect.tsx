/**
 * Inline driver/courier picker for the Fleet Vehicles assignment column.
 * Value "unassigned" clears currentDriverId; otherwise assigns that fleet person.
 */
import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Loader2 } from 'lucide-react';
import { cn } from '../ui/utils';

export type AssignmentDriverOption = {
  id: string;
  name: string;
};

type VehicleAssignmentSelectProps = {
  valueDriverId?: string | null;
  valueDriverName?: string | null;
  drivers: AssignmentDriverOption[];
  disabled?: boolean;
  busy?: boolean;
  /** "Driver" | "Courier" — placeholder copy only */
  personLabel?: string;
  className?: string;
  onChange: (nextDriverId: string | null) => void;
};

const UNASSIGNED = 'unassigned';

export function VehicleAssignmentSelect({
  valueDriverId,
  valueDriverName,
  drivers,
  disabled,
  busy,
  personLabel = 'Driver',
  className,
  onChange,
}: VehicleAssignmentSelectProps) {
  const selectedId = valueDriverId?.trim() ? valueDriverId : UNASSIGNED;

  // Keep current assignee visible even if they fall outside the filtered roster.
  const options = (() => {
    if (selectedId === UNASSIGNED) return drivers;
    if (drivers.some((d) => d.id === selectedId)) return drivers;
    return [
      {
        id: selectedId,
        name: valueDriverName?.trim() || 'Assigned driver',
      },
      ...drivers,
    ];
  })();

  return (
    <div
      className={cn('relative min-w-[10rem] max-w-[16rem]', className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Select
        value={selectedId}
        disabled={disabled || busy}
        onValueChange={(next) => {
          if (next === selectedId) return;
          onChange(next === UNASSIGNED ? null : next);
        }}
      >
        <SelectTrigger
          className={cn(
            'h-9 w-full border-slate-200 bg-white text-left text-sm font-medium',
            selectedId === UNASSIGNED ? 'text-slate-400' : 'uppercase text-slate-700',
          )}
          aria-label={`Assign ${personLabel.toLowerCase()}`}
        >
          {busy ? (
            <span className="flex items-center gap-2 text-slate-500 normal-case">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Saving…
            </span>
          ) : (
            <SelectValue placeholder={`Select ${personLabel.toLowerCase()}`} />
          )}
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={UNASSIGNED} className="text-slate-500">
            Unassigned
          </SelectItem>
          {options.map((d) => (
            <SelectItem key={d.id} value={d.id}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default VehicleAssignmentSelect;
