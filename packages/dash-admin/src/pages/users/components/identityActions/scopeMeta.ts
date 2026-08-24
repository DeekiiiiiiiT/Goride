import type { LucideIcon } from 'lucide-react';
import { Bike, ShieldAlert, Store, User } from 'lucide-react';
import type { IdentityActionApp, IdentityActionEmptyReason, IdentityActionScope } from './types';

export const PERSONA_SCOPE_META: Record<
  IdentityActionApp,
  { title: string; shortLabel: string; Icon: LucideIcon }
> = {
  customer: { title: 'CUSTOMER APP', shortLabel: 'Customer', Icon: User },
  courier: { title: 'COURIER APP', shortLabel: 'Courier', Icon: Bike },
  merchant: { title: 'MERCHANT APP', shortLabel: 'Merchant', Icon: Store },
};

export const GLOBAL_SCOPE_META = {
  title: 'GLOBAL · all apps',
  shortLabel: 'Global',
  Icon: ShieldAlert,
} as const;

/** Map directory persona / detail tab scope → which persona app is primary (if any). */
export function primaryAppForScope(scope: IdentityActionScope): IdentityActionApp | null {
  switch (scope) {
    case 'customer':
      return 'customer';
    case 'courier':
      return 'courier';
    case 'merchant_owner':
    case 'merchant_staff':
      return 'merchant';
    default:
      return null;
  }
}

export function emptyReasonMessage(reason: IdentityActionEmptyReason): string {
  switch (reason) {
    case 'no_permission':
      return "You don't have permission to manage this person";
    case 'no_manageable_personas':
      return 'This person has no manageable apps';
    case 'no_detail':
      return 'No actions available';
    default:
      return 'No actions available';
  }
}
