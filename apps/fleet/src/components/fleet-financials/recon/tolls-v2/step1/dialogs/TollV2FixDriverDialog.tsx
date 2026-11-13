import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../../../ui/dialog';
import { Input } from '../../../../../ui/input';
import { api } from '../../../../../../services/api';
import { TollV2DangerOutlineButton, TollV2PrimaryButton } from '../../TollV2Buttons';
import type { TollV2ImportReportRow } from '../tollV2ImportTypes';

type DriverRow = {
  id: string;
  name: string;
  plate?: string;
  uberDriverId?: string;
};

export function TollV2FixDriverDialog({
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
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const uberId = String(problemRow?.driver_id ?? problemRow?.ref ?? '').trim();
  const uberName = String(problemRow?.driver_name ?? 'Uber driver').trim();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    void api
      .getDrivers()
      .then((list) => {
        const rows: DriverRow[] = (list ?? []).map((d: Record<string, unknown>) => ({
          id: String(d.id ?? d.driverId ?? ''),
          name: String(d.name ?? d.driverName ?? [d.firstName, d.lastName].filter(Boolean).join(' ')),
          plate: String(d.assignedVehiclePlate ?? d.plate ?? '').trim() || undefined,
          uberDriverId: d.uberDriverId ? String(d.uberDriverId) : undefined,
        }));
        setDrivers(rows.filter((d) => d.id));
      })
      .catch(() => toast.error('Could not load drivers'))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) => d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q));
  }, [drivers, search]);

  const save = async () => {
    if (!selected || !uberId) return;
    const driver = drivers.find((d) => d.id === selected);
    if (!driver) return;
    setBusy(true);
    try {
      await api.saveDriver({ ...driver, id: driver.id, uberDriverId: uberId });
      toast.success('Driver linked — upload the file again to read these rows');
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save driver');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Fix driver</DialogTitle>
        </DialogHeader>
        <div className="rounded-xl border border-[#e5eeff] bg-[#eff4ff]/50 p-3 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#47464c]">From the Uber file</p>
          <p className="mt-1 font-medium text-[#0b1c30]">{uberName || 'Unknown name'}</p>
          <p className="text-[#47464c]">Uber driver · Seen in this file</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-[#0b1c30]">Search your drivers</p>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name…" />
        </div>
        <p className="text-xs text-[#47464c]">Roam will remember this Uber driver for the driver you pick.</p>
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-6 text-[#47464c]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            filtered.map((d) => (
              <label
                key={d.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                  selected === d.id ? 'border-[#030213] bg-[#eff4ff]' : 'border-[#e5eeff]'
                }`}
              >
                <input
                  type="radio"
                  name="driver-pick"
                  checked={selected === d.id}
                  onChange={() => setSelected(d.id)}
                />
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d5e0f8] text-xs font-semibold">
                  {d.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{d.name}</span>
                  {d.plate ? (
                    <span className="mt-0.5 inline-block rounded bg-white px-1.5 text-xs text-[#47464c]">{d.plate}</span>
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
            This is the driver
          </TollV2PrimaryButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
