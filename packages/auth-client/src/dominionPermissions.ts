/**
 * One permission list for Dominion's menu and its save API.
 * Owner can do all of it. Support can edit master data.
 * An analyst can look and cannot save. Back office and staff stay with the owner.
 */
export const DOMINION_ACTIONS = [
  "catalog.write",
  "stations.verify",
  "stations.edit",
  "tolls.edit",
  "vendors.edit",
  "maps.publish",
  "gct.edit",
  "staff.manage",
  "backoffice",
] as const;

export type DominionAction = (typeof DOMINION_ACTIONS)[number];

const MASTER_EDITS = new Set<DominionAction>([
  "catalog.write",
  "stations.verify",
  "stations.edit",
  "tolls.edit",
  "vendors.edit",
  "maps.publish",
  "gct.edit",
]);

export function dominionCan(role: string | null | undefined, action: DominionAction): boolean {
  if (role === "platform_owner" || role === "superadmin") return true;
  if (role === "platform_support") return MASTER_EDITS.has(action);
  return false;
}
