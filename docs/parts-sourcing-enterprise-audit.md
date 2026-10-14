# Parts Sourcing — Audit (open items only)

**Rev 6 · 2026-10-14** · Closed findings are removed; this lists only what's left.

**Code is done.** Every code finding from Rev 1–5 is closed and live. What's left is one small data slip in the Rev 4 migration, catalog content, and making the SQL checks run on their own.

**Live state (verified 2026-10-14):**
- Migrations through `20261014190000` are applied, and parts migration history is clean.
- fleet-ops **v251** and fleet-core **v48** were deployed 06:35 CDT, matching the last commit with server changes. The later commit only strips BOMs from old migrations.
- No `anon` / `authenticated` EXECUTE on any parts function.
- Deno 11/11, CSV vitest 1/1 (now in `ci.yml`), fleet `tsc` 501 (baseline), and `deno check` is clean on the parts routes.
- `parts_tiered_search` is off everywhere.

---

## What's left — in order

| # | Task | Item |
|---|---|---|
| 1 | Move Brake rotor / Shock absorber under the right system | Q-1 |
| 2 | Seed the five missing coverage parts + platform rules for air filter and belt | Q-2 |
| 3 | Verify seeded part numbers; decide platform families; add offers | Q-3 |
| 4 | Run the SQL checks automatically | Q-4 |
| 5 | Turn on tiered search for one fleet once its coverage ≥ 60% | Q-5 |

---

## Open items

### Q-1 — Low — Brake rotor and shock absorber are filed under Engine

`20261014190000_parts_sourcing_rev4.sql:293-303` inserts `BRK-ROTOR` and `SUS-SHOCK` with `parent_id` = the **Engine** system (`…000000000001`) and the oil icon. Prod confirms both sit under `sys_engine`. In the maintenance log picker they appear under Engine, and repeat alerts and reports group them there.

**Fix:** in a new migration, set the parents and icons:
- `BRK-ROTOR` → Brakes system `b1000000-0000-4000-8000-000000000004`, icon `brakes`.
- `SUS-SHOCK` → Suspension system `b1000000-0000-4000-8000-000000000008`, icon `suspension`.

### Q-2 — Medium (data) — Coverage is still 0%; the gate can't open

The coverage list is now ten real parts, but in prod:

| Component | Parts | Rules | Note |
|---|---|---|---|
| ENG-OIL / ENG-SPARK / ENG-THERM | 9 / 8 / 2 | engine | ✅ covered for seeded engines |
| FILT-AIR / BELT-SERP | 8 / 1 | **none** | Engine rules correctly removed; platform rules not added yet |
| BRK-PADS, BRK-ROTOR, HVAC-CABIN, LGT-WIPER, SUS-SHOCK | **0** | — | nothing seeded |

A vehicle needs all ten, so every fleet stays at 0%, and the per-fleet switch will refuse to turn on.

**Fix:**
- Add **platform** rules (`fit_scope = chassis`) for the air filters and belt, per verified chassis.
- Seed pads, rotors, cabin filter, wipers and shocks per platform, starting with the chassis your fleets actually run.
- The admin coverage panel's `missing` / `missingOpCodes` lists show exactly which ones each fleet lacks.

### Q-3 — Medium (data) — Catalog content needs a human

- **Part numbers unverified:** the 36 seeded part numbers haven't been checked against the makers' parts catalogues. Verify them before fleets rely on Tier 1.
  - The O2-sensor and water-pump parts now have no rules, so they're invisible until each gets a verified platform rule.
- **Platform families:** `docs/platform-parent-review.csv` still has every `share_body_parts` blank, and prod has 0 parents. Decide each row, then apply it in admin.
- **Offers:** 0, so no prices, landed cost, downtime ranking or core returns yet.
- **Aftermarket:** 1 row (Denso oil filter).

### Q-4 — Low — SQL checks only run by hand

`supabase/tests/parts_rev2_checks.sql` covers tiers, vehicle year, the scope guard, the importer, usage retry, repeat alerts and dismiss. It only runs in `verify-migrations-replay.yml`, which is `workflow_dispatch` only.

**Fix:** run it once by hand to confirm it's green, then switch on the workflow's PR trigger, or move the parts check into a job that doesn't need the full replay.

### Q-5 — Rollout

Once a fleet passes 60%, use the admin per-fleet switch. Compare its tiered results against the legacy list for a week before turning on a second fleet. The supplier price adapter stays off until a Jamaican or JDM vendor feed is confirmed.

---

## Design rules to keep

- **Tiers:**
  - **1** OEM part on its exact variant, or on its platform or engine when the manufacturer = the vehicle's make.
  - **2** same platform, other nameplate.
  - **3** same engine, powertrain/universal only.
  - **4** OE-supplier, aftermarket, reman or used part in the same interchange group.
  - **0** in your stock.
- **Engine rules only for engine-level parts** (oil filter, plugs, coils, thermostat). Air filters, belts, O2 sensors and water pumps go on platform rules.
- **Scope guard** (engine rule ⇒ powertrain/universal) stays a DB trigger.
- **Stock moves only by what was actually taken** (`stock_decremented`). Reversals never create a shelf row.
- **"Confirmed fit"** counts only installs on the same variant / platform / engine.
- **Core deposits** are a supplier receivable. Never post them into driver settlement or fleet finance.
- **Skip** Neo4j, Redis, microservices.

---

## Checks to re-run next review

- `npx supabase migration list --linked`: no remote-only parts versions.
- `npx supabase functions list`: fleet-ops / fleet-core deployed after the last commit that touched `_fleet-server/`.
- Prod (`npx supabase db query --linked -f …`):
  - `BRK-ROTOR` / `SUS-SHOCK` parents
  - parts per coverage component
  - rules on `FILT-AIR` / `BELT-SERP`
  - offers
  - platform parents
  - `org_part_stock` rows
  - no client EXECUTE on parts functions
- Coverage % per fleet in admin.
- Deno 11/11 · CSV vitest · fleet `tsc` 501.

*Not parts:* migration history also shows `20261013170000` (local only) vs `20261013230511` (remote only) for `console_stats_and_identity_page`. That belongs to the Rush console audit.
