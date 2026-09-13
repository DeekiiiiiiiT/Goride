import React from 'react';
import { Car, Package } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { useBusinessConfig } from '../auth/BusinessConfigContext';

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

/** Read-only — Roam staff add/remove platforms via roamfleet.co/admin. */
export function ServiceLinesSettingsCard() {
  const { serviceLines } = useBusinessConfig();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your platforms</CardTitle>
        <CardDescription>
          Platforms enabled for this fleet. Contact Roam to add or remove Rideshare or Delivery
          (Roam Rush).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {(Object.keys(LINE_META) as ServiceLine[]).map((line) => {
          const meta = LINE_META[line];
          const Icon = meta.icon;
          const enabled = serviceLines.includes(line);
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
                    <Badge variant={enabled ? 'secondary' : 'outline'} className="text-xs">
                      {enabled ? 'Enabled' : 'Not enabled'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{meta.description}</p>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
