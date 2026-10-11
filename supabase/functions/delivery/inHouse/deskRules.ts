/** Pure desk rules. No database. */

export type StatementCandidate = {
  id: string;
  placedAt: string;
  matched: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Oldest unmatched task on the same card and amount, within three days of the purchase. */
export function pickStatementTask(
  tasks: StatementCandidate[],
  postedOn: string,
  windowDays = 3,
): StatementCandidate | null {
  const posted = Date.parse(`${postedOn}T12:00:00Z`);
  if (!Number.isFinite(posted)) return null;
  const eligible = tasks
    .filter((task) => !task.matched && task.placedAt)
    .filter((task) => {
      const placed = Date.parse(task.placedAt);
      return Number.isFinite(placed) && Math.abs(placed - posted) <= windowDays * DAY_MS;
    })
    .sort((a, b) => Date.parse(a.placedAt) - Date.parse(b.placedAt));
  return eligible[0] ?? null;
}

export function slaLevel(startedAtIso: string, now: Date, warned: boolean): "none" | "warn" | "page" {
  const started = Date.parse(startedAtIso);
  if (!Number.isFinite(started)) return "none";
  const age = now.getTime() - started;
  if (age >= 15 * 60 * 1000) return "page";
  if (age >= 7 * 60 * 1000 && !warned) return "warn";
  return "none";
}

export function canReplaceReceipt(state: string, claimedBy: string | null, actorId: string): boolean {
  return state === "placing" && claimedBy === actorId;
}

export function readyStatusAllowed(taskState: string, orderStatus: string): boolean {
  return taskState === "placed_external" && (orderStatus === "preparing" || orderStatus === "accepted");
}

export function partnerConversionBlocked(input: {
  ownerId: string | null;
  teamCount: number;
  payableHistory: boolean;
  openOrders: number;
  procurementMode: string;
}): string | null {
  if (input.procurementMode === "in_house") return null;
  if (input.ownerId) return "This restaurant already has an owner";
  if (input.teamCount > 0) return "This restaurant already has a team";
  if (input.payableHistory) return "This restaurant already has payout history";
  if (input.openOrders > 0) return "This restaurant has an open order";
  return "In-House restaurants are created from the add-store form";
}

export function faultChargeLine(inHouse: boolean, merchantId: string, minor: number): {
  kind: string;
  party_type: string;
  party_id: string | null;
  component: string;
  amount_minor: number;
} {
  if (inHouse) {
    return {
      kind: "platform_cost",
      party_type: "platform",
      party_id: null,
      component: "procurement_refund",
      amount_minor: minor,
    };
  }
  return {
    kind: "merchant_receivable",
    party_type: "merchant",
    party_id: merchantId,
    component: "fault",
    amount_minor: minor,
  };
}
