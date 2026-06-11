export function isRoamConnectionsEnabled(): boolean {
  return Deno.env.get("ROAM_CONNECTIONS") === "1";
}
