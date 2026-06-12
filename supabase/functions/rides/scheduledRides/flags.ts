/** Server flag for scheduled/reserve rides (`SCHEDULED_RIDES_ENABLED=1`). Default OFF when unset. */
export function isScheduledRidesEnabled(): boolean {
  return Deno.env.get("SCHEDULED_RIDES_ENABLED") === "1";
}
