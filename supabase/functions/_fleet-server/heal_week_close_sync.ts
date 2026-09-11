/**
 * Thin wrapper — prefer scripts/heal-week-close-sync.ts.
 * Requires ORG_ID, WEEKS, ACTOR_ID (no production defaults).
 *
 *   deno run -A --config deno.json scripts/heal-week-close-sync.ts
 */
console.error(
  "heal_week_close_sync.ts moved to scripts/heal-week-close-sync.ts — " +
    "run that entrypoint with ORG_ID, ACTOR_ID, and WEEKS set (see scripts/heal-week-close-sync.ps1).",
);
Deno.exit(1);
