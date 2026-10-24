/** National borders, parishes, and pins are edited in Roam Dominion. */

export const GEOGRAPHY_MANAGED_MESSAGE = "Managed in Roam Dominion";

export function geographyManagedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "gone",
      message: GEOGRAPHY_MANAGED_MESSAGE,
    }),
    { status: 410, headers: { "Content-Type": "application/json" } },
  );
}
