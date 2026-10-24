# Fare parity before Rides uses Dominion borders

Status: **not signed**. Do not deploy the Rides function until this list is signed.

The old handwritten boxes lived in `packages/business-config/src/jamaicaLocations.ts` and `supabase/functions/rides/fare/jamaicaLocations.ts`. Those coordinate lists are gone from the working tree. The fare key shape is unchanged: `jamaica / county / parish / locality`. Counties stay aliases, not official borders.

What changes when the new Rides function is deployed:

- A pickup is matched by the real parish border, then the town border inside it.
- Where two parishes overlap, the smaller border wins. Kingston inside St. Andrew is the known case. The old boxes and the new borders will not always pick the same parish there.
- A pin outside every border falls back to `jamaica`, the same fallback as a pin outside the old boxes.

Checked on 24 Oct 2026 without changing live fares:

- 20 town centres (Chapelton through Christiana) fall inside their parent parish on the adopted border. 20 of 20 match.
- Parish copies equal the old borders. 0 mismatches. Coverage cells still 1154. One live market.

Sign-off

- Name:
- Date:
- I accept the Kingston / St. Andrew differences and the switch to Dominion borders.
