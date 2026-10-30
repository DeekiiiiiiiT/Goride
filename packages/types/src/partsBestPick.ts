/** Best match for a search. Dominion uses fit only. Fleet can use stock and price. */

export type BestPickItem = {
  id: string;
  tier: number;
  status: "verified" | "needs_checking";
  stockQty?: number;
  landedJmd?: number | null;
  priceStale?: boolean;
};

export type BestPick = BestPickItem & { badge?: "Needs checking" };

function inStock(item: BestPickItem): boolean {
  return (item.stockQty ?? 0) > 0;
}

function byPrice(a: BestPickItem, b: BestPickItem): number {
  const aFresh = a.priceStale ? 1 : 0;
  const bFresh = b.priceStale ? 1 : 0;
  if (aFresh !== bFresh) return aFresh - bFresh;
  const aPrice = a.landedJmd == null || !Number.isFinite(a.landedJmd) ? Number.POSITIVE_INFINITY : a.landedJmd;
  const bPrice = b.landedJmd == null || !Number.isFinite(b.landedJmd) ? Number.POSITIVE_INFINITY : b.landedJmd;
  return aPrice - bPrice;
}

export function pickBestPart(
  sections: Array<{ tier: number; items: BestPickItem[] }>,
  options: { useStock?: boolean; usePrice?: boolean } = {},
): BestPick | null {
  const listed = sections.flatMap((section) => section.items.map((item) => ({ ...item, tier: item.tier || section.tier })));
  const primary = listed.filter((item) => item.tier >= 1 && item.tier <= 4);
  let pool = primary.length > 0 ? primary : listed.filter((item) => item.tier === 5);
  if (pool.length === 0) return null;
  if (options.useStock && pool.some(inStock)) pool = pool.filter(inStock);
  const verified = pool.filter((item) => item.status === "verified");
  const usingVerified = verified.length > 0;
  if (usingVerified) pool = verified;
  const lowest = Math.min(...pool.map((item) => item.tier));
  pool = pool.filter((item) => item.tier === lowest);
  if (options.usePrice) pool = [...pool].sort(byPrice);
  const winner = pool[0];
  if (!winner) return null;
  if (!usingVerified) return { ...winner, badge: "Needs checking" };
  return { ...winner };
}
