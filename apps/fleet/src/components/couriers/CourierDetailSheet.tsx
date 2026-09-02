import type { CourierComplianceBlocker } from '@roam/types/courier';
import { AlertTriangle, Package, X } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../ui/sheet';
import type { CourierProfile } from './CouriersPage';

const BLOCKER_LABELS: Record<CourierComplianceBlocker, string> = {
  no_profile: 'No courier profile',
  onboarding_incomplete: 'Onboarding incomplete',
  background_check_not_approved: 'Background check not approved',
  license_missing: 'Driver license missing',
  vehicle_missing: 'Vehicle not registered',
  insurance_missing: 'Insurance missing',
  account_suspended: 'Account suspended',
  account_deactivated: 'Account deactivated',
};

const BLOCKER_WHY: Partial<Record<CourierComplianceBlocker, string>> = {
  onboarding_incomplete: 'Courier must finish onboarding in the Roam Rush Courier app.',
  background_check_not_approved: 'Roam must approve the background check before deliveries.',
  license_missing: 'A valid license document is required.',
  vehicle_missing: 'Courier must add a vehicle in the app.',
  insurance_missing: 'Proof of insurance is required.',
  account_suspended: 'This account is suspended — contact Roam support.',
  account_deactivated: 'This account is deactivated.',
};

export function CourierDetailSheet({
  courier,
  open,
  onOpenChange,
}: {
  courier: CourierProfile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!courier) return null;

  const blockers = courier.complianceBlockers ?? [];
  const canWork = blockers.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-indigo-600" />
            {courier.name}
          </SheetTitle>
          <SheetDescription>
            Courier workforce profile — compliance is read-only. Roam approves couriers before they can go online.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-500">Status</p>
              <Badge variant={courier.status === 'Active' ? 'default' : 'secondary'} className="mt-1">
                {courier.status}
              </Badge>
            </div>
            <div>
              <p className="text-slate-500">Deliveries</p>
              <p className="mt-1 font-medium tabular-nums">{courier.totalDeliveries ?? '—'}</p>
            </div>
            <div>
              <p className="text-slate-500">Phone</p>
              <p className="mt-1">{courier.phone ?? '—'}</p>
            </div>
            <div>
              <p className="text-slate-500">Email</p>
              <p className="mt-1 break-all">{courier.email ?? '—'}</p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex items-center gap-2">
              {canWork ? (
                <Badge className="bg-emerald-600">Can work</Badge>
              ) : (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Cannot work yet
                </Badge>
              )}
            </div>

            {blockers.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {blockers.map((b) => (
                  <li key={b} className="rounded-lg bg-amber-50 px-3 py-2 text-sm dark:bg-amber-500/10">
                    <p className="font-medium text-amber-900 dark:text-amber-200">
                      {BLOCKER_LABELS[b] ?? b}
                    </p>
                    {BLOCKER_WHY[b] && (
                      <p className="mt-0.5 text-amber-800/80 dark:text-amber-200/80">{BLOCKER_WHY[b]}</p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                No compliance blockers on record. Courier may still need Roam platform approval before going online.
              </p>
            )}

            <p className="mt-4 text-xs text-slate-500">
              Fleet owners cannot approve couriers here — Roam reviews documents and compliance centrally.
            </p>
          </div>

          <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            <X className="mr-2 h-4 w-4" />
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
