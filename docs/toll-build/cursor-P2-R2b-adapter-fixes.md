# Cursor prompt — Toll P2-R2b: adapter fixes

Claude checked P2-R2. The tests pass, but these must change. Files: `packages/toll-core/src/v2/adapters/*`. **No migrations.** Do not commit, branch or push.

## Fixes (one each)
1. **`toMinor` accepts junk** (`common.ts`).
   - `"1.2.3"` gives 102 today; it must return `null` (allow at most one `.`).
   - More than 2 decimals: if the extra digits are all `0` (`"370.000"`) → fine; otherwise return `null`, never truncate (`"1.005"` → `null`).
2. **Tag `source_ref` must not depend on how the tag number is printed** (`tagStatement.ts`). Use the lookup form (`normalizeTagForLookup`, no leading zeros) inside the ref, and the plaza name trimmed with inner spaces collapsed. `"001234"` and `"1234"` must give the same ref.
3. **Top-ups inside a tag statement use the row number as their ref** (`tag-topup:<tag>:<rowNum>`). A re-export with one extra line above would store the same top-up twice. Use `tagtopup:<tag lookup form>|<yyyy-mm-ddThh:mm>|<amount_minor>#<n>`, with `n` counted within the file like crossings. `account_ref` also uses the lookup form; do the same for `account_ref` in `topupProvider.ts`.
4. **Plaza not known → problem, not a row** (`tagStatement.ts`). Today an unmapped plaza falls back to the plaza **name** as `plaza_id`. That silently stops duplicate matching against driver cash and Roam crossings, which use the real id. Make it a problem row: `Plaza not known: <name>`. Amount `0` → problem too.
5. **Uber support adjustments with a Trip UUID** are added to that trip's toll today, so a later adjustment would look like "the trip's toll changed". Check the Description **first**: any row whose Description starts with `Support Adjustment:` is an adjustment row (when Toll ≠ 0), whether or not it has a Trip UUID, and never adds to a trip.
6. **Uber adjustment with no readable `vs reporting` date gets `1970-01-01`.** Make it a problem instead (`Adjustment date unreadable`).
7. **Uber trips that only appear in `trip_activity`** (no payment line) are dropped. Every completed trip is needed later to match tag crossings during trips. Emit them as trip rows with `payment_method 'card'` and no toll, the same as today's rule for "no cash collected".
8. **InDrive** (`indrive.ts`):
   - `payment_method` must be lower-cased and mapped to `cash` | `card` | `unknown` (`"Cash"` → `cash`; anything else that isn't card → `unknown`). The import treats only exactly `cash` as driver-received.
   - No trip id → problem, never `indrive-row-<n>` (a row number isn't stable across files).
   - A driver not found → problem, never the driver's **name** as `driver_id`.
9. **Tests must assert exact rows** (`toEqual` on the whole row, not `toMatchObject` or `toContain`), for:
   - the three Uber cash trips;
   - the three adjustments;
   - both tag crossings (the full `source_ref` string);
   - the top-up.

   Add tests for each fix above:
   - `"1.2.3"`, `"1.005"` and `"370.000"`;
   - `001234` vs `1234` giving the same ref;
   - a re-export with an extra line on top giving identical refs;
   - an unknown plaza;
   - an adjustment that has a Trip UUID;
   - an adjustment with a bad date;
   - an activity-only trip;
   - InDrive `"Cash"`, a missing id, and an unknown driver.

## Run (once)
`pnpm --filter @roam/toll-core test`. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results. Don't paste file contents. Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183).
