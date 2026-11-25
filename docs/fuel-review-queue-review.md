# Fuel Review Queue — full review

**Rev 2 · 25 Nov 2026 · Roam Fleet `/fuel-reimbursements`**

Goal: the Review Queue is the one place where a fleet person approves or rejects a driver's fuel fill. Every fill there must be easy to check, impossible to post wrong, and look like the owner's Stitch screens.

The last full review was in September 2026 (`FUEL_REVIEW_QUEUE_AUDIT.md`, Rev 3). Its last open items, R8 and R11 (the Ledgers › Fuel Expenses delete cascade and its permissions), are now **closed in code**: `FuelExpenseLedgerPage.tsx` uses `purgeFuelExpense` and `fuel.edit_entry` / `fuel.delete_entry`.

## 0. Where things stand

- Rev 1 reviewed the whole section: the 4 tabs, the line chips, bulk set, the details window, the odometer window, the split window, the approve and reject server steps, how the queue loads, the nav badge and the new phone-fill parts.
- **11 findings: 3 High, 5 Medium, 3 Low.** Each one has a fix below.
- The screens part (section 3) uses the owner's Stitch screens in `Downloads/fleet log fuel/stitch_roam_fleet_fuel_review`.
  - Stitch has no screens yet for the 4 tabs, the table or the windows. The tables keep their current layout but take the new colours, money format and buttons until those screens exist.
- **Rev 2 (25 Nov): all 11 fixed in code. Not live, not committed.**
  - Server: `fuel_review_guards.ts` (RQ-01, RQ-03, RQ-11; 11 tests), `fuel_review_claim.ts` (RQ-03, one approve at a time: the typed `status` column on `fleet.transactions` goes Pending → Approving in one conditional update, given back on any early stop, and a claim older than 2 minutes can be taken again). `/expenses/approve` and `/expenses/reject` check the company (RQ-02).
  - Local copy, real API path, 17/17: J$0, needs-a-look and awaiting-statement fills refused; another company's fill 404 and untouched; two approves at once give 200 + 409 and exactly one posted fuel log; approve after reject, reject after approve, and a blank reason are refused; an approve that stops early (no car) leaves the fill Pending.
  - Queue rules: `isPendingTabRow` and `isStationHeldQueueRow` in `packages/fuel-core/src/fuelReviewQueue.ts` (RQ-04, RQ-05; 5 tests). `odometerMethod 'photo_read'` (the server photo reader) now counts as read, like the phone's read, so those fills go to Pending, not Log Review.
  - Screens: the three tiles, the waiting card, the needs-a-look row and the station picker now follow Stitch screens 1, 2, 4, 5, 6 and 7 (checked side by side at desktop and phone width). J$ everywhere, plain words, no Settled column, no Approved-only block, and photos open in the app (`phone-fills/FuelPhotoViewer.tsx`). The server's refusal reason now shows in the error message.
  - RQ-08: no fuel log in the approve answer was needed. The page updates the one row and skips the 180-day reload. Transaction Logs loads its own list when opened.
  - Checks: Fleet 2,226 tests, fuel-core 263, server 38, driver 77. No new type errors.

## 1. What the Review Queue is made of

| Part | File | What it does |
|---|---|---|
| Page | `apps/fleet/src/pages/FuelManagement.tsx` (`activeTab === 'reimbursements'`) | Loads 180 days of fuel transactions, then shows the phone parts and the table |
| Waiting on phones card | `components/fuel/phone-fills/FuelPhoneWaitingCard.tsx` | Drivers whose phone still holds unsent fills |
| Needs a look rows | `components/fuel/phone-fills/FuelNeedsLookPanel.tsx` | Phone fills the photo reader could not read |
| The table and its 4 tabs | `components/fuel/FuelReimbursementTable.tsx` | Log Review, Pending, Split mismatches, Awaiting statement |
| Split window | `components/fuel/SplitCashResolveDialog.tsx` | Decide pay / Escalate on a Gas Card + Cash fill |
| Rules for which tab a fill is in | `packages/fuel-core/src/fuelReviewQueue.ts` | Shared with the nav badge and week close |
| Approve / Reject (server) | `supabase/functions/_fleet-server/register_residual_monolith_routes.tsx` `/expenses/approve`, `/expenses/reject` | Approve is the only step that posts a fill (`ensureFuelEntryForApprovedTx`) |

## 2. Findings

### RQ-01 (High) — The server will post a fill with no total

`/expenses/approve` never checks the amount. `ensureFuelEntryForApprovedTx` (`fuel_posted_guarantee.ts`) then writes a fuel log with `amount 0` and `liters 0`.

- Today only the screen stops this: the table hides phone fills that are still being read (`waiting`) or need a look (`needs_look`), and `handleApproveReimbursement` refuses `awaitingCashStatement`.
- Any other way of calling approve (an old open tab, a second click, a script) posts a J$0 fill into the week.
- **Fix:** in `/expenses/approve`, before posting a Fuel fill, return 409 when:
  - the fill has no total above 0 (except a split cash half the statement settled at 0, i.e. `splitReconciled` plus `fillGroupId`);
  - or `metadata.photoReadStatus` is `waiting` or `needs_look`;
  - or `metadata.awaitingCashStatement` is true.

  Add a server test for each of the three.

### RQ-02 (High) — Approve and Reject don't check the company

Both server steps read `transaction:<id>` by id alone and never call `belongsToOrg`. `stampOrg` then rewrites `organizationId` to the person clicking.

So a fleet person in one company who has the id of another company's fill can approve it, which posts it and moves it into their own company, or reject it.

- **Fix:** in both steps, return 404 when `!belongsToOrg(tx, c)`. This is the same check `POST /fuel/fill/:id/numbers` already uses. Add a server test with a fill from a second company.

### RQ-03 (High) — A fill can be approved twice, or approved after it was rejected

Neither server step checks that the fill is still `Pending`.

- Approve on a `Rejected` fill posts it and silently reverses the rejection.
- Reject on an `Approved` fill marks it Rejected but leaves its posted fuel log in Transaction Logs.
- Two approves at the same moment can both find no linked fuel log and post two.
- **Fix:**
  - Both steps return 409 unless `tx.status === 'Pending'`.
  - Approve claims the fill first with one conditional update (`status` from `Pending` to `Approving`, only where it is still `Pending`). Only the request that wins posts the fill. On failure it sets the status back to `Pending`.
  - Add a test that sends two approves at once and expects one fuel log.

### RQ-04 (Medium) — Pending lets you approve a fill that is waiting for an odometer check

`isPendingReadyForReview` doesn't exclude Log Review fills, so the same fill shows in both Log Review and Pending.

On the Pending tab it has a green Approve button next to Review. Approve skips the odometer box, so the fill posts with the odometer the scanner couldn't read. The Pending tab count also counts these fills twice (the nav badge doesn't).

- **Fix:** the Pending tab shows `pendingReadyForReview` minus `isLogReviewEligible`, the same split the nav badge already uses (`countFuelReviewQueueWork`). Log Review fills are approved only through the odometer window.

### RQ-05 (Medium) — Fills held for station checks can't be seen

Fills with `stationGateHold` are left out of every tab. The only trace is a chip saying "N station holds — resolve in Station Database".

The details window has a full "What's missing / why it's stuck" section for these fills, but nothing opens it. The owner can't see which driver, which day or how much.

- **Fix:** add the held fills as rows at the bottom of Pending, each labelled "Waiting for station check", with only View. View opens the existing details window, which already shows why it's stuck and already disables Approve and Reject.

### RQ-06 (Medium) — Money shows as "$", not "J$"

The table, the Log Review table, the details window ("Amount Claimed" with a dollar sign, "Rate $x.xxx/L") and the odometer window all show `$1500.00`.

- **Fix:** use `formatFuelMoney` (already used by the split tabs) everywhere in `FuelReimbursementTable.tsx`. Rates show as "J$215.38 a litre".

### RQ-07 (Medium) — Photos open in a new browser tab

In the odometer window, the odometer and receipt photos are links with `target="_blank"` and a "Click to enlarge" badge. This breaks the no-pop-ups rule.

- **Fix:** use the same in-app full-size viewer as the needs-look rows (`Photo` in `FuelNeedsLookPanel.tsx`). Move it into `components/fuel/phone-fills/FuelPhotoViewer.tsx` so both use one copy.

### RQ-08 (Medium) — Every approve reloads 180 days of fuel

After each approve or reject, `loadLogsAndTransactions` runs again:

- `ensurePostedEntries(40)`;
- up to 40 pages × 1,500 rows of 180 days of transactions;
- the week's fuel logs.

On a full queue that's heavy on the database (the Disk IO rules) and slow for the person approving.

- **Fix:** after approve or reject, update the one row from the server's answer (`setTransactions`, as reject already does) and add the returned fuel log to `logs`. The full reload runs only from Refresh Data and when the tab opens. The server's approve answer already returns the fill. Add `fuelEntry` to it.

### RQ-09 (Low) — Words people don't use

- "Synchronizing ledger and verifying manual entries..."
- "Ledger Sync: OK" and "Pending sync"
- "Reimbursement Request"
- "Review Queue loaded the maximum window of transactions … raise the lookback only with care"
- "Capture Method: AI Verified / Manual Override"
- "The AI odometer scanner was unable to read this submission"
- the "Mismatch / Linked" mini badges
- **Fix:** use these words instead:
  - "Refreshing…"
  - "Paid in week statement" / "Not paid yet"
  - "Fuel fill"
  - "Showing the newest fills only. Older ones are not in this list."
  - "How the odometer was read: from photo / typed by driver"
  - "The odometer couldn't be read from the photo. Type the reading to approve."
  - Drop the mini badges: the Amount column already shows the logged amount.

### RQ-10 (Low) — Two columns that are always empty on Pending

The Pending tab only shows Pending fills, but the table still has a **Settled** column (filled only for Approved) and a **Status** column. It also keeps the Approved-only "Fuel status: Posted / Reimbursement settlement" block in the details window.

- **Fix:** remove the Settled column. Rename Status to "Why it's here" (it already shows Station hold / Odometer check / Split amount mismatch). Remove the Approved-only block from the window. Approved fills live in Transaction Logs.

### RQ-11 (Low) — Reject with no reason is allowed on the server

The screen asks for a reason, but the server takes an empty one.

- **Fix:** `/expenses/reject` returns 400 when `reason` is blank, so every rejection says why. The driver sees it.

## 3. Screens (Stitch is the look; this list is the content)

Stitch screens: `Downloads/fleet log fuel/stitch_roam_fleet_fuel_review`.

Keep / Drop for each screen is in `docs/fuel-log-offline-first-audit.md` section 9 (Roam Fleet table). The owner's rule (25 Nov): match Stitch as closely as possible. Leave out anything the app doesn't have.

| Stitch screen | Where in the app | What changes |
|---|---|---|
| 2 `fuel_management_review_queue_manual_fill_entry` | Top of the Review Queue | (1) **Three tiles**: *Needs a look* (phone fills to check), *Waiting on phones* (fills still on drivers' phones), *Ready to approve* (the Pending count after RQ-04). (2) "Fills needing a look" heading and the row in Stitch's layout: header line (date · driver · plate · car), the Total / Litres / Odometer line, chips, the two photos with their labels (*Read clearly* / *Couldn't read*), and on the right numbered boxes (Odometer, Total, Litres, Station, Payment) with the "J$ … a litre" line. Bottom bar: *Reject* on the left; *Save numbers* and *Save and approve* on the right. |
| 4 `review_queue_numbers_typed_rate_calculated` | Same row | "Typed by you" tag and the "J$217.72 a litre" line once both numbers are typed |
| 5 `review_queue_fill_with_no_location_station_picker` | Same row, Station box | "No location from the phone" with the *Where was this fill?* card: search box, station rows, *Cancel*, *Use this station* |
| 1 `fuel_management_overview_waiting_on_phones` | Review Queue, under the tiles (Fleet has no Overview tab) | Card layout as in Stitch: initials circle, name + plate, car model under the name, amber "N fills · since" pill, "Phone last seen", "App x" |
| 6 `drivers_waiting_on_phone_chip` | Drivers page row | Amber "N on phone" chip with its tooltip |
| 7 `fuel_management_mobile_waiting_on_phones` | Review Queue on a phone-width screen | The card and needs-look rows stack into one column. The Open button opens the row. |

Left out because the app doesn't have them:

- the Overview tab;
- the "Fleet Financial Audit" line;
- the "Queue Urgency" box;
- *Open photo zoom* (each photo has its own *View full size*);
- "Glare Detected";
- the OCR confidence box;
- the driver's chat quote;
- "Verified" stamps;
- "Fleet petty-cash disbursal";
- "Within standard tolerance";
- *Save Draft* (the app has *Save numbers*);
- the footer;
- the company switcher.

The 4 tabs, the Pending / Log Review / split tables and the windows have no Stitch screens yet. They keep their layout and take RQ-06, RQ-09 and RQ-10.

## 4. Done-tests

1. Approve a fill with no total through the server: 409, no fuel log. The same for `waiting`, `needs_look` and `awaitingCashStatement`.
2. Approve or reject another company's fill by id: 404, and nothing changes.
3. Two approves at once: one fuel log. Approve on a Rejected fill: 409. Reject on an Approved fill: 409.
4. A fill needing an odometer check is in Log Review only, not Pending. The Pending tab count equals the badge's Pending part.
5. A station-held fill is a row at the bottom of Pending, with View only and the "why it's stuck" list.
6. No "$" without the J anywhere in the Review Queue.
7. No photo opens a new browser tab.
8. Approving one fill doesn't reload the 180-day list (one approve request, no transaction list request).
9. The Review Queue at 1440 px matches Stitch screen 2 (tiles, row, boxes, bottom bar). At 375 px it matches screen 7.
10. Reject with a blank reason: 400.

## 5. Build order

1. Server: RQ-01, RQ-02, RQ-03, RQ-11 and their tests.
2. Queue rules: RQ-04 in `fuelReviewQueue.ts` and its test.
3. Screens: section 3, plus RQ-05, RQ-06, RQ-07, RQ-09 and RQ-10.
4. RQ-08 (row update instead of reload).
5. Check at 1440 px and 375 px against Stitch, then run all tests and type checks.

## Outside focus

None.
