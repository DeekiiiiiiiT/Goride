import { Badge } from '../ui/badge';
import { useVocab } from '../../utils/vocabulary';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeatureFlags } from '../auth/FeatureFlagContext';
import { useServiceLineScope } from '../../contexts/ServiceLineScopeContext';
import { buildFleetNavModel, type FleetNavModel } from './fleetNavModel';
import type { NavLeaf } from './nav/types';
import { useFuelReviewQueueCounts } from '../../hooks/useFuelReviewQueueCounts';
import { useInventoryPhase2Enabled } from '../../hooks/useInventoryPhase2Flag';
import { useReconV2 } from '../../hooks/useReconV2';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../utils/supabase/client';

export function NavNewBadge() {
  return (
    <Badge className="h-4 border-none bg-indigo-500 px-1 text-[8px] text-white">
      New
    </Badge>
  );
}

export function NavCountBadge({ count }: { count: number }) {
  if (!(count > 0)) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <Badge className="h-5 min-w-5 border-none bg-slate-900 px-1.5 text-[10px] font-semibold tabular-nums text-white">
      {label}
    </Badge>
  );
}

export function withNavBadge(item: NavLeaf): NavLeaf {
  if (item.badgeCount != null && item.badgeCount > 0) {
    return { ...item, badge: <NavCountBadge count={item.badgeCount} /> };
  }
  if (!item.showNewBadge || item.badge) return item;
  return { ...item, badge: <NavNewBadge /> };
}

export function useFleetNavModel(): FleetNavModel {
  const { v, businessType } = useVocab();
  const { canView } = usePermissions();
  const { isModuleEnabled } = useFeatureFlags();
  const { serviceLines, rushVisible, rideshareVisible } = useServiceLineScope();
  const canSeeReviewQueue =
    isModuleEnabled('fuelManagement') && canView('fuel-reimbursements');
  const { data: queueCounts } = useFuelReviewQueueCounts(canSeeReviewQueue);
  const inventoryPhase2Enabled = useInventoryPhase2Enabled();
  const reconV2Enabled = useReconV2() === true;
  const tollV2Q = useQuery({
    queryKey: ['toll-v2-enabled'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('toll_v2_enabled');
      if (error) throw error;
      return data === true;
    },
    staleTime: 60_000,
    retry: false,
  });

  return buildFleetNavModel({
    canView,
    isModuleEnabled,
    businessType,
    serviceLines,
    rushVisible,
    rideshareVisible,
    labels: {
      dashboardTitle: v('dashboardTitle'),
      drivers: v('drivers'),
      vehiclesPageTitle: v('vehiclesPageTitle'),
    },
    reviewQueueCount: queueCounts?.total ?? 0,
    unattributedFuelCount: queueCounts?.unattributedFuelCount ?? 0,
    inventoryPhase2Enabled,
    reconV2Enabled,
    tollV2Enabled: tollV2Q.data === true,
  });
}
