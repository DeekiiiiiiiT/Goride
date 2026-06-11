export function isPickupLocationRequestEnabled(): boolean {
  return Deno.env.get("PICKUP_LOCATION_REQUEST") === "1";
}
