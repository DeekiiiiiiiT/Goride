# Roam fuel card statement → Week Reconciliation — audit

**Rev 2 · 14 Nov 2026 · CLOSED — RF-01…RF-08 built, pushed and live (3c07a767, 63e1e50c week_keys fix, 16ac8812 screen cleanup); 11 past statements registered; 21 Sep Roam card shows Received from Roam.** Open: Roam statements for 19 Oct, 26 Oct, 2 Nov not uploaded yet (Roam uploads them in Fleet Admin → Gas cards → Statement import). Screen cleanup done: title Gas cards, Statement week in the review step, Upload statement, history shows Week + Received, duplicate Match pending logs removed (stays on Matched).
Goal in one sentence: **Roam uploads each JAA (Roam-issued gas card) statement once, in Fleet Admin, and every fleet with a Roam card gets its fills and a "received" Roam-card file for every week the statement covers — the fleet never uploads or confirms it.**

Parent: `docs/week-reconciliation-architecture-audit.md` WRA-45 (this audit replaces that finding's fix).

---

## 0. What is true today (read from code + live database, 14 Nov)

**Two fuel-card options (owner rule):**
1. **Roam gas card** — Roam owns the JAA program (company code `00002920`, "Digital Goodys / Roam JAA", mode `roam_managed`), issues cards to fleets, gets one statement for all cards, uploads it. The fleet never handles it.
2. **Own gas card** — the fleet has its own JAA program (`self_serve`) and uploads its own statement.

**Screens:**

| Where | What is there | Works? |
|---|---|---|
| Dominion → Fuel → **JAA card catalogue** (`apps/admin` → `GasCardsPage scope="platform"` → `GasCardsPlatformView`, `packages/platform-ops-ui/src/fleet-customer/GasCardsPage.tsx`) | Catalogue (programs), Register program, **Master CSV** (JAA Raw CSV: `CARD_CODE, TRANS_DATE, AMOUNT`) | Saves each statement row as a fuel fill on the fleet that holds the card (dedupe by JAA receipt number). **Simple version: no driver-log matching.** |
| Fleet Admin → **Gas cards** (`apps/fleet/src/admin/FleetProductAdminPortal.tsx` → `GasCardsPage scope="org"` → `GasCardsOrgView.tsx`) | Cards (issue card to a fleet), Matched, Unmatched, **Waiting on Roam** (`ReconExternalQueuePanel`) | Works, but the **import tab is hidden in this scope** (tabs filter, `GasCardsOrgView.tsx` ~688). The fuller import (saves rows **and** runs `runJaaGasCardMatch` against driver fuel logs) lives in this file and is reachable from nowhere. |
| Week Reconciliation → Upload inputs → **Roam-issued fuel card statement** card (`ReconSourcesStep.tsx`) | Remind Roam · Upload statement (staff with `recon.external_sources`) · No activity | Upload opens the **fleet's own** fuel-card modal (one org, different reader). |

**Live data:**
- 11 Master CSV imports (`kv jaa_csv_import:*`), one per week, **3 Aug → 12 Oct 2026**, all `completed`, all rows on the owner's fleet (card `00002920RN2783`, rental). Week of 21 Sep: import `7169e1ea…`, 7 fills, J$35,000, uploaded 5 Oct.
- **Zero** `fleet.import_batches` rows with `source_id = 'fuel_card_roam'`. So every Roam-card week shows "Waiting on Roam · overdue" although Roam uploaded it.
- Weeks 19 Oct, 26 Oct, 2 Nov have no Roam statement uploaded yet.

---

## 1. Findings (one fix each)

**RF-01 — Critical — The statement upload never tells Week Reconciliation.**
`POST /fuel/jaa-csv-imports` only writes the import record; nothing writes the `fuel_card_roam` batch that `recon._week_statement_received` looks for.
**Fix:** when the import is saved as `completed`, the server registers the Roam-card file for **every fleet that holds a card on a `roam_managed` program**, for **every week the statement covers**: one `ensureReconImportBatch` per fleet+week (`source_id 'fuel_card_roam'`, coverage Mon–Sun, `rows_committed` = that fleet's fills that week, may be 0), then queues each fleet's week recalculation (`queueWeekDeskRefresh`). Runs on the server with the service client (staff act across fleets). Repeat-safe by semantic key `fuelroam:<org>:<week>`.

**RF-02 — High — The import has no statement period.**
Fill dates do not say which days the statement covers (21 Sep file: fills on 24–26 Sep only), so "covered" can't be worked out from the rows.
**Fix:** the import step asks for **Statement week(s)** — Monday-to-Sunday weeks, pre-filled from the rows' dates (Monday of the first fill → Sunday of the last fill), editable before saving; saved on the import record as `statementWeeks: string[]`. Only whole weeks count; a fill outside the chosen weeks is shown as a warning row and still saved.

**RF-03 — High — Deleting an import leaves the weeks "received".**
`DELETE /fuel/jaa-csv-imports/:id` removes fills but not the Roam-card files.
**Fix:** delete also supersedes that import's `fuel_card_roam` batches and queues the recalculation; a week still covered by another import stays received.

**RF-04 — High — The upload is in the wrong app, and the good version is unreachable.**
Rule: Dominion is master data only; fleet transactions are app data (`dominion-master-data-rule`).
**Fix:** Fleet Admin → Gas cards gets a **Statement import** tab (the existing full import in `GasCardsOrgView`: save rows + driver-log matching + RF-02 weeks). Dominion → JAA card catalogue keeps **Catalogue + Register program only**; its Master CSV pane and `GasCardsPlatformView` import code are deleted (no legacy copy).

**RF-05 — High — Which option a fleet uses is guessed, and the two checks disagree.**
Wizard (`recon_routes.ts` ~260): any `fleet_fuel_cards` row ⇒ Roam card; own card ⇒ KV `jaa_program` with `organizationId` + `self_serve`. Close check (`week_close_recon.ts` ~117): own card hard-coded `false`.
**Fix:** one shared function `fuelCardProgramsForOrg(orgId)` → `{ roam: boolean, own: boolean }` from the fleet's cards joined to their program by `jaaCompanyCode` (`roam_managed` ⇒ roam, `self_serve` ⇒ own). Both the wizard and the close check use it.

**RF-06 — High — The fleet is asked to act on Roam's file.**
The week page shows Upload statement and No activity on the Roam-card file; the upload goes through the fleet's own modal (one fleet, could save the 7 fills twice).
**Fix:** the Roam-card file is **read-only "From Roam"** on the week page: "Waiting on Roam's statement for this week" (+ Remind Roam) or "Received from Roam · N fills · J$X". No Upload, no No activity — for everyone. Server: `attest_none` / upload register for `fuel_card_roam` from the week page are refused (`ROAM_SOURCE`); only the RF-01 path writes it. Waive (approver) stays for a real emergency.

**RF-07 — Medium — "Waiting on Roam" points at a tab that does not exist.**
**Fix:** after RF-04 the panel's text and a button **Open Statement import** take staff to the new tab with the waiting week pre-selected.

**RF-08 — High — 11 statements already uploaded are not registered.**
**Fix:** one-time backfill: for each `jaa_csv_import` record, statement week = Monday of its fills' dates (all 11 are single-week files: 3 Aug, 10 Aug, 17 Aug, 24 Aug, 31 Aug, 7 Sep, 14 Sep, 21 Sep, 28 Sep, 5 Oct, 12 Oct); set `statementWeeks` on the record and run the RF-01 registration. Done by a server route Roam staff press once ("Register past statements"), not hand SQL.

---

## 2. Database / Server / Screens / Gates

**Database:** no new table. `fleet.import_batches` rows (`source_id 'fuel_card_roam'`), `kv jaa_csv_import:*` gains `statementWeeks`.

**Server (`_fleet-server`):**
- `fuel_controller.tsx` `POST /jaa-csv-imports` → RF-01 registration when `status = completed`; `DELETE /jaa-csv-imports/:id` → RF-03.
- New `POST /jaa-csv-imports/register-past` (platform staff) → RF-08.
- New `fuel_card_programs.ts` → RF-05, used by `recon_routes.ts` and `week_close_recon.ts`.
- `recon_routes.ts` attest / `recon_import_routes.ts` register → refuse `fuel_card_roam` (RF-06).

**Screens (existing look — no new Stitch screen):**
- Fleet Admin → Gas cards: + **Statement import** tab (RF-04, RF-02 week picker); Waiting on Roam button (RF-07); one-time "Register past statements" button on the import tab while any import has no `statementWeeks`.
- Dominion → JAA card catalogue: remove Master CSV (RF-04).
- Week Reconciliation → Upload inputs: Roam-card file read-only (RF-06).

**Every button touched:** Statement import · Choose file · Statement week(s) picker · Save import · Register past statements · Open Statement import (Waiting on Roam) · Remind Roam (unchanged) · Waive (approver, unchanged) · removed: Upload statement + No activity on the Roam-card file, Dominion Master CSV.

---

## 3. Done-tests (write first; each must fail before the build)

- **DT-1** Fleet Admin: import the real `Sept 21 - Sept 27.csv` again → 0 new fills, 7 duplicates skipped, weeks = 21 Sep; the owner's 21 Sep week shows Roam-card file **Received from Roam · 7 fills · J$35,000**.
- **DT-2** A second fleet holding a Roam card with **no fills** that week → its Roam-card file is also **received** (0 fills).
- **DT-3** A fleet with only an own-card program → no Roam-card file at all; own-card file stays a fleet upload.
- **DT-4** A week not in any statement → stays **Waiting on Roam** and is listed in Fleet Admin → Waiting on Roam.
- **DT-5** Delete the import → that week goes back to Waiting on Roam.
- **DT-6** Fleet user (and staff) on the week page: no Upload / No activity on the Roam-card file; the server refuses both with `ROAM_SOURCE`.
- **DT-7** Wizard and Close week agree on Roam / own card for the same fleet (RF-05).
- **DT-8** Register past statements → all 11 weeks 3 Aug–12 Oct received; pressing it again changes nothing.
- **DT-9** Dominion JAA card catalogue has no Master CSV.

---

## 4. Order of work

1. Server: RF-05 → RF-01 + RF-03 → RF-08 route → RF-06 refusals (+ Deno tests DT-2/3/5/6/7/8).
2. Screens: RF-04 + RF-02 + RF-07 (Fleet Admin), RF-06 (week page), RF-04 (Dominion) (+ vitest).
3. Push → owner presses **Register past statements** → owner refreshes the 21 Sep week (DT-1) → continue 21 Sep.
