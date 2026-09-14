import { Badge } from '../ui/badge';
import { useVocab } from '../../utils/vocabulary';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeatureFlags } from '../auth/FeatureFlagContext';
import { useServiceLineScope } from '../../contexts/ServiceLineScopeContext';
import { buildFleetNavModel, type FleetNavModel } from './fleetNavModel';
import type { NavLeaf } from './nav/types';
import { useFuelReviewQueueCounts } from '../../hooks/useFuelReviewQueueCounts';

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
      sidebarTrips: v('sidebarTrips'),
    },
    reviewQueueCount: queueCounts?.total ?? 0,
  });
}
