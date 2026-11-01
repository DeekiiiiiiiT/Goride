/**
 * Trusted catalogue domain blocking (R32): two consecutive HTTP 403 fetches.
 */

/** True when the two most recent fetches (newest first) are both 403. */
export function consecutive403PairShouldBlock(lastTwoHttpStatusesNewestFirst: number[]): boolean {
  if (lastTwoHttpStatusesNewestFirst.length < 2) return false;
  return lastTwoHttpStatusesNewestFirst[0] === 403 && lastTwoHttpStatusesNewestFirst[1] === 403;
}

/** Domains eligible for the Gemini "Prefer catalogue results on" line. */
export function filterDomainsForCatalogPrompt(domains: string[]): string[] {
  return domains.filter(Boolean);
}
