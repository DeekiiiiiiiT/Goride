import React, { useEffect, useState } from 'react';
import { Car, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../../ui/dialog';
import { api } from '../../../../../../services/api';
import { TollV2DangerOutlineButton, TollV2PrimaryButton } from '../../TollV2Buttons';
import type { TollV2ImportReportRow } from '../tollV2ImportTypes';
import { normalizePlateAlias } from '../tollV2ImportReportFormat';

type VehicleRow = {
  id: string;
  make?: string;
  model?: string;
  plate?: string;
  plateAliases?: string[];
};

export function TollV2WhichCarDialog({
  open,
  onOpenChange,
  problemRow,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  problemRow: TollV2ImportReportRow | null;
  onSaved: () => void;
}) {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const filePlate = normalizePlateAlias(String(problemRow?.ref ?? problemRow?.plate ?? '').trim() || 'Unknown plate');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void api
      .getVehicles()
      .then((list) => {
        const rows: VehicleRow[] = (list ?? []).map((v: Record<string, unknown>) => ({
          id: String(v.id ?? ''),
          make: v.make ? String(v.make) : undefined,
          model: v.model ? String(v.model) : undefined,
          plate: String(v.licensePlate ?? v.plate ?? '').trim() || undefined,
          plateAliases: Array.isArray(v.plateAliases)
            ? (v.plateAliases as string[])
            : Array.isArray(v.plate_aliases)
              ? (v.plate_aliases as string[])
              : [],
        }));
        setVehicles(rows.filter((v) => v.id));
      })
      .catch(() => toast.error('Could not load vehicles'))
      .finally(() => setLoading(false));
  }, [open]);

  const save = async () => {
    if (!selected || !filePlate) return;
    const vehicle = vehicles.find((v) => v.id === selected);
    if (!vehicle) return;
    const aliases = new Set([...(vehicle.plateAliases ?? []).map(normalizePlateAlias), filePlate]);
    setBusy(true);
    try {
      await api.saveVehicle({
        id: vehicle.id,
        plateAliases: [...aliases],
      });
      toast.success('Plate saved — upload the file again to read these rows');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save vehicle');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Which car is this?</DialogTitle>
        </DialogHeader>
        <div className="rounded-xl border border-[#e5eeff] bg-[#eff4ff]/50 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#47464c]">From the Uber file</p>
          <p className="mt-1 font-medium text-[#0b1c30]">{filePlate}</p>
          <p className="text-[#47464c]">Seen on trips this week</p>
        </div>
        <p className="text-xs text-[#47464c]">Roam will remember this plate for this car.</p>
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6 text-[#47464c]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            vehicles.map((v) => (
              <label
                key={v.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                  selected === v.id ? 'border-[#030213] bg-[#eff4ff]' : 'border-[#e5eeff]'
                }`}
              >
                <input
                  type="radio"
                  name="vehicle-pick"
                  checked={selected === v.id}
                  onChange={() => setSelected(v.id)}
                />
                <Car className="h-5 w-5 text-[#47464c]" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {[v.make, v.model].filter(Boolean).join(' ') || 'Vehicle'}
                  </span>
                  {v.plate ? (
                    <span className="mt-0.5 inline-block rounded bg-white px-1.5 text-xs text-[#47464c]">{v.plate}</span>
                  ) : null}
                </span>
              </label>
            ))
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <TollV2DangerOutlineButton type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </TollV2DangerOutlineButton>
          <TollV2PrimaryButton type="button" disabled={!selected || busy} onClick={() => void save()}>
            Use this car
          </TollV2PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
