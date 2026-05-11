/** Normalize make/model/year for dedupe hints and catalog matching. */
export function normalizeVehicleMatchKey(
  make: string,
  model: string,
  year: string | number,
): string {
  const y = typeof year === "number" ? String(year) : String(year).trim();
  return `${make.trim().toLowerCase()}|${model.trim().toLowerCase()}|${y}`;
}

/** Dice coefficient 0-1 for fuzzy duplicate hints. */
export function diceCoefficient(a: string, b: string): number {
  const bigrams = (s: string) => {
    const x = s.toLowerCase().trim();
    const g: string[] = [];
    for (let i = 0; i < x.length - 1; i++) g.push(x.slice(i, i + 2));
    return g;
  };
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.length === 0 || B.length === 0) return 0;
  const map = new Map<string, number>();
  for (const x of A) map.set(x, (map.get(x) ?? 0) + 1);
  let inter = 0;
  for (const x of B) {
    const n = map.get(x);
    if (n && n > 0) {
      inter++;
      map.set(x, n - 1);
    }
  }
  return (2 * inter) / (A.length + B.length);
}
