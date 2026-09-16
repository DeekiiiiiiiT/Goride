/** Shared rides wallet account key helpers — keep fleet out of rides/cashSettlement graph. */

export function riderAccountKeyForUser(userId: string): string {
  return `user:${userId}:rider`;
}

export function driverAccountKeyForUser(userId: string): string {
  return `user:${userId}:driver`;
}

export function driverDigitalAccountKeyForUser(userId: string): string {
  return `user:${userId}:driver:digital`;
}

export function driverCashAccountKeyForUser(userId: string): string {
  return `user:${userId}:driver:cash`;
}

export function driverDebtAccountKeyForUser(userId: string): string {
  return `user:${userId}:driver:debt`;
}
