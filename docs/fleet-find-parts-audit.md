# Roam Fleet · Find parts + Dominion Pending catalog (parts) — audit (Rev 26, 2 Nov 2026)

**This is the only doc for this work.** Open items: **none**.

**Rules:** information only, parts only, no customer names or plates in Dominion. Never edit `docs/stitch/`.

---

## Closeout (2 Nov 2026)

### F1 — Done · Merge duplicate Brake pads
- Migration [`20261102120000_fleet_find_parts_f5_merge_brake_pads.sql`](../supabase/migrations/20261102120000_fleet_find_parts_f5_merge_brake_pads.sql) applied on project `csfllzzastacofsvcdsc`.
- Duplicate row `f5a10001-…-0001` removed; canonical `a1000000-…-000a` (`op_code` BRK-PADS) holds **7** pad rows; **Brake shoes / drums** (`f5a10001-…-0002`) still holds **2** shoe kits.
- Post-check: exactly **one** “Brake pads” under Brakes; duplicate-name guard in migration.

### F2 — Done · Repo + deploy
- Git: `4b2226db` on `main` — find-parts UI, pending-parts CSS, F5 + F1 migrations, fleet-core routes.
- **fleet-core** redeployed (smoke passed).
- **Fleet** production: [roamfleet.co](https://roamfleet.co) — deployment `dpl_GG74WSy1jJDP8PGnWNTJV8YZ7hBB` (commit `4b2226db`).
- **Dominion** production: [roamdominion.co](https://roamdominion.co) — deployment `dpl_54J37eT4ddAkSyJQvX9PvnGJa3bY` (CLI `--archive=tgz` from monorepo root).

### F3 — Done · FP4 labels
- Title: `Which brake pads?` via `fp4PageTitle()` in [`findPartsBuildFp4.ts`](../apps/fleet/src/components/vehicles/find-parts/findPartsBuildFp4.ts).
- Diagram overlay shows full `diagramBadge` (e.g. `FRONT · BOTH SIDES / REAR · BOTH SIDES` when **Both** axle selected) in [`Fp4Screen.tsx`](../apps/fleet/src/components/vehicles/find-parts/screens/Fp4Screen.tsx).
- Playwright: `FP4 position at 1440px` passes.

---

## Owner smoke (live), after deploy

Run once while logged into Fleet and Dominion:

1. Roomy → Common parts → **Brake pads** → **Next** enabled.
2. Which side? → Front **4 on file**; Back **None on file yet** (rear shoes under **Brake shoes / drums**).
3. Results → **4 front pad sets**.
4. “Same car, different badge” → **Ask Roam to find a Sister option** → confirm row:
   ```sql
   select vehicle_catalog_id, platform_id, match_type, fit_descriptor, created_at
   from parts_sourcing_requests order by created_at desc limit 5;
   ```
5. Dominion → Pending catalog → **Parts** → **“1 fleet · Sister option”** (after step 4).
6. Fleet → Brakes → **Brake shoes / drums** → **2 rear kits**.

**Optional data (Dominion):** ABS channels and handbrake type still blank until entered in catalog.

---

## Verified baseline (still true)

- Migration `fleet_find_parts_f5_brake_components` applied before F1 merge.
- Full-length part pictures on file.
- Which side? uses real brake specs from `vehicle_catalog` where present.
