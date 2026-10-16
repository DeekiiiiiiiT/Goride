/** Lightweight semver compare: a < b → -1, a = b → 0, a > b → 1. */
export function compareVersions(a: string, b: string): number {
  const pa = parseParts(a);
  const pb = parseParts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const xa = pa[i] ?? 0;
    const xb = pb[i] ?? 0;
    if (xa < xb) return -1;
    if (xa > xb) return 1;
  }
  return 0;
}

function parseParts(v: string): number[] {
  const core = String(v || '0')
    .trim()
    .replace(/^v/i, '')
    .split(/[-+]/)[0];
  return core.split('.').map((p) => {
    const n = parseInt(p.replace(/\D/g, ''), 10);
    return Number.isFinite(n) ? n : 0;
  });
}
