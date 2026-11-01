# Roam Fleet · Find parts + Dominion Pending catalog (parts) — audit (Rev 28, 31 Oct 2026)

**This is the only doc for this work.** Code closeout + DB housekeeping done in repo; one owner UI step remains before full sign-off.

**Verified 2 Nov (feature):**
- Commits 4b2226db and 6aea10ba are pushed.
- Both servers are live; roamfleet.co and roamdominion.co serve new builds.
- Brakes now holds one Brake pads (7 parts, 4 of them the Roomy's), Brake shoes / drums (2), Brake fluid and Brake rotor.
- The duplicate part type is gone.
- The title reads "Which brake pads?".

**Verified 31 Oct 2026 (closeout):**
- **H1 Done:** [`scripts/build-find-parts-css.mjs`](../scripts/build-find-parts-css.mjs) preserves `.fill-primary` and `.find-parts-screen-root > .fp-screen-root` scroll margin; vitest guard in [`findPartsCssCoverage.test.ts`](../apps/fleet/src/components/vehicles/find-parts/findPartsCssCoverage.test.ts).
- **H2 Done:** Migrations renamed to production versions `20261101015604`, `20261101022741`, `20261101024022`; `supabase migration list` shows local = remote.
- **ABS / handbrake Done (Roomy seed + stack):** Migration `20261103130100_fleet_find_parts_abs_handbrake.sql` applied; Roomy catalog `3cd9cbf3-a804-4817-82db-400cf6abf13a` has `4-wheel Bosch` / `Rear drum cable`. API: [`vehicle_parts_context.ts`](../supabase/functions/_fleet-server/vehicle_parts_context.ts) + Dominion [`VehicleCatalogEditDialog.tsx`](../apps/admin/src/components/admin/vehicle-catalog/VehicleCatalogEditDialog.tsx) Wheels & Brakes fields. **Deploy fleet-core + admin + fleet** for live FP4 to show values.
- **DB spot-check (prod):** Brakes components — Brake pads 7, Brake shoes / drums 2; `parts_sourcing_requests` count still **0** (Sister flow not exercised in UI yet).

**Rules:** information only, parts only, no customer names or plates in Dominion. Never edit `docs/stitch/`.

---

## H1 · Don't commit the current `findParts.css` change — **Done**
Generator source updated; re-run `pnpm build:find-parts-css` keeps both rules.

## H2 · Migration file names don't match production — **Done**
Repo filenames now match production version stamps (see table in Rev 27 history).

---

## Owner live check

| Step | Status | Notes |
|------|--------|--------|
| 1–3 Roomy → Brake pads → Front 4 / rear none → 4 results | **Owner** | DB has 7 pad SKUs; Roomy front count comes from listings + fit hints — confirm in Fleet UI after deploy. |
| 4 Sister option request | **Owner** | Prod still 0 sourcing rows; tap **Ask Roam to find a Sister option** on FP5. |
| 5 SQL confirm | **Owner** | After step 4: `select vehicle_catalog_id, platform_id, match_type, fit_descriptor, created_at from parts_sourcing_requests order by created_at desc limit 5;` — expect `match_type` **Sister**. |
| 6 Dominion Pending Parts | **Owner** | Expect **1 fleet · Sister option** after step 4. |
| 7 Brake shoes / drums (2 kits) | **DB OK** | Prod query 31 Oct: 2 parts on component. |

**Optional data (Dominion):** ABS channels and handbrake type — **Roomy seeded**; bulk backfill for rest of catalog via Dominion Wheels & Brakes tab (ongoing ops).

---

## Deploy checklist (after merge)

1. Push migration `20261103130100` if not already on branch remote (applied to project `csfllzzastacofsvcdsc` 31 Oct).
2. Deploy **fleet-core** (vehicle-context specs).
3. Deploy **admin** (catalog edit fields).
4. Deploy **fleet** (CSS generator output if changed).
5. Run owner live check steps 1–6 above.
