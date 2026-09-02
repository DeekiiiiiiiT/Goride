/**
 * Shared step icon map for Consumption Reconciliation landing + wizard.
 */
import {
  AlertTriangle,
  ClipboardList,
  Droplets,
  Flag,
  Scale,
  Shield,
  type LucideIcon,
} from 'lucide-react';
import type { FuelStepId } from './fuelPeriodGating';

export const FUEL_STEP_ICONS: Record<FuelStepId, LucideIcon> = {
  'data-quality': AlertTriangle,
  'adjustments-disputes': Scale,
  'policy-check': Shield,
  'leakage-gap': Droplets,
  'settlement-preview': ClipboardList,
  finalize: Flag,
};
