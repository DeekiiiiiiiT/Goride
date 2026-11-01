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
