import { KNOWN_PLATFORMS } from './types.ts';

export function normalizePlatform(platform: string | undefined | null): string {
  if (!platform) return 'Other';
  const trimmed = String(platform).trim();
  if (!trimmed) return 'Other';
  if (trimmed === 'GoRide' || trimmed.toLowerCase() === 'goride') return 'Roam';
  const lower = trimmed.toLowerCase();
  if (lower === 'uber') return 'Uber';
  if (lower === 'roam') return 'Roam';
  if (lower === 'indrive' || lower === 'in drive') return 'InDrive';
  return trimmed;
}

export function platformsEqual(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return normalizePlatform(a) === normalizePlatform(b);
}

/** Reject blank/unknown platform on money writes. */
export function assertKnownPlatform(platform: string | undefined | null): string {
  const n = normalizePlatform(platform);
  if (n === 'Other' || !(KNOWN_PLATFORMS as readonly string[]).includes(n)) {
    throw new Error(`Money event requires a known platform (Uber/Roam/InDrive); got ${platform || '(blank)'}`);
  }
  return n;
}

export function isKnownPlatform(platform: string | undefined | null): boolean {
  const n = normalizePlatform(platform);
  return (KNOWN_PLATFORMS as readonly string[]).includes(n);
}
