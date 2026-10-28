# Places register data work

Do this in Dominion after the coverage numbers are showing. No app release is required. Do the verified stations before any large import. A big CSV still rebuilds coverage once per statement, not once per row, but it is still a heavy write.

## Facilities first (56 verified stations)

Open Places → Places register. Filter to verified gas stations.

On each verified station, add the facilities that are really there. Start with restroom, ATM, air/water, and convenience store. Do these 56 before the pending list.

Check: in Plug, near Half Way Tree, a restroom search should return stations. Today it returns nothing because every station only has a fuel pump.

## Brands

Open Places → Categories → Brands.

Add the names that keep showing up without a brand, then assign them on the register:

- Gulfstream (about 12 stations)
- First (about 5)
- Jampet, Blaize, Tomijam, JamGas, G.A. Hamilton, MZ, Buds, Johnson's (about 2 each)
- The station named TotalEnergies that has no brand

## Other place types

Every live place is a gas station or a toll. Map the types Plug shows on its home grid before the rest:

1. Mechanic
2. Parts store
3. Tyres and air
4. Car wash
5. Restroom
6. Roadside help

Add at least one real place of each, with a pin you have checked.

## Forms, the pending list, and pins

In Categories, write the detail fields the editor is missing. Start with gas station hours and attendant, and the ATM's bank. Most facility types and several place types still have an empty form.

Work the pending queue (about 148 imported stations). Imported rows sit on the Import chip in Review, not Hand review.

When a station is checked on site, set the pin to confirmed. None of the verified pins are confirmed yet.

## After the next GPS-matched fill

Run [scripts/sql/places_section_g_checks.sql](../scripts/sql/places_section_g_checks.sql) with that fill's station id. The name, brand, address, parish, phone, pin state, and geofence must be unchanged. If the geofence was empty, it must stay empty.

## Health check

After 29 Oct 2026, 04:15 UTC, the `places-migration-health` job should have succeeded, and `places.migration_health` should have no rows. The same script checks that.

## Retirement

Do not run [scripts/sql/places_phase8_retire.sql](../scripts/sql/places_phase8_retire.sql) before 12 Nov 2026, 00:00 UTC. Fleet station and toll views stay. The script only removes the old public station card, merchant-alias view, and price `station_id` column, and only after 14 clean days of logs for those two objects and after every price row has a place id.

After it commits, stop sending `station_id` on price writes and redeploy fleet-fuel and explorer.
