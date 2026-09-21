import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs';
import { cn } from '../ui/utils';
import { useFuelServiceLine } from '../../contexts/FuelServiceLineContext';
import { fuelLineTabLabel, type FuelLineTab } from '../../utils/fuelServiceLineFilter';

type CountMap = Partial<Record<FuelLineTab, number>>;

type Props = {
  /** Optional per-tab counts (All / Rideshare / Delivery). */
  counts?: CountMap;
  className?: string;
};

/**
 * Dashboard-identical slate pills for Fuel Management.
 * Renders only when org has both rideshare + Delivery (rush_delivery).
 */
export function FuelServiceLineTabs({ counts, className }: Props) {
  const { line, setLine, showTabs } = useFuelServiceLine();
  if (!showTabs) return null;

  const tabs: FuelLineTab[] = ['all', 'rideshare', 'delivery'];

  return (
    <Tabs
      value={line}
      onValueChange={(v) => {
        if (v === 'delivery' || v === 'rideshare' || v === 'all') setLine(v);
      }}
      className={cn('w-full', className)}
    >
      <TabsList
        className={cn(
          'h-10 rounded-lg bg-slate-100 p-1 dark:bg-slate-800',
          'max-md:grid max-md:w-full max-md:grid-cols-3',
        )}
      >
        {tabs.map((t) => {
          const n = counts?.[t];
          const label = fuelLineTabLabel(t);
          return (
            <TabsTrigger key={t} value={t} className="rounded-md px-4 max-md:w-full">
              {label}
              {typeof n === 'number' ? (
                <span className="ml-1.5 text-xs font-normal text-slate-500 tabular-nums">({n})</span>
              ) : null}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
