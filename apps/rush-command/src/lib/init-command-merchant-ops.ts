import {
  configureMerchantOpsAuth,
  hasDeviceSession,
  setKioskContextResolver,
} from '@roam/merchant-ops';
import { refreshCommandSessionIfNeeded, supabase } from './command-supabase';
import { isTabletEntryPath } from './storeTabletUrl';

let configured = false;

export function initCommandMerchantOps() {
  if (configured) return;
  configured = true;

  setKioskContextResolver(() => isTabletEntryPath() || hasDeviceSession());

  configureMerchantOpsAuth({
    getSupabase: () => supabase,
    refreshSessionIfNeeded: refreshCommandSessionIfNeeded,
    isKioskContext: () => isTabletEntryPath() || hasDeviceSession(),
  });
}
