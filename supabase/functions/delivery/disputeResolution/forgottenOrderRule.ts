const FORGOTTEN_ISSUE_TYPES = new Set(["never_arrived", "late_order", "other"]);
const MIN_COURIER_WAIT_MINUTES = 20;
const ACTIVE_ORDER_STATUSES = ["preparing", "accepted", "placed"];

export function isForgottenOrderCandidate(issueType: string, orderStatus: string): boolean {
  return FORGOTTEN_ISSUE_TYPES.has(issueType) && ACTIVE_ORDER_STATUSES.includes(orderStatus);
}

export function shouldEvaluateForgottenRule(
  issueType: string,
  orderStatus: string,
  waitMinutes: number,
): boolean {
  return isForgottenOrderCandidate(issueType, orderStatus) &&
    waitMinutes >= MIN_COURIER_WAIT_MINUTES;
}
