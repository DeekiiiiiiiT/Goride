# Roam Fleet · Find parts + Dominion Pending catalog (parts) — audit (Rev 25, 1 Nov 2026)

**This is the only doc for this work.** It lists open items only.

**Verified 1 Nov:**
- fleet-core v196 and platform-catalog v159 are live with the new request code.
- Migration `fleet_find_parts_f5_brake_components` is applied.
- Tests pass: 18 vitest, 29 Deno.
- Full-length pictures exist.
- Which side? shows distinct axle names, real brake data (disc/drum, 255 mm, 4x100 from `vehicle_catalog`) and "None yet" where data is missing.

**Rules:** information only, parts only, no customer names or plates in Dominion. Never edit `docs/stitch/`.

---

## F1 — High · There are now two "Brake pads" part types, and the Roomy's pads are in the wrong one
The F5 migration created a new "Brake pads" (`f5a10001-…-0001`) instead of using the existing one (`a1000000-…-000a`). Both sit under Brakes:
- **The original** (used by the Common parts tile and existing links) now has only 2 pads for other cars (04465-B1320, P 16 013).
- **The new one** has the Roomy's 4 front pads (04465-B1190 ×2, AN-754WK, BP25562, PN5562).

**Result:**
- Common parts → Brake pads finds **no** pads for the Roomy.
- The Brakes area lists "Brake pads" twice.

**Fix:** a follow-up migration that:
- moves every part from `f5a10001-…-0001` to `a1000000-…-000a`;
- points any listings or requests at it;
- deletes `f5a10001-…-0001`.

Keep "Brake shoes / drums" (`f5a10001-…-0002`, holds the 2 rear shoe kits) as it is. Add a check that no two part types under one area share a name.

## F2 — High · Commit and deploy the sites
- **Uncommitted, but partly live.** 25 files are uncommitted (find-parts, Dominion pending-parts, server routes, tests, pictures). Production servers were deployed from this uncommitted code, so the repo is behind production.
- **Old sites.** The fleet site is still on the 31 Oct build, and the Dominion site still needs the new pending-parts screens.

**Fix:** commit, push, then deploy the fleet site and the Dominion site.

## F3 — Low · Two small labels on Which side?
- **Drawing label.** With **Both** chosen, the label still reads "FRONT · BOTH SIDES". It should read "FRONT + REAR · BOTH SIDES" (or each axle's own side when they differ).
- **Title capitals.** The title reads "Which Brake pads?". It should read "Which brake pads?" (lower-case the part name inside the sentence).

---

## Last step (owner), after F1–F2
1. Roomy → Common parts → **Brake pads**: Next turns on.
2. Which side? shows Front 4 on file. Back shows "None on file yet", because the rear shoes are now under "Brake shoes / drums".
3. Results show the 4 front pad sets.
4. In "Same car, different badge", press "Ask Roam to find a Sister option". Then check in the database:
   ```sql
   select vehicle_catalog_id, platform_id, match_type, fit_descriptor, created_at
   from parts_sourcing_requests order by created_at desc limit 5;
   ```
5. Dominion → Pending catalog → Parts shows "1 fleet · Sister option".
6. Back in Fleet: Brakes → **Brake shoes / drums** shows the 2 rear kits.

**Optional data (Dominion):** ABS channels and handbrake type are blank for every car; enter them when you have them.

## Prompt to paste into the builder
```
Read docs/fleet-find-parts-audit.md. Fix F1 with a follow-up migration (merge the
duplicate Brake pads into a1000000-…-000a), fix F3, then commit, push, and deploy
the fleet and Dominion sites (F2). Walk the Last step on the live site.
```
