# Parts Sourcing — Audit (open items only)

**Rev 7 · 2026-10-14** · Closed findings are removed; this lists only what's left.

**Code and the filing fix are done.** Brake rotor sits under Brakes and the shock absorber sits under Suspension on the live database. Unconfirmed part numbers do not raise coverage. Coverage is still 0% because no number has been confirmed. Tiered search stays off.

**Checks:** a fresh database replayed through the parts migrations on 2026-10-14, and `supabase/tests/parts_rev2_checks.sql` passed. That check now runs on pull requests that touch the parts migrations. The full-stack replay workflow stays manual.

---

## What's left — in order

| # | Task | Item |
|---|---|---|
| 1 | Confirm or type the missing coverage numbers for the Roomy and the Fit | Q-2 |
| 2 | Decide which chassis share body parts, and enter real supplier quotes | Q-3 |
| 3 | Turn on tiered search for one fleet once its coverage is at least 60% | Q-5 |

---

## Open items

### Q-2 — Medium (data) — Coverage is still 0%

The only live fleet is deekiiiiiii's Fleet: a Toyota Roomy (M900A, 1KR-FE) and a Honda Fit (GP5, LEB). A vehicle needs all ten coverage parts. Nothing is confirmed, so the 60% gate stays shut.

The Parts sourcing page already asks for each gap:

- Roomy oil filter and spark plug: confirm the seeded number. They follow the engine.
- Roomy air filter and water pump: attach the seeded number to M900A after you confirm it.
- Every other Roomy gap, and every Fit gap: type the maker and the number from their catalog.

Do not guess a number. A guessed number would make the gate lie.

### Q-3 — Medium (data) — Catalog content needs a human

- The seeded part numbers are still marked not checked. Confirm or reject them on the Parts sourcing page before a fleet relies on them.
- Platform families are still blank. The page already says which pairs stay separate. Mark “these share body parts” only when you know they do.
- Offers are still empty, so there are no prices, landed cost, downtime ranking, or core returns. Enter a real supplier quote. Live supplier search stays off until a Jamaican or JDM feed exists.

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
