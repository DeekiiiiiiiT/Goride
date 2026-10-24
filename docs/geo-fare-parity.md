# Fare parity before Rides uses Dominion borders

Status: **not signed**. Do not deploy the Rides function until this list is signed.

The old handwritten boxes lived in `packages/business-config/src/jamaicaLocations.ts` and `supabase/functions/rides/fare/jamaicaLocations.ts`. Those coordinate lists are gone from the working tree. The fare key shape is unchanged: `jamaica / county / parish / locality`. Counties stay aliases, not official borders.

What changes when the new Rides function is deployed:

- A pickup is matched by the real parish border, then the town border inside it.
- No live fare uses a parish or a town, so that match does not change a price today.
- A pin outside every border falls back to `jamaica`, the same fallback as a pin outside the old boxes.

Checked on 24 Oct 2026 against production, without changing live fares:

- 4 fare rules are live. Every one uses `jamaica`. None uses a county, parish, or town.
- Switching Rides to Dominion borders therefore changes 0 fares.
- Official parish borders do not overlap, so the Kingston / St. Andrew note does not change any fare today. Re-check a pin before anyone adds the first parish or town fare.

Sign-off

- Name:
- Date:
- I accept the switch to Dominion borders. Rides stays on the current deploy until this is signed.
