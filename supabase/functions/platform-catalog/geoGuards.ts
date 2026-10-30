/** Shared Jamaica map write checks. Used by the catalog routes and the Deno tests. */

export function outsideJamaica(lat: number, lng: number): boolean {
  return !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 17.6 || lat > 18.6 || lng < -78.5 || lng > -76.1;
}

export function draftDiscardStatus(message: string): number {
  return /not_a_draft|not_found/i.test(message) ? 400 : 500;
}
