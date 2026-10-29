/**
 * Partial station saves must not wipe fields the caller did not send.
 * A missing key keeps the stored value. null or "" clears that field.
 */
export function mergeStationPayload(
  existing: Record<string, unknown> | null,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  if (!existing) return { ...incoming };
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    merged[key] = value;
  }
  return merged;
}
