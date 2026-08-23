const COURIER_ONLY_ROLES = new Set(['courier_admin', 'courier_ops']);

export function isCourierOnlyRole(role: string | null | undefined): boolean {
  return !!role && COURIER_ONLY_ROLES.has(role);
}
