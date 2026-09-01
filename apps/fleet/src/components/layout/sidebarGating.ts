/** Pure sidebar visibility predicates — exported for tests and AppSidebar. */

export function canSeeCourierOps(input: {
  hasRushDeliveryLine: boolean;
  rushModuleEnabled: boolean;
  canViewAnyCourierPage: boolean;
}): boolean {
  return (
    input.hasRushDeliveryLine &&
    input.canViewAnyCourierPage &&
    input.rushModuleEnabled
  );
}

export function hasSharedOps(input: {
  rushVisible: boolean;
  rideshareVisible: boolean;
}): boolean {
  return input.rushVisible || input.rideshareVisible;
}

export function canSeeEarningsPolicy(input: {
  hasSharedOps: boolean;
  sidebarVisible: boolean;
  canView: boolean;
}): boolean {
  return input.hasSharedOps && input.sidebarVisible && input.canView;
}

export function rushModuleNavEnabled(
  isModuleEnabled: (key: string) => boolean,
): boolean {
  return (
    isModuleEnabled('rush_couriers') ||
    isModuleEnabled('rush_deliveries') ||
    isModuleEnabled('rush_courier_settlements') ||
    isModuleEnabled('rush_supply_health')
  );
}
