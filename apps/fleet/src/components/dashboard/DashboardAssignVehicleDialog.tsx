import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';

export type AssignableVehicleOption = {
  id: string;
  label: string;
  licensePlate: string;
  image?: string;
  currentDriverName?: string;
  parked?: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  driverName: string;
  vehicles: AssignableVehicleOption[];
  currentVehicleId?: string;
  busy?: boolean;
  onConfirm: (vehicleId: string) => void;
};

export function DashboardAssignVehicleDialog({
  open,
  onOpenChange,
  driverName,
  vehicles,
  currentVehicleId,
  busy,
  onConfirm,
}: Props) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter((v) => {
      const hay = `${v.label} ${v.licensePlate} ${v.currentDriverName || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [vehicles, query]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery('');
      setSelectedId(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign vehicle</DialogTitle>
          <DialogDescription>
            Choose a vehicle for {driverName.trim() || 'this driver'}.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plate, make, or model…"
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-72 overflow-y-auto rounded-md border border-slate-200 divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <p className="p-4 text-sm text-slate-500 text-center">No matching vehicles.</p>
          ) : (
            filtered.map((v) => {
              const selected = selectedId === v.id;
              const isCurrent = currentVehicleId === v.id;
              const disabled = Boolean(v.parked);
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={disabled || busy}
                  onClick={() => setSelectedId(v.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors',
                    disabled
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:bg-slate-50 cursor-pointer',
                    selected && 'bg-indigo-50/70',
                  )}
                >
                  <div className="h-10 w-16 rounded-md overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                    {v.image ? (
                      <img src={v.image} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900 truncate">{v.label}</p>
                    <p className="text-xs text-slate-500 font-mono">{v.licensePlate || '—'}</p>
                    {v.parked ? (
                      <p className="text-xs text-amber-700">Pending catalog — cannot assign</p>
                    ) : v.currentDriverName && !isCurrent ? (
                      <p className="text-xs text-slate-400 truncate">
                        Currently: {v.currentDriverName}
                      </p>
                    ) : isCurrent ? (
                      <p className="text-xs text-emerald-600">Currently assigned</p>
                    ) : (
                      <p className="text-xs text-slate-400">Available</p>
                    )}
                  </div>
                  {selected ? <Check className="h-4 w-4 text-indigo-600 flex-shrink-0" /> : null}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => selectedId && onConfirm(selectedId)}
            disabled={!selectedId || selectedId === currentVehicleId || busy}
          >
            {busy ? 'Saving…' : 'Assign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
