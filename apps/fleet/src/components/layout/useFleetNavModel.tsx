import { Badge } from '../ui/badge';
import { useVocab } from '../../utils/vocabulary';
import { usePermissions } from '../../hooks/usePermissions';
import { useFeatureFlags } from '../auth/FeatureFlagContext';
import { useServiceLineScope } from '../../contexts/ServiceLineScopeContext';
import { buildFleetNavModel, type FleetNavModel } from './fleetNavModel';
import type { NavLeaf } from './nav/types';

export function NavNewBadge() {
  return (
    <Badge className="h-4 border-none bg-indigo-500 px-1 text-[8px] text-white">
      New
    </Badge>
  );
}

export function withNavBadge(item: NavLeaf): NavLeaf {
  if (!item.showNewBadge || item.badge) return item;
  return { ...item, badge: <NavNewBadge /> };
}

export function useFleetNavModel(): FleetNavModel {
  const { v, businessType } = useVocab();
  const { canView } = usePermissions();
  const { isModuleEnabled } = useFeatureFlags();
  const { serviceLines, rushVisible, rideshareVisible } = useServiceLineScope();

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
  });
}
