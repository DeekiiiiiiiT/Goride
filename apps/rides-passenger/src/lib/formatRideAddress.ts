/** First N comma-separated parts for compact pickup lines in live ride UI. */
export function formatShortAddress(address: string | null | undefined, parts = 2): string {
  if (!address?.trim()) return 'Pickup location';
  const segments = address.split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length <= parts) return segments.join(', ');
  return segments.slice(0, parts).join(', ');
}
