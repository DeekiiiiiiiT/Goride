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

export type ClaimEvent = {
  to_state?: string | null;
  actor_id?: string | null;
  at?: string | null;
  payload?: { actor_email?: string | null } | null;
};

/** The last person who claimed the task, from the event history. Abandon clears claimed_by. */
export function lastClaimer(events: ClaimEvent[]): { id: string; email: string | null } | null {
  const ranked = events
    .filter((event) => (event.to_state === "claimed" || event.to_state === "placing") && event.actor_id)
    .slice()
    .sort((a, b) => Date.parse(String(a.at || "")) - Date.parse(String(b.at || "")));
  const last = ranked[ranked.length - 1];
  if (!last?.actor_id) return null;
  const email = last.payload?.actor_email ? String(last.payload.actor_email) : null;
  return { id: String(last.actor_id), email };
}

export function abandonMoment(events: Array<{ to_state?: string | null; at?: string | null }>): string | null {
  const abandons = events
    .filter((event) => event.to_state === "abandoned" && event.at)
    .slice()
    .sort((a, b) => Date.parse(String(a.at)) - Date.parse(String(b.at)));
  const last = abandons[abandons.length - 1];
  return last?.at ? String(last.at) : null;
}

/** A receipt from before the abandon does not prove this spend. */
export function receiptFollowsAbandon(uploadedAt: string | null | undefined, abandonedAt: string | null): boolean {
  if (!uploadedAt || !abandonedAt) return false;
  const uploaded = Date.parse(uploadedAt);
  const abandoned = Date.parse(abandonedAt);
  return Number.isFinite(uploaded) && Number.isFinite(abandoned) && uploaded > abandoned;
}

export function canReplaceReceipt(input: {
  state: string;
  claimedBy: string | null;
  actorId: string;
  lastClaimerId: string | null;
  isOps: boolean;
}): boolean {
  if (input.state === "placing" && input.claimedBy === input.actorId) return true;
  const isOriginal = input.lastClaimerId != null && input.actorId === input.lastClaimerId;
  if (input.state === "abandoned") return input.isOps || isOriginal;
  const late = new Set([
    "exception_purchase_unknown",
    "exception_before_purchase",
    "queued",
    "claimed",
    "awaiting_customer",
  ]);
  return late.has(input.state) && isOriginal;
}

/** Normal purchase while the buyer may still be paying. Write-off once the task has moved on. */
export function purchaseRecording(input: {
  state: string;
  actorId: string;
  claimedBy: string | null;
  lastClaimerId: string | null;
  isOps: boolean;
}): "normal" | "writeoff" | "denied" {
  const isOriginal = input.lastClaimerId != null && input.actorId === input.lastClaimerId;
  const isCurrent = input.claimedBy === input.actorId;
  const open = input.state === "placing" || input.state === "exception_purchase_unknown";
  if (open && (isCurrent || isOriginal)) return "normal";
  const alreadyBought = new Set([
    "placed_external",
    "ready_for_pickup",
    "picked_up",
    "closed",
    "exception_after_purchase",
  ]);
  if (alreadyBought.has(input.state)) return "denied";
  if (input.state === "abandoned" && (isOriginal || input.isOps)) return "writeoff";
  if (isOriginal) return "writeoff";
  return "denied";
}

export const MISSING_TASK_REFUND_MS = 10 * 60 * 1000;

/** A paid order that still cannot become a task is refunded after ten minutes. */
export function refundMissingTask(
  createdAt: string,
  now: Date,
  outcome: "created" | "exists" | "skipped",
): boolean {
  if (outcome !== "skipped") return false;
  const age = now.getTime() - Date.parse(createdAt);
  return Number.isFinite(age) && age >= MISSING_TASK_REFUND_MS;
}

/** Staff and friends stores are invisible to everyone else. A public store stays visible. */
export function audienceAllows(audience: string | null | undefined, onBetaList: boolean): boolean {
  if (audience !== "beta") return true;
  return onBetaList;
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

/** In-House fault charges are not journaled. The pair would add and subtract the same Roam amount. */
export function merchantFaultJournal(inHouse: boolean, merchantId: string, minor: number): Array<{
  kind: string;
  party_type: string;
  party_id: string | null;
  component: string;
  amount_minor: number;
}> | null {
  if (inHouse) return null;
  return [
    {
      kind: "merchant_receivable",
      party_type: "merchant",
      party_id: merchantId,
      component: "fault",
      amount_minor: minor,
    },
    {
      kind: "platform_revenue",
      party_type: "platform",
      party_id: null,
      component: "fault",
      amount_minor: -minor,
    },
  ];
}
