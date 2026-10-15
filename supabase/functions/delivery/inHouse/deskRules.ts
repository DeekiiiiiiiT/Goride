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

/** Closed-test stores are invisible to everyone else. A public store stays visible. */
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

const STALE_MS = 14 * 24 * 60 * 60 * 1000;

export type GoLiveStoreOwnInput = {
  hasHours: boolean;
  orderChannel: string | null | undefined;
  orderUrl: string | null | undefined;
  orderPhone: string | null | undefined;
  tosReviewedAt: string | null | undefined;
  freshDishCount: number;
};

export type GoLiveDeskInput = {
  hasCard: boolean;
  globallyEnabled: boolean;
};

export type GoLiveStoreInput = GoLiveStoreOwnInput & GoLiveDeskInput;

/** Store-only setup gaps (excludes desk-wide card/switch). */
export function inHouseStoreGoLiveBlockers(store: GoLiveStoreOwnInput): string[] {
  const blockers: string[] = [];
  if (!store.hasHours) blockers.push("Opening hours are not set");
  const channel = String(store.orderChannel || "web");
  const hasLink = Boolean(String(store.orderUrl || "").trim());
  const hasPhone = Boolean(String(store.orderPhone || "").trim());
  if (channel === "web" || channel === "whatsapp") {
    if (!hasLink) blockers.push("Ordering link is missing");
  } else if (!hasPhone && !hasLink) {
    blockers.push("Order phone or ordering link is missing");
  }
  if (!store.tosReviewedAt) blockers.push("Website terms have not been reviewed");
  if (store.freshDishCount < 1) blockers.push("Need at least one dish with a confirmed price from the last 14 days");
  return blockers;
}

/** Desk-wide blockers that apply to every store. */
export function inHouseDeskGoLiveBlockers(desk: GoLiveDeskInput): string[] {
  const blockers: string[] = [];
  if (!desk.hasCard) blockers.push("No company card can pay for this yet");
  if (!desk.globallyEnabled) blockers.push("The In-House switch is off");
  return blockers;
}

/** All reasons a store cannot go live. Empty list means ready. */
export function inHouseGoLiveBlockers(store: GoLiveStoreInput): string[] {
  return [...inHouseStoreGoLiveBlockers(store), ...inHouseDeskGoLiveBlockers(store)];
}

export function priceCheckedIsFresh(checkedAt: string | null | undefined, now = Date.now()): boolean {
  if (!checkedAt) return false;
  const at = Date.parse(checkedAt);
  return Number.isFinite(at) && now - at <= STALE_MS;
}

/** Build an in_house_stores patch from only the keys the client sent. */
export function storePatchFromBody(body: Record<string, unknown>, existing: Record<string, unknown> | null): Record<string, unknown> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const set = (key: string, value: unknown) => { patch[key] = value; };
  if ("sourceBrand" in body || "name" in body) set("source_brand", body.sourceBrand ?? body.name ?? existing?.source_brand ?? null);
  if ("sourceLocationLabel" in body) set("source_location_label", body.sourceLocationLabel || null);
  if ("orderChannel" in body) set("order_channel", body.orderChannel || "web");
  if ("orderUrl" in body) set("order_url", body.orderUrl || null);
  if ("orderPhone" in body) set("order_phone", body.orderPhone || null);
  if ("pickupInstructions" in body) set("pickup_instructions", body.pickupInstructions || null);
  if ("defaultPrepMinutes" in body) set("default_prep_minutes", Number(body.defaultPrepMinutes || 25));
  if ("markupBps" in body) set("markup_bps", Number(body.markupBps ?? 1500));
  if ("priceToleranceBps" in body) set("price_tolerance_bps", Number(body.priceToleranceBps ?? 1000));
  if ("absorbCapMinor" in body) set("absorb_cap_minor", Number(body.absorbCapMinor ?? 50000));
  if ("maxOrderMinor" in body) set("max_order_minor", body.maxOrderMinor == null ? null : Number(body.maxOrderMinor));
  if ("partnershipStatus" in body) set("partnership_status", body.partnershipStatus || "none");
  if ("notes" in body) set("notes", body.notes || null);
  if ("audience" in body && (body.audience === "public" || body.audience === "beta")) set("audience", body.audience);
  if ("setupStatus" in body && (body.setupStatus === "draft" || body.setupStatus === "ready")) set("setup_status", body.setupStatus);
  if ("tosReviewed" in body) {
    if (body.tosReviewed) {
      // Stamp only on first review; later saves must not overwrite who/when.
      if (!existing?.tos_reviewed_at) {
        set("tos_reviewed_at", new Date().toISOString());
        if ("tosReviewedBy" in body) set("tos_reviewed_by", body.tosReviewedBy || null);
      }
    } else if (body.tosReviewed === false) {
      set("tos_reviewed_at", null);
      set("tos_reviewed_by", null);
    }
  }
  if ("pausedReason" in body) set("paused_reason", body.pausedReason || null);
  if ("pausedBy" in body) set("paused_by", body.pausedBy || null);
  if ("pausedAt" in body) set("paused_at", body.pausedAt || null);
  // Never wipe automation flags on a partial save.
  if (!existing) {
    set("automation_level", "L0");
    set("adapter_key", "manual");
    set("tos_allows_automation", false);
  }
  return patch;
}

export function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
