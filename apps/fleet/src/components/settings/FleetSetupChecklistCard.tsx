import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { useBusinessConfig } from '../auth/BusinessConfigContext';

const STORAGE_KEY = 'roam_fleet_setup_checklist';

type ChecklistItem = { id: string; label: string; lines: Array<'rideshare' | 'rush_delivery' | 'both'> };

const ITEMS: ChecklistItem[] = [
  { id: 'import-trips', label: 'Import first rideshare trip batch', lines: ['rideshare', 'both'] },
  { id: 'add-drivers', label: 'Add or invite drivers', lines: ['rideshare', 'both'] },
  { id: 'earnings-policy', label: 'Configure earnings policy', lines: ['rideshare', 'both', 'rush_delivery'] },
  { id: 'invite-courier', label: 'Create workforce invite for first courier', lines: ['rush_delivery', 'both'] },
  { id: 'assign-vehicles', label: 'Assign vehicles to drivers or couriers', lines: ['rideshare', 'rush_delivery', 'both'] },
  { id: 'scope-switcher', label: 'Confirm scope switcher filters reports (both-lines)', lines: ['both'] },
  { id: 'recon-week', label: 'Run one manual reconciliation week before settlement', lines: ['rush_delivery', 'both'] },
];

function loadDone(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveDone(done: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...done]));
  } catch {
    /* ignore */
  }
}

export function FleetSetupChecklistCard() {
  const { serviceLines } = useBusinessConfig();
  const [done, setDone] = useState<Set<string>>(() => loadDone());
  const [highlight, setHighlight] = useState(false);

  useEffect(() => {
    setDone(loadDone());
    if (localStorage.getItem('roam_fleet_show_checklist') === '1') {
      setHighlight(true);
      localStorage.removeItem('roam_fleet_show_checklist');
    }
  }, []);

  const shape = useMemo(() => {
    const hasRide = serviceLines.includes('rideshare');
    const hasRush = serviceLines.includes('rush_delivery');
    if (hasRide && hasRush) return 'both' as const;
    if (hasRush) return 'rush_delivery' as const;
    return 'rideshare' as const;
  }, [serviceLines]);

  const visible = ITEMS.filter((item) => item.lines.includes(shape));

  const toggle = (id: string) => {
    const next = new Set(done);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setDone(next);
    saveDone(next);
  };

  const completed = visible.filter((i) => done.has(i.id)).length;

  return (
    <Card className={highlight ? 'ring-2 ring-indigo-400 ring-offset-2' : undefined}>
      <CardHeader>
        <CardTitle>Setup checklist</CardTitle>
        <CardDescription>
          Day-one steps for your {shape === 'both' ? 'rideshare + delivery' : shape === 'rush_delivery' ? 'delivery' : 'rideshare'} fleet.
          {completed > 0 ? ` ${completed}/${visible.length} done.` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.map((item) => {
          const isDone = done.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => toggle(item.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"
            >
              {isDone ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="h-5 w-5 shrink-0 text-slate-400" />
              )}
              <span className={isDone ? 'text-slate-500 line-through' : 'text-slate-800 dark:text-slate-200'}>
                {item.label}
              </span>
            </button>
          );
        })}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => {
            setDone(new Set());
            saveDone(new Set());
          }}
        >
          Reset checklist
        </Button>
      </CardContent>
    </Card>
  );
}
