/** "Land Rover Defender 2020" → make, model, year. Longest known make wins. */

export function parseQuickCar(
  text: string,
  makes: string[],
): { make: string; model: string; year: number } | null {
  const raw = text.trim().replace(/\s+/g, " ");
  if (!raw) return null;
  const years = [...raw.matchAll(/\b(?:19|20)\d{2}\b/g)];
  if (years.length === 0) return null;
  const yearToken = years[years.length - 1];
  const year = Number(yearToken[0]);
  const head = raw.slice(0, yearToken.index).trim();
  if (!head) return null;
  const known = [...makes]
    .map((make) => make.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const lower = head.toLowerCase();
  const make = known.find((item) => lower === item.toLowerCase() || lower.startsWith(`${item.toLowerCase()} `));
  if (!make) return null;
  const model = head.slice(make.length).trim();
  if (!model) return null;
  return { make, model, year };
}
