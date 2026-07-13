import React, { useMemo, useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';
import { Loader2, Search } from 'lucide-react';

export interface AssignDriverRow {
  id: string;
  name: string;
  vehicleLabel: string;
  currentPolicyLabel: string;
  /** True when already on this target policy */
  alreadyAssigned: boolean;
}

interface AssignDriversToPolicySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  policyName: string;
  isDefaultPolicy: boolean;
  drivers: AssignDriverRow[];
  onConfirm: (driverIds: string[]) => Promise<void>;
}

export function AssignDriversToPolicySheet({
  open,
  onOpenChange,
  policyName,
  isDefaultPolicy,
  drivers,
  onConfirm,
}: AssignDriversToPolicySheetProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelected(new Set(drivers.filter((d) => d.alreadyAssigned).map((d) => d.id)));
  }, [open, drivers]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter(
      (d) =>
        d.name.toLowerCase().includes(q) ||
        d.vehicleLabel.toLowerCase().includes(q) ||
        d.currentPolicyLabel.toLowerCase().includes(q),
    );
  }, [drivers, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm(Array.from(selected));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Assign drivers to {policyName}</SheetTitle>
          <SheetDescription>
            {isDefaultPolicy
              ? 'Selected drivers will use the Default policy (custom assignment cleared).'
              : 'Drivers moved here leave the Default (or other) policy.'}
          </SheetDescription>
        </SheetHeader>

        <div className="relative mt-4">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Search name or plate…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="mt-3 flex-1 space-y-1 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No drivers match.</p>
          ) : (
            filtered.map((d) => (
              <label
                key={d.id}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 px-3 py-2.5 hover:bg-slate-50"
              >
                <Checkbox checked={selected.has(d.id)} onCheckedChange={() => toggle(d.id)} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{d.name}</div>
                  <div className="truncate text-xs text-slate-500">{d.vehicleLabel}</div>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px] font-normal">
                  {d.currentPolicyLabel}
                </Badge>
              </label>
            ))
          )}
        </div>

        <SheetFooter className="mt-4 gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Confirm assign
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** @deprecated Use AssignDriversToPolicySheet */
export const AssignVehiclesToPolicySheet = AssignDriversToPolicySheet;
export type AssignVehicleRow = AssignDriverRow;
