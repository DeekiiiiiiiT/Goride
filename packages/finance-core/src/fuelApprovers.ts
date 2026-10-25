const SECOND_APPROVE_ROLES = new Set([
  'fleet_owner',
  'fleet_manager',
  'fleet_accountant',
  'enterprise_owner',
  'enterprise_dispatcher',
  'enterprise_customs',
  'enterprise_warehouse',
  'enterprise_finance',
]);

/** Owner, manager, and accountant can second-approve. Viewers, drivers, and invites cannot. */
export function isFuelSecondApproverRole(roleName: string | null | undefined): boolean {
  return SECOND_APPROVE_ROLES.has(String(roleName || '').trim());
}

export function fuelApproverIds(input: {
  seats: Array<{ userId: string; role: string; status?: string | null }>;
  ownerId?: string | null;
}): string[] {
  const ids = new Set<string>();
  for (const seat of input.seats) {
    if (String(seat.status || 'active') === 'suspended') continue;
    if (!isFuelSecondApproverRole(seat.role)) continue;
    const id = String(seat.userId || '').trim();
    if (id) ids.add(id);
  }
  const ownerId = String(input.ownerId || '').trim();
  if (ownerId) ids.add(ownerId);
  return [...ids];
}
