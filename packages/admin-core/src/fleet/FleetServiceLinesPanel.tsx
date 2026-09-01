import React, { useEffect, useState } from 'react';
import { Car, Loader2, Package } from 'lucide-react';
import { toast } from 'sonner';
import { patchOrgServiceLines, type FleetRushRolloutApiConfig } from './fleetRushRolloutService';

type ServiceLine = 'rideshare' | 'rush_delivery';

const LINE_META: Record<ServiceLine, { label: string; description: string; icon: typeof Car }> = {
  rideshare: {
    label: 'Rideshare',
    description: 'Driver trips, imports, and settlements.',
    icon: Car,
  },
  rush_delivery: {
    label: 'Deliveries',
    description: 'Couriers, delivery revenue, and settlement.',
    icon: Package,
  },
};

export type FleetServiceLinesPanelProps = {
  orgId: string;
  serviceLines: string[];
  canEdit?: boolean;
  apiConfig: FleetRushRolloutApiConfig;
  onUpdated?: () => void;
};

export function FleetServiceLinesPanel({
  orgId,
  serviceLines,
  canEdit = false,
  apiConfig,
  onUpdated,
}: FleetServiceLinesPanelProps) {
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
    if (!canEdit) return;
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
    if (!canEdit || !dirty) return;
    setSaving(true);
    try {
      await patchOrgServiceLines(apiConfig, orgId, draft);
      toast.success('Service lines updated');
      onUpdated?.();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not save service lines');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900/40">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Service lines</h3>
      <p className="mt-1 text-xs text-slate-500">
        Entitlement for rideshare and deliveries. Rush modules sync automatically when delivery is on.
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
              disabled={!canEdit || (on && draft.length === 1)}
              onClick={() => toggle(line)}
              className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                on
                  ? 'border-amber-500/40 bg-amber-500/5'
                  : 'border-slate-200 dark:border-slate-700'
              } ${canEdit ? 'hover:border-slate-300' : 'cursor-default opacity-90'}`}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{meta.label}</p>
                <p className="text-xs text-slate-500">{meta.description}</p>
              </div>
              <span
                className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                  on ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {on ? 'On' : 'Off'}
              </span>
            </button>
          );
        })}
      </div>
      {canEdit && (
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-black hover:bg-amber-400 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save service lines
        </button>
      )}
    </div>
  );
}
