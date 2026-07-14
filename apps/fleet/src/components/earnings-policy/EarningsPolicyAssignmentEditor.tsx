import React, { useEffect, useMemo, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import type {
  EarningsPolicy,
  EarningsPolicyDriverAssignment,
  EarningsPolicyVersion,
} from '../../types/earningsPolicy';
import {
  mondayYmdForDate,
  upcomingMondayOptions,
  upsertDriverAssignment,
} from '../../utils/earningsPolicyVersion';
import { nextMondayYmd } from '../../utils/fuelPolicyVersion';
import { useFleetTimezone } from '../../utils/timezoneDisplay';
import { toast } from 'sonner@2.0.3';
import { Search } from 'lucide-react';

function driverDisplayName(d: any): string {
  return d?.name || [d?.firstName, d?.lastName].filter(Boolean).join(' ') || 'Driver';
}

/** Assign or edit one driver’s Monday window on a frozen version. */
export function EarningsPolicyAssignmentEditor({
  isOpen,
  onClose,
  onSave,
  policy,
  allPolicies,
  version,
  editingAssignment,
  drivers,
  vehicles,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (policy: EarningsPolicy) => Promise<void>;
  policy: EarningsPolicy;
  allPolicies: EarningsPolicy[];
  version: EarningsPolicyVersion;
  editingAssignment: EarningsPolicyDriverAssignment | null;
  drivers: any[];
  vehicles: any[];
}) {
  const fleetTz = useFleetTimezone();
  const [driverId, setDriverId] = useState('');
  const [effectiveFromMonday, setEffectiveFromMonday] = useState('');
  const [effectiveUntilMonday, setEffectiveUntilMonday] = useState<string>('__never__');
  const [search, setSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const thisMonday = useMemo(
    () => mondayYmdForDate(new Date(), fleetTz || undefined),
    [fleetTz],
  );
  const nextMonday = useMemo(
    () => nextMondayYmd(new Date(), fleetTz || undefined),
    [fleetTz],
  );
  const weekOptions = useMemo(
    () => upcomingMondayOptions(16, fleetTz || undefined),
    [fleetTz],
  );
  const untilOptions = useMemo(
    () => weekOptions.filter((o) => !effectiveFromMonday || o.value > effectiveFromMonday),
    [weekOptions, effectiveFromMonday],
  );

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    if (editingAssignment) {
      setDriverId(editingAssignment.driverId);
      setEffectiveFromMonday(editingAssignment.effectiveFrom);
      setEffectiveUntilMonday(editingAssignment.effectiveUntil || '__never__');
    } else {
      setDriverId('');
      setEffectiveFromMonday(nextMondayYmd(new Date(), fleetTz || undefined));
      setEffectiveUntilMonday('__never__');
    }
  }, [isOpen, editingAssignment, fleetTz]);

  useEffect(() => {
    if (
      effectiveUntilMonday !== '__never__' &&
      effectiveFromMonday &&
      effectiveUntilMonday <= effectiveFromMonday
    ) {
      setEffectiveUntilMonday('__never__');
    }
  }, [effectiveFromMonday, effectiveUntilMonday]);

  const plateFor = (id: string) => {
    const v = vehicles.find((x: any) => x.currentDriverId === id);
    return v?.licensePlate || v?.plate || '';
  };

  const assignedIds = useMemo(
    () => new Set((version.assignments || []).map((a) => a.driverId)),
    [version.assignments],
  );

  const filteredDrivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter((d) => {
      // When adding, hide drivers already on this version; when editing, only show current
      if (editingAssignment) return d.id === editingAssignment.driverId;
      if (assignedIds.has(d.id)) return false;
      if (!q) return true;
      const name = driverDisplayName(d).toLowerCase();
      const plate = plateFor(d.id).toLowerCase();
      return name.includes(q) || plate.includes(q);
    });
  }, [drivers, search, vehicles, assignedIds, editingAssignment]);

  const handleSubmit = async () => {
    if (!driverId || !effectiveFromMonday) return;
    setIsSubmitting(true);
    try {
      const next = upsertDriverAssignment({
        policy,
        allPolicies,
        versionId: version.id,
        driverId,
        effectiveFromMonday,
        effectiveUntilMonday:
          effectiveUntilMonday === '__never__' ? null : effectiveUntilMonday,
        isEdit: !!editingAssignment,
      });
      await onSave(next);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save assignment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        <div className="shrink-0 px-6 pt-6 pb-3 border-b border-slate-100">
          <DialogHeader>
            <DialogTitle>{editingAssignment ? 'Edit driver period' : 'Assign driver'}</DialogTitle>
            <DialogDescription>
              Each driver gets their own start Monday on this version (hire / move onto plan). Same
              driver cannot overlap another assignment anywhere.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
          {!editingAssignment && (
            <div className="space-y-2">
              <Label>Driver</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  className="pl-9"
                  placeholder="Search drivers…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 divide-y">
                {filteredDrivers.length === 0 ? (
                  <p className="p-3 text-xs text-slate-400">No drivers available.</p>
                ) : (
                  filteredDrivers.map((d) => {
                    const plate = plateFor(d.id);
                    const selected = driverId === d.id;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={`w-full text-left flex items-center gap-3 px-3 py-2 hover:bg-slate-50 ${
                          selected ? 'bg-indigo-50' : ''
                        }`}
                        onClick={() => setDriverId(d.id)}
                      >
                        <span
                          className={`h-3.5 w-3.5 rounded-full border ${
                            selected ? 'border-indigo-600 bg-indigo-600' : 'border-slate-300'
                          }`}
                        />
                        <span className="text-sm text-slate-800 flex-1 min-w-0 truncate">
                          {driverDisplayName(d)}
                          {plate ? <span className="text-slate-400"> · {plate}</span> : null}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {editingAssignment && (
            <p className="text-sm text-slate-700">
              <span className="font-medium">
                {driverDisplayName(drivers.find((d) => d.id === editingAssignment.driverId) || {})}
              </span>
            </p>
          )}

          <div className="space-y-2">
            <Label>Starts (week starting Monday)</Label>
            <Select value={effectiveFromMonday} onValueChange={setEffectiveFromMonday}>
              <SelectTrigger>
                <SelectValue placeholder="Select start week" />
              </SelectTrigger>
              <SelectContent>
                {weekOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                    {o.value === thisMonday ? ' (this week)' : ''}
                    {o.value === nextMonday ? ' (next week)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Ends (week starting Monday)</Label>
            <Select value={effectiveUntilMonday} onValueChange={setEffectiveUntilMonday}>
              <SelectTrigger>
                <SelectValue placeholder="Never (default)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__never__">Never (default)</SelectItem>
                {untilOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-slate-500">
              Ending Monday is exclusive. Leave Never for open-ended.
            </p>
          </div>
        </div>

        <DialogFooter className="shrink-0 px-6 py-4 border-t border-slate-100 gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !driverId || !effectiveFromMonday}
          >
            {isSubmitting ? 'Saving…' : editingAssignment ? 'Save' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
