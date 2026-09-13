import React, { useEffect, useState } from 'react';
import { Car, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { patchFleetOrgServiceLines } from './fleetAdminService';

type ServiceLine = 'rideshare' | 'rush_delivery';

const LINE_META: Record<ServiceLine, { label: string; description: string; icon: typeof Car }> = {
  rideshare: {
    label: 'Rideshare',
    description: 'Drivers, trips, and settlements.',
    icon: Car,
  },
  rush_delivery: {
    label: 'Delivery (Roam Rush)',
    description: 'Couriers, deliveries, and courier settlement.',
    icon: Package,
  },
};

type Props = {
  accessToken: string;
  orgId: string;
  customerEmail: string;
  serviceLines: string[];
  onSaved: () => void;
  onClose: () => void;
};

export function FleetAdminServiceLinesModal({
  accessToken,
  orgId,
  customerEmail,
  serviceLines,
  onSaved,
  onClose,
}: Props) {
  const [draft, setDraft] = useState<ServiceLine[]>(
    serviceLines.filter((l): l is ServiceLine => l === 'rideshare' || l === 'rush_delivery'),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(
      serviceLines.filter((l): l is ServiceLine => l === 'rideshare' || l === 'rush_delivery'),
    );
  }, [serviceLines]);

  const toggle = (line: ServiceLine) => {
    setDraft((prev) => {
      if (prev.includes(line)) {
        const next = prev.filter((l) => l !== line);
        return next.length ? next : prev;
      }
      return [...prev, line];
    });
  };

  const dirty =
    draft.length !== serviceLines.length || draft.some((l) => !serviceLines.includes(l));

  const save = async () => {
    if (!dirty || draft.length === 0) return;
    setSaving(true);
    try {
      await patchFleetOrgServiceLines(accessToken, orgId, draft);
      toast.success('Platforms updated');
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not save platforms');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Fleet platforms</h3>
        <p className="mt-1 text-sm text-slate-400">
          Add or remove platforms for <strong className="text-slate-200">{customerEmail}</strong>.
          Removing a line hides that product area for the fleet.
        </p>
        <div className="mt-4 space-y-2">
          {(Object.keys(LINE_META) as ServiceLine[]).map((line) => {
            const meta = LINE_META[line];
            const Icon = meta.icon;
            const on = draft.includes(line);
            return (
              <button
                key={line}
                type="button"
                disabled={on && draft.length === 1}
                onClick={() => toggle(line)}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  on
                    ? 'border-amber-500/40 bg-amber-500/5'
                    : 'border-slate-700 hover:border-slate-600'
                }`}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-100">{meta.label}</p>
                  <p className="text-xs text-slate-500">{meta.description}</p>
                </div>
                <span
                  className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                    on ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {on ? 'On' : 'Off'}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={!dirty || saving}
            className="bg-amber-600 hover:bg-amber-500"
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save platforms
          </Button>
        </div>
      </div>
    </div>
  );
}
