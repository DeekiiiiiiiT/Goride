import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Armchair,
  Bed,
  CookingPot,
  Monitor,
  Package,
  Refrigerator,
  Server,
  Sofa,
  Tv,
  Utensils,
  WashingMachine,
} from 'lucide-react';

const ICON_MAP: Record<string, LucideIcon> = {
  refrigerator: Refrigerator,
  sofa: Sofa,
  monitor: Monitor,
  package: Package,
  'cooking-pot': CookingPot,
  'washing-machine': WashingMachine,
  utensils: Utensils,
  bed: Bed,
  armchair: Armchair,
  server: Server,
  tv: Tv,
};

export function HaulageIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Package;
  return <Icon className={className} strokeWidth={1.65} aria-hidden />;
}
