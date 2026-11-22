# Fuel — Enterprise Audit (plan)

**Rev 2 · 21 Nov 2026 · Status: DRAFT for review round 1.** Rev 2: forward only (owner) — nothing here changes an already reconciled week; F-02 (re-working closed weeks) removed. New audit, its own file (asked 14 Nov 2026; parked in `docs/week-reconciliation-architecture-audit.md` → "Next audits"). Method: `docs/how-we-build-playbook.md` (Data → Server → Screens → Tests; one chosen fix per finding; done-tests before building; review round 1 → Stitch screens → review round 2 → build).

---

## START HERE

**One sentence:** every week, each fuel dollar the fleet spends ends with the right person paying it, by a rule the owner set and can trace line by line, from the fills the driver scanned.

**Today in one paragraph:** the driver scans the odometer, then the pump, at every fill (gas card or cash from earnings). Week Reconciliation step 5 works out the week per car: kilometres by purpose (Uber trips, driving to pickups, personal, company errands), a cost for each purpose, and the company / driver split from the fleet's Fuel Policy rule. It then locks the week and writes the driver's fuel charge into settlement. The engine is `packages/fuel-core` (`fuel-chain-v2.2`, ~15,800 lines); the server is `supabase/functions/_fleet-server/fuel_*`; the week rows are `public.fuel_reconciliation_period` and `public.fuel_week_snapshot`.

**Scope:** (1) the whole fuel system, (2) the **Fuel Policy** section (Fleet Policy Configuration → Rules / Schedule), (3) **Telematics later**: built so real litres and odometer from a tracker can replace the estimates without a rebuild. Tolls are not in scope (done: `docs/toll-architecture-gap-audit.md`).

**Who:** one fleet company today (Kenny Gregory Rattray, Toyota Roomy 5179KZ). Every finding is written for every company.

**Forward only (owner, 21 Nov 2026):** this audit never touches legacy data. Every week already reconciled (locked or closed, up to and including the week of 9 Nov 2026) keeps its numbers, its snapshot, its statements and its fill records exactly as they are: no re-working, no corrections, no back-filled lines, no relinking of old fills. The new rules start with the first week not yet locked when they go live, and apply to fills from that week on.

**Rules this plan keeps:** the driver's scan is the evidence (no receipts); a locked or closed week's numbers never change; every money line must be traceable to a rule and a fill.

---

## Part A — What the live data shows (read 21 Nov 2026; findings only — these weeks stay as they are)

**A1. Nine weeks of Kenny's fuel (Rideshare), from `fuel_reconciliation_period`:**

| Week | Spend | Company | Driver | Company + driver vs spend | Gap ("unexplained") | Gap reviewed before lock |
|---|---|---|---|---|---|---|
| 14 Sep | 30,343.70 | 27,676.92 | 2,666.78 | 100.0% | +3,624.88 | yes |
| 21 Sep | 31,000.00 | 27,718.03 | 3,281.97 | 100.0% | −1,815.04 | **no** |
| 28 Sep | 28,000.00 | 25,243.31 | 2,756.69 | 100.0% | +1,063.57 | yes |
| 5 Oct | 28,350.00 | 25,270.51 | 3,930.38 | **103.0%** | −4,044.44 | **no** |
| 12 Oct | 19,000.00 | 17,191.88 | 1,808.12 | 100.0% | 0.00 | no (none needed) |
| 19 Oct | 27,650.00 | 24,567.70 | 3,082.30 | 100.0% | −38.47 | **no** |
| 26 Oct | 29,000.00 | 25,135.89 | 3,864.11 | 100.0% | +797.54 | yes |
| 2 Nov | 23,000.00 | 21,020.74 | 1,979.26 | 100.0% | +954.93 | yes |
| 9 Nov | 28,800.00 | 27,430.70 | 4,081.36 | **109.4%** | −3,122.62 | **no** |

**A2. Car economy, fill to fill (5179KZ, `fleet.fuel_entries`, card fills counted once):** 11.3 · 11.8 · 13.8 · 12.4 · 11.5 · 12.0 · 11.7 · **13.7** km/L (weeks of 21 Sep → 9 Nov). The engine prices km at the car's *usual* economy (`referenceKmPerLiter`, rolling); in 9 Nov's snapshot the per-fill "efficiency" ranges from 9.8 to 15.8 km/L.

**A3. How 9 Nov was priced (snapshot `money`):** Uber trips 1,617 km → J$27,791.44; to pickups 212 km → J$3,720.62; personal 0; commute J$410.56; "miscellaneous" **−J$3,122.62**. Trips + pickups = J$31,512.06 against J$28,800 bought. The snapshot itself notes: *"Trip GPS km (2,079) exceeds odometer km (1,821) by >5% — deadhead/personal split is unreliable."*

**A4. Kenny's rule** (`fuel_scenario:86c2f765…`, "Standard Fleet Rule (Auto-Generated)", stored in the shared key-value table `kv_store_37f42386` next to other companies' rules): company covers Uber trips 80%, pickups 50%, personal 0% (driver pays all), company errands 100%, other 50%. At the engine's prices that is about J$5,558 + J$1,860 = **J$7,418** for the driver; the week charged **J$4,081.36**. The screen does not show how the charge comes from the rule.

**A5. Fill records:** every gas-card fill exists twice: a scanned `Manual_Entry` and the card statement's `Card_Transaction` with the same odometer (the engine de-duplicates; reports must too). Two card fills on **18 and 19 Nov** are stored at **J$0.00 with no litres** (scanned, waiting for the card statement). 8 → 10 Nov shows **429 km with no fill** (Kenny's usual is 185–340 km between fills).

**A6. Locking:** 9 Nov was locked with its gap unreviewed. Once locked, the gap review is refused (`period_locked`), so step 5 could not complete. The lock did not write Kenny's fuel week statement (`ledger.week_statements` kind `fuel`); the close check then raised `FUEL_STATEMENT_MISSING`.

---

## Part B — Problems found (each with one fix)

| # | Problem | Fix |
|---|---|---|
| **F-01** | **The engine charges for fuel that was never bought.** Every km is priced at the car's *usual* economy × the real price per litre. When the car does better than usual (5 Oct, 9 Nov), the purposes add up to more than was spent (103%, 109.4%) and the driver's share is worked out on money that was never spent. When it does worse, the gap goes to "unexplained". | **Price from the real spend.** Per car per week: cost per km = fuel bought ÷ odometer km. Each purpose = its km × that cost per km, so the purposes always add up to exactly what was bought. "Usual economy" is kept only as a **check** (flag F-08), never as money. "Over-explained" stops existing as money; "unexplained" becomes only km nobody can explain. Bump `FUEL_ENGINE_VERSION`. |
| **F-02** | **Closed weeks were charged on these prices** (5 Oct ≈ J$204 over, WRA-58). | **Not re-worked (owner, forward only).** Closed weeks keep their figures; F-01 applies from the first week not yet locked. |
| **F-03** | **The driver's charge can't be traced to the rule.** 9 Nov: the rule on screen gives ≈ J$7,418, the week charged J$4,081.36, and no screen shows the steps between. Fuel money lives in one JSON bundle per week (`fuel_week_snapshot.money`), not in lines like tolls v2. | **Fuel lines.** Locking writes one line per car × purpose: km, cost per km, the rule's driver %, and the driver amount. The driver's charge is the sum of their lines and nothing else. Lines are written once at lock and kept; a reopen marks them reversed and a re-lock writes new ones (same pattern as `toll.allocations` / `ledger.entries`). Step 5 and Driver Settlements show these lines. |
| **F-04** | **A week can lock with its gap unreviewed, and then the review is refused** (9 Nov; 21 Sep, 5 Oct and 19 Oct are locked unreviewed too). | Lock refuses while a gap above J$1 is unreviewed ("Review the gap first"). The gap review stays possible on a locked week as a note only (it never changes money). |
| **F-05** | **Locking can leave the driver without a fuel statement** (9 Nov), so the week close blocks on `FUEL_STATEMENT_MISSING`. | Lock writes the driver statements in the same step as the lock. If a statement can't be written, nothing locks and the screen says which driver failed. |
| **F-06** | **Locked weeks are re-judged by today's rules** (WRA-49): an old locked week shows "Numbers don't balance". | A locked week shows only what was saved at lock (its lines, F-03, and its engine version). No screen re-runs the engine on a locked week. |
| **F-07** | **Each gas-card fill is stored twice** (scan + card line, same odometer). | One fill per real fill. A card statement row **attaches** to the scanned fill (same car, same day, odometer / amount within tolerance) instead of adding a second fill. Only fills in weeks not yet locked are linked; fills in reconciled weeks stay as stored. A card line with no scan stays its own fill, flagged "no scan". |
| **F-08** | **A fill the driver didn't scan is invisible** (8 → 10 Nov: 429 km with no fill). | Flag **"Possible fill not scanned"** on a stretch longer than the car's range at its usual economy and tank size, or when the week's economy is more than 15% better than its usual. The flag names the stretch (dates, odometer from → to). The owner either adds the fill (date, amount, odometer) or closes the flag with a note. Neither changes money by itself. |
| **F-09** | **Card fills sit at J$0.00 until the card statement arrives** (18 and 19 Nov). | A scanned card fill with no amount shows as **"Waiting for the card statement"**. The week can't lock while one is waiting. When the statement arrives, its line attaches to the fill (F-07). |
| **F-10** | **Uber's trip km can exceed the odometer** (9 Nov: 2,079 vs 1,821 km), which makes the pickup / personal split unreliable. | The odometer is the total. Trip km are capped to the odometer distance; the cap is shown on the week ("Uber's km were 258 km more than the odometer; trip km capped at 1,821"). |
| **F-11** | **The Fuel Policy rule lives in a shared key-value table** next to other companies' rules, with no history. Weeks don't record which version of the rule they used. | Rules move to proper tables, one company per row, with "applies from" dates; the first version is today's rule, applying from the first week not yet locked. Each week locked from then on records the rule version it used. Changing a rule never changes a locked week. |
| **F-12** | **"Change the leftover split for this week" appears when there is nothing to split** (over-explained weeks), and saving it then charges J$0. | After F-01 there is no over-explained case. The section shows only when a week has km nobody can explain, and it says how much is there. |
| **F-13** | **Nothing tracks the estimate's gap week to week** (economy drift, fills not scanned, km gaps). | The week list shows each car's economy (km/L) per week, against its usual, with F-08 flags. A car outside ±15% three weeks running raises an alert. |
| **F-14** | **Telematics can't plug in later without a rebuild** ("Coming soon" card). | Every km and litre carries where it came from: `scan`, `card_statement`, `platform` (Uber km), `manual`, or later `telematics`. The engine takes the best source per car per week. Adding a tracker later means adding a source, not changing the money rules. Nothing is built for a tracker now. |

---

## Part C — Data

- **Fills:** one row per real fill (F-07), with the car, driver, when, odometer, litres, amount, payment (card / cash from earnings), `source` (F-14), and the attached card statement line if any. The scan photos stay as evidence.
- **Fuel lines** (F-03): new table (weeks locked after go-live only; no lines are back-filled for reconciled weeks), one row per car × purpose × locked week: km, cost per km, the rule's driver %, the driver amount, the company amount, the rule version (F-11), the engine version, and `reversed_by` for reopens. Rule: a week's lines add up to exactly that week's fuel bought (check fails otherwise).
- **Fuel rules** (F-11): one row per company per rule version, with "applies from". Moved out of `kv_store_37f42386`; the key-value copy is read once by the migration and kept unchanged as history.
- **Flags** (F-08, F-09, F-10, F-13): one row each, with what it found and how it was closed (fill added / note).
- **Checks that fail if broken** (weeks locked after go-live): company + driver = fuel bought for every locked week; every locked week has driver statements; every locked week has lines; no fill is counted twice; a locked week's lines never change.

## Part D — Server

- Engine `fuel-chain-v3`, used only for weeks not yet locked (a reconciled week is never re-run, F-06): spend-based pricing (F-01), odometer cap (F-10), source per km / litre (F-14), flags (F-08, F-13).
- **Lock** (one step): refuses on an unreviewed gap (F-04), a fill waiting for its card statement (F-09) or an open "fill not scanned" flag; writes lines (F-03) and driver statements (F-05) together; records rule and engine versions.
- **Reopen**: marks the lines reversed and writes the reversal into the open week, as today.
- **Card statement import**: attaches to scanned fills (F-07, F-09).
- **Fuel rules**: read / save with "applies from" (F-11).
- Each action has a test.

## Part E — Screens

Screens to design in Stitch after review round 1 (look only; content from this plan):
1. **Step 5 Fuel, week view:** per car, km by purpose, cost per km (from the real spend), the driver's lines and total, flags.
2. **"Possible fill not scanned"** card (F-08): the stretch and the two actions, Add fill / Close with a note.
3. **"Waiting for the card statement"** row (F-09).
4. **Driver Settlements → fuel lines** for a week (F-03).
5. **Fuel Policy → Rules** with "applies from" and history (F-11).
6. **Car economy by week** (F-13).

## Part F — Done-tests (plain words, written before building)

1. The first week after go-live, a car that bought J$28,800: company + driver = J$28,800.00 exactly; no over-explained; Kenny's charge is the sum of his lines and each line shows km × cost per km × 20% or 50%.
2. A car beats its usual economy by 15% → nobody is charged for fuel that wasn't bought; a "fill not scanned" flag appears on the longest stretch.
3. 8 → 10 Nov (429 km, no fill) → the flag names 8 Nov 196,429 km → 10 Nov 196,858 km. Adding a J$4,000 fill on 9 Nov closes it and the week re-works.
4. Lock with an unreviewed J$500 gap → refused "Review the gap first"; after the review it locks and Kenny's fuel statement exists.
5. Lock when a statement can't be written → nothing locks; the screen names the driver.
6. A card statement line for 10 Nov J$5,000 at 197,043 km → attaches to the scanned fill; the week counts J$5,000 once.
7. 18 Nov scanned card fill with no statement yet → "Waiting for the card statement"; the week can't lock; the statement arrives → priced, lock allowed.
8. Uber km 2,079 vs odometer 1,821 → trip km capped at 1,821 with the note.
9. Change the rule from 20% to 25% "applies from 23 Nov" → weeks before 23 Nov keep 20%; their lines don't change.
10. Go-live → every week up to 9 Nov 2026 shows exactly the same numbers, statements and fills as before; no correction and no new line exists for them.
11. Reopen a locked week → its lines are reversed in the open week; re-lock writes new lines; the closed weeks' figures are unchanged.
12. A second company with its own rule → its weeks use only its rule.

---

## Part G — Owner questions (working default until answered)

| # | Question | Working default |
|---|---|---|
| Q1 | Tank size for the Toyota Roomy (for F-08's range check)? | 36 L until the car record has it (from memory, not checked against Toyota's spec). |
| Q2 | The car has an **Amber Connect** GPS tracker (expense "Vehicle GPS"). Can it give odometer / trips through an API? (F-14 later) | Not used now; F-14 keeps the door open. |
| Q3 | Personal km: today the week shows 0 km personal. Should the driver mark personal driving in the driver app, or does it come only from km nobody can explain? | Only from km nobody can explain (as today). |
