import React, { useState } from 'react';
import { Car, Package, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';
import { toast } from 'sonner';
import { useBusinessConfig } from '../auth/BusinessConfigContext';
import { api } from '../../services/api';

type ServiceLine = 'rideshare' | 'rush_delivery';

const LINE_META: Record<ServiceLine, { label: string; description: string; icon: typeof Car }> = {
  rideshare: {
    label: 'Rideshare',
    description: 'Uber-style driver trips, imports, and settlements.',
    icon: Car,
  },
  rush_delivery: {
    label: 'Deliveries',
    description: 'Couriers, live delivery revenue, and weekly settlement.',
    icon: Package,
  },
};

export function ServiceLinesSettingsCard() {
  const { serviceLines, refreshConfig } = useBusinessConfig();
  const [draft, setDraft] = useState<ServiceLine[]>(serviceLines);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    setDraft(serviceLines);
  }, [serviceLines]);

  const toggleLine = (line: ServiceLine, on: boolean) => {
    setDraft((prev) => {
      if (on) return prev.includes(line) ? prev : [...prev, line];
      const next = prev.filter((l) => l !== line);
      return next.length ? next : prev;
    });
  };

  const deliveryIncluded = draft.includes('rush_delivery');

  const handleSave = async () => {
    if (draft.length === 0) {
      toast.error('Keep at least one service line enabled.');
      return;
    }
    setSaving(true);
    try {
      await api.updateOrgServiceLines(draft);
      await refreshConfig?.();
      toast.success('Service lines updated.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save service lines.');
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    draft.length !== serviceLines.length ||
    draft.some((l) => !serviceLines.includes(l));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Service lines</CardTitle>
        <CardDescription>
          Run rideshare, deliveries, or both from one portal. Removing a line hides nav only — your data stays.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(Object.keys(LINE_META) as ServiceLine[]).map((line) => {
          const meta = LINE_META[line];
          const Icon = meta.icon;
          const enabled = draft.includes(line);
          const isRush = line === 'rush_delivery';
          return (
            <div
              key={line}
              className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800"
            >
              <div className="flex gap-3">
                <div className="mt-0.5 rounded-md bg-slate-100 p-2 dark:bg-slate-800">
                  <Icon className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{meta.label}</p>
                    {isRush && deliveryIncluded && (
                      <Badge variant="secondary" className="text-xs">
                        Delivery included
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{meta.description}</p>
                  {isRush && (
                    <p className="mt-2 text-xs text-slate-400">
                      Roam approves couriers; you nominate and upload docs. Features roll out gradually during pilot.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id={`line-${line}`}
                  checked={enabled}
                  onCheckedChange={(v) => toggleLine(line, v)}
                  disabled={enabled && draft.length === 1}
                />
                <Label htmlFor={`line-${line}`} className="sr-only">
                  {meta.label}
                </Label>
              </div>
            </div>
          );
        })}
        <Button onClick={handleSave} disabled={!dirty || saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save service lines
        </Button>
      </CardContent>
    </Card>
  );
}
