# Parts Sourcing — Audit (open items only)

**Rev 6 · 2026-10-14** · Closed findings are removed; this lists only what's left.

**Closed since Rev 5:** fleet-ops is **v250** (deployed 2026-10-14, was v249). fleet-core is **v47**. An undo no longer invents shelf stock: usage stores `stock_decremented`, a reversal restores only that, and a short shelf shows a warning on the service save. Reopening a completed log puts the parts back. Air filters, drive belts, oxygen sensors and water pumps are no longer engine rules (0 engine rules; 14 groups set to chassis). Coverage scores 10 real parts and the admin card lists which of them still have no match. Fit suggestions are approved in one locked step. Coverage uses a stored catalog id before it looks the vehicle up. `20261014190000` is recorded. The two remote-only versions `20261014095840` and `20261014095919` are gone from history. The parts CSV test is an explicit CI step. The supplier feed stays off.

The repair command could not log in through the database pooler (`cli_login_postgres` password rejected). History was updated with the same insert and delete that command performs. `parts_tiered_search` is still off.

---

## What's left — in order

| # | Task | Finding |
|---|---|---|
| 1 | Turn on the migration replay trigger only after a green run | P-6 |
| 2 | Re-add air filters, belts, oxygen sensors and water pumps as platform rules after the part numbers are checked | P-3 |
| 3 | Seed platform wear parts: pads, cabin filter, wipers, rotors, shocks | P-4 |
| 4 | Catalog data: family decisions, offers, aftermarket | P-7 |

---

## Open findings

### P-6 — Low — Replay trigger still off

The CSV test is in `ci.yml`. The SQL checks now also cover phantom stock, a short shelf, the 10-part coverage list, and the engine-rule removal. They run inside `verify-migrations-replay.yml`, which is still manual.

A hand run failed before any parts check: https://github.com/DeekiiiiiiiT/Goride/actions/runs/38556917519

`supabase start` stops on the first file, `20260320115742_create_kv_table_37f42386.sql`, because that file begins with a byte-order mark (`syntax error at or near "﻿"`). That run is also the copy of `main` already on GitHub, so it does not include `20261014190000`. The pull-request trigger stays commented out. Do not rename old migrations to force a green replay.

### P-3 — Medium (data) — Body parts have no platform rule yet

The false factory-fit rules are gone. Those parts stay in the catalog so a known number can be looked up, but they will not show as Tier 1 until a checked platform rule exists.

Do not publish a chassis number that has not been checked against a Toyota, Nissan, Honda or Suzuki catalogue. Import checked rows with `fit_scope = chassis` and `target_kind = platform`.

### P-4 — Low (data) — Wear parts are not seeded

The scorecard is now oil filter, spark plugs, thermostat, air filter, cabin filter, brake pads, drive belt, wipers, brake rotors and shocks. Inspections and fluid services stay in maintenance and are no longer required for the 60% switch.

An empty sample matches none of the 10, so the card lists all of them as missing until real vehicles hit a rule. Pads, cabin filters, wipers, rotors and shocks still have no platform rules, so no fleet can reach 60% yet. That is the correct gate. Import those only from a checked catalogue.

### P-7 — Low (data) — Catalog content

| Item | State |
|---|---|
| Platform families | `docs/platform-parent-review.csv`: every `share_body_parts` still blank; 0 parents in prod |
| Offers | 0, so no prices, landed cost or downtime ranking yet |
| Aftermarket | 1 row (Denso oil filter) |
| Platform wear parts | none |

This is Dominion data work. The tools for each are built. Mark a family row yes only when those chassis codes truly share body parts. The gas and hybrid Noah rows stay separate until that yes. Core deposits stay a supplier receivable.

---

## Design rules to keep

- **Tiers:**
  - **1** OEM part on its exact variant, or on its platform or engine when the manufacturer = the vehicle's make.
  - **2** same platform, other nameplate.
  - **3** same engine, powertrain/universal scope only.
  - **4** OE-supplier, aftermarket, reman or used part in the same interchange group.
  - **0** in your stock.
- **Engine rules only for parts that are truly engine-level:** oil filter, plugs, coils, thermostat. Anything shaped by the body, exhaust or accessory layout goes on platform rules.
- **Scope guard** (engine rule ⇒ powertrain/universal) stays a DB trigger.
- **"Confirmed fit"** counts only installs on the same variant / platform / engine.
- **Core deposits** are a supplier receivable. Report them; never post them into driver settlement or fleet finance.
- **Skip** Neo4j, Redis, microservices.

---

## Checks to re-run next review

- `npx supabase functions list`: fleet-ops above v250 only if a newer deploy happened; this round is v250 and fleet-core v47.
- `npx supabase migration list --linked`: `20261014095840` and `20261014095919` absent; `20261014190000` present.
- Prod (`npx supabase db query --linked`):
  - `org_part_stock` still 0, and new rows are not created by reversals
  - rules on `FILT-AIR`, `BELT-SERP`, `ENG-O2` and `ENG-WPUMP` are not `engine_family`
  - coverage missing list shrinks only after checked platform rows are imported
- Replay workflow green on a commit that contains `20261014190000`, then turn on its pull-request trigger.
