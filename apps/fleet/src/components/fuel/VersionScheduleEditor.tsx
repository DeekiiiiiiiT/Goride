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
import { Checkbox } from '../ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { FuelCoverageMatrix } from './FuelCoverageMatrix';
import type { FuelScenario, FuelScenarioVersion } from '../../types/fuel';
import {
  mondayYmdForDate,
  nextMondayYmd,
  upcomingMondayOptions,
  upsertPolicyVersion,
} from '../../utils/fuelPolicyVersion';
import { useFleetTimezone } from '../../utils/timezoneDisplay';
import { toast } from 'sonner@2.0.3';
import { Search } from 'lucide-react';

function driverDisplayName(d: any): string {
  return d?.name || [d?.firstName, d?.lastName].filter(Boolean).join(' ') || 'Driver';
}

export function VersionScheduleEditor({
  isOpen,
  onClose,
  onSave,
  scenario,
  allScenarios,
  editingVersion,
  drivers,
  vehicles,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (scenario: FuelScenario) => Promise<void>;
  scenario: FuelScenario;
  allScenarios: FuelScenario[];
  editingVersion: FuelScenarioVersion | null;
  drivers: any[];
  vehicles: any[];
}) {
  const fleetTz = useFleetTimezone();
  const [effectiveFromMonday, setEffectiveFromMonday] = useState('');
  const [effectiveUntilMonday, setEffectiveUntilMonday] = useState<string>('__never__');
  const [selectedDrivers, setSelectedDrivers] = useState<Set<string>>(new Set());
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
  const weekOptions = useMemo(() => {
    // Include editing version's start so past schedules remain selectable; else this Monday forward
    const earliest =
      editingVersion?.effectiveFrom &&
      editingVersion.effectiveFrom !== '2000-01-03' &&
      editingVersion.effectiveFrom < thisMonday
        ? editingVersion.effectiveFrom
        : thisMonday;
    return upcomingMondayOptions(16, fleetTz || undefined, new Date(), earliest);
  }, [fleetTz, thisMonday, editingVersion?.effectiveFrom]);
  const untilOptions = useMemo(
    () => weekOptions.filter((o) => !effectiveFromMonday || o.value > effectiveFromMonday),
    [weekOptions, effectiveFromMonday],
  );

  const templateRule = scenario.rules?.find((r) => r.category === 'Fuel');
  const displayRule =
    editingVersion?.rules?.find((r) => r.category === 'Fuel') || templateRule;

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    if (editingVersion) {
      setEffectiveFromMonday(editingVersion.effectiveFrom);
      setEffectiveUntilMonday(editingVersion.effectiveUntil || '__never__');
      setSelectedDrivers(new Set(editingVersion.driverIds || []));
    } else {
      setEffectiveFromMonday(nextMondayYmd(new Date(), fleetTz || undefined));
      setEffectiveUntilMonday('__never__');
      setSelectedDrivers(new Set());
    }
  }, [isOpen, editingVersion, fleetTz]);

  useEffect(() => {
    if (
      effectiveUntilMonday !== '__never__' &&
      effectiveFromMonday &&
      effectiveUntilMonday <= effectiveFromMonday
    ) {
      setEffectiveUntilMonday('__never__');
    }
  }, [effectiveFromMonday, effectiveUntilMonday]);

  const plateFor = (driverId: string) => {
    const v = vehicles.find((x: any) => x.currentDriverId === driverId);
    return v?.licensePlate || v?.plate || '';
  };

  const filteredDrivers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) => {
      const name = driverDisplayName(d).toLowerCase();
      const plate = plateFor(d.id).toLowerCase();
      return name.includes(q) || plate.includes(q);
    });
  }, [drivers, search, vehicles]);

  const toggleDriver = (id: string) => {
    setSelectedDrivers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!effectiveFromMonday) return;
    setIsSubmitting(true);
    try {
      const next = upsertPolicyVersion({
        scenario,
        allScenarios,
        versionId: editingVersion?.id,
        effectiveFromMonday,
        effectiveUntilMonday:
          effectiveUntilMonday === '__never__' ? null : effectiveUntilMonday,
        driverIds: Array.from(selectedDrivers),
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
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        <div className="shrink-0 px-6 pt-6 pb-3 border-b border-slate-100">
          <DialogHeader>
            <DialogTitle>{editingVersion ? 'Edit version' : 'Add version'}</DialogTitle>
            <DialogDescription>
              Set the Monday period and drivers for this policy. Splits are frozen from the Rules
              template (read-only here).
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
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
              Ending Monday is exclusive. Leave Never for open-ended. Same dates can be used for
              different drivers; the same driver cannot overlap another version.
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-slate-500">Coverage (from Rules — not editable)</Label>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <FuelCoverageMatrix rule={displayRule} compact />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Drivers on this version</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                className="pl-9"
                placeholder="Search drivers…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 divide-y">
              {filteredDrivers.length === 0 ? (
                <p className="p-3 text-xs text-slate-400">No drivers found.</p>
              ) : (
                filteredDrivers.map((d) => {
                  const plate = plateFor(d.id);
                  const checked = selectedDrivers.has(d.id);
                  return (
                    <label
                      key={d.id}
                      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleDriver(d.id)}
                      />
                      <span className="text-sm text-slate-800 flex-1 min-w-0 truncate">
                        {driverDisplayName(d)}
                        {plate ? (
                          <span className="text-slate-400"> · {plate}</span>
                        ) : null}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-xs text-slate-500">
              {selectedDrivers.size} selected. Drivers with no version anywhere use Default.
            </p>
          </div>
        </div>

        <DialogFooter className="shrink-0 px-6 py-4 border-t border-slate-100 gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !effectiveFromMonday}>
            {isSubmitting ? 'Saving…' : editingVersion ? 'Save version' : 'Add version'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
