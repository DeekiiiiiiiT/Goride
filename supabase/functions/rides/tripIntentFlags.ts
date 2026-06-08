export function isTripIntentV2Enabled(): boolean {
  const v = Deno.env.get("TRIP_INTENT_V2");
  if (v === "0" || v === "false") return false;
  return true;
}
