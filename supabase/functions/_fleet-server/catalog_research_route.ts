/**
 * Auto vs review routing (audit B3 step 3 + R7).
 */
import type { NumberShapeResult } from "./catalog_research_number_shape.ts";

export type RoutedProposal = {
  id: string;
  slotKey: string;
  route: "auto" | "review";
  passedDomainCount: number;
  shadowWouldAuto: boolean;
};

export type RouteInput = {
  proposals: Array<{
    id: string;
    slotKey: string;
    matchType: string;
    partNumberNorm: string;
    passedDomains: string[];
    shape: NumberShapeResult;
  }>;
  shadowMode: boolean;
};

function shapeBlocksAuto(shape: NumberShapeResult): boolean {
  return shape !== "ok";
}

export function routeProposals(input: RouteInput): RoutedProposal[] {
  const byMatchType = new Map<string, typeof input.proposals>();
  for (const p of input.proposals) {
    const key = (p.matchType || "").toLowerCase();
    const list = byMatchType.get(key) || [];
    list.push(p);
    byMatchType.set(key, list);
  }

  const conflictIds = new Set<string>();
  for (const peers of byMatchType.values()) {
    const strong = peers.filter((p) => {
      const domains = [...new Set(p.passedDomains.map((d) => d.toLowerCase()))];
      return domains.length >= 2 && !shapeBlocksAuto(p.shape);
    });
    if (strong.length < 2) continue;
    const numbers = new Set(strong.map((p) => p.partNumberNorm));
    if (numbers.size > 1) {
      for (const p of strong) conflictIds.add(p.id);
    }
  }

  const out: RoutedProposal[] = [];
  for (const p of input.proposals) {
    const domains = [...new Set(p.passedDomains.map((d) => d.toLowerCase()))];
    const passedDomainCount = domains.length;
    const autoEligible = passedDomainCount >= 2 && !shapeBlocksAuto(p.shape) && !conflictIds.has(p.id);
    const route = autoEligible && !input.shadowMode ? "auto" : "review";
    out.push({
      id: p.id,
      slotKey: p.slotKey,
      route,
      passedDomainCount,
      shadowWouldAuto: autoEligible && input.shadowMode,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// RE-19: routing by the owner's source rule (replaces "two distinct domains" once the worker switches over).
// ---------------------------------------------------------------------------

export type SourceKind = "car_maker" | "part_maker" | "reference";

export type SourcePass = {
  domain: string;
  kind: SourceKind;
  /** The maker this source speaks for (trusted_source.maker_norm). */
  makerNorm: string;
  path: "direct" | "owner_browser";
  readId: string;
};

export type RuleProposal = {
  id: string;
  /** car version + part type + position — proposals that compete for the same slot. */
  slotKey: string;
  partNumberNorm: string;
  /** Brand of the proposed part, normalised (part maker's own part = route b). */
  brandNorm: string;
  /** The car's maker, normalised (route a). */
  carMakerNorm: string;
  /** Interchange group the number already belongs to, when known (same group = no conflict). */
  groupId?: string | null;
  shape: NumberShapeResult;
  passes: SourcePass[];
};

export type RuleRouted = {
  id: string;
  slotKey: string;
  trust: "confirmed" | "needs_checking";
  trustRoute: "a" | "b" | "c" | "owner_browser" | null;
  route: "auto" | "review";
  shadowWouldAuto: boolean;
  conflict: boolean;
  evidenceReadIds: string[];
};

const norm = (s: string) => (s || "").trim().toLowerCase();

/** Which rule confirms this proposal, and with which reads. Reference sources never count. */
export function sourceRuleVerdict(p: RuleProposal): {
  trustRoute: RuleRouted["trustRoute"];
  readIds: string[];
  automatic: boolean;
} {
  const passes = p.passes.filter((s) => s.kind !== "reference");
  const brand = norm(p.brandNorm);
  const car = norm(p.carMakerNorm);

  // (b) the part maker's own catalogue lists its own part, read automatically.
  const own = passes.find((s) => s.kind === "part_maker" && s.path === "direct" && norm(s.makerNorm) === brand);
  if (own) return { trustRoute: "b", readIds: [own.readId], automatic: true };

  // (c) two different part makers name the same factory number for the car, both read automatically.
  const makers = new Map<string, SourcePass>();
  for (const s of passes) {
    if (s.kind === "part_maker" && s.path === "direct" && !makers.has(norm(s.makerNorm))) makers.set(norm(s.makerNorm), s);
  }
  if (makers.size >= 2) {
    const two = [...makers.values()].slice(0, 2);
    return { trustRoute: "c", readIds: two.map((s) => s.readId), automatic: true };
  }

  // (a) the car maker's catalogue (or a frame-number site trusted for that maker). Never automatic.
  const carMaker = passes.find((s) => s.kind === "car_maker" && norm(s.makerNorm) === car);
  if (carMaker) {
    return {
      trustRoute: carMaker.path === "owner_browser" ? "owner_browser" : "a",
      readIds: [carMaker.readId],
      automatic: false,
    };
  }

  // The owner checked a part maker's page in the browser: confirmed, never automatic.
  const ownByOwner = passes.find((s) => s.kind === "part_maker" && s.path === "owner_browser" && norm(s.makerNorm) === brand);
  if (ownByOwner) return { trustRoute: "owner_browser", readIds: [ownByOwner.readId], automatic: false };

  return { trustRoute: null, readIds: [], automatic: false };
}

export function routeBySourceRule(input: { proposals: RuleProposal[]; shadowMode: boolean }): RuleRouted[] {
  const verdicts = new Map(input.proposals.map((p) => [p.id, sourceRuleVerdict(p)]));

  // A conflict: two Confirmed-eligible numbers for the same slot that are not in one interchange group.
  const conflictIds = new Set<string>();
  const bySlot = new Map<string, RuleProposal[]>();
  for (const p of input.proposals) {
    if (!verdicts.get(p.id)!.trustRoute) continue;
    const list = bySlot.get(p.slotKey) || [];
    list.push(p);
    bySlot.set(p.slotKey, list);
  }
  for (const peers of bySlot.values()) {
    for (let i = 0; i < peers.length; i++) {
      for (let j = i + 1; j < peers.length; j++) {
        const a = peers[i];
        const b = peers[j];
        if (a.partNumberNorm === b.partNumberNorm) continue;
        if (a.groupId && b.groupId && a.groupId === b.groupId) continue;
        conflictIds.add(a.id);
        conflictIds.add(b.id);
      }
    }
  }

  return input.proposals.map((p) => {
    const v = verdicts.get(p.id)!;
    const conflict = conflictIds.has(p.id);
    const autoEligible = v.automatic && p.shape === "ok" && !conflict;
    return {
      id: p.id,
      slotKey: p.slotKey,
      trust: v.trustRoute ? "confirmed" : "needs_checking",
      trustRoute: v.trustRoute,
      route: autoEligible && !input.shadowMode ? "auto" : "review",
      shadowWouldAuto: autoEligible && input.shadowMode,
      conflict,
      evidenceReadIds: v.readIds,
    };
  });
}
