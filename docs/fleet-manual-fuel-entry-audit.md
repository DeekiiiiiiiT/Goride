# Fleet Manual Fuel Entry — Audit

**Status:** Remediation implemented 2026-09-19 (A1–A8). See §8.
**Date:** 2026-09-19
**Scope:** The admin-side "Add fuel" workflow in Transaction Logs — `AddFuelChoiceDialog` → **Driver claim** (`SubmitExpenseModal`) or **Known fill** (`FuelLogModal`) or **Gas Card + Cash** (`AdminSplitFillModal`) — across all fill types: Gas Card, Cash, and Gas Card + Cash.
**Related:** `docs/fuel-split-statement-derived-audit.md` (the driver-side split design this must interoperate with).

---

## 1. Verdict

The pure Gas Card and pure Cash admin paths are built well. Both admin doors share one anchor builder, the anchor shape is matcher-compatible, and admin writes go through the same server guards as driver writes. That part is sound.

**But the fleet side was never extended to the split redesign.** A grep across all three admin components for `gas_card_and_cash`, `splitRole`, `fillGroupId`, `saveSplitFill` and `awaitingCashStatement` returns **nothing**. The driver app can create split fills; the fleet cannot record, backfill, or correct one.

That is not merely a missing feature. The workaround an admin will reach for — two separate rows — **deterministically corrupts fuel volume**, because the volume guard that protects driver-created splits keys on `fillGroupId`, which manual rows do not have.

| Severity | ID | One-line |
|---|---|---|
| 🔴 **Critical** | [A1](#a1) | No split option anywhere in the fleet add-fuel flow — split fills cannot be backfilled or corrected |
| 🔴 **Critical** | [A2](#a2) | The manual two-row workaround double-counts liters; the volume guard requires a `fillGroupId` manual rows never get |
| 🟠 **High** | [A3](#a3) | Admin edits to split / awaiting rows silently no-op or are later overwritten, with no warning |
| 🟠 **High** | [A4](#a4) | The 15-minute soft-dedup window is too tight for backfill, so admin entry creates competing anchors |
| 🟡 Medium | [A5](#a5) | The two admin doors apply different validation to the same operation |
| 🟡 Medium | [A6](#a6) | Known fill cash bypasses the approval queue entirely and settles at Finalize |
| 🟡 Medium | [A7](#a7) | Split resolution lives on a different tab from where split rows are created and seen |
| 🟡 Medium | [A8](#a8) | Zero test coverage on all three admin add-fuel components |

---

## 2. How the admin flow works today

`Add fuel` opens `AddFuelChoiceDialog`, which offers exactly two paths:

| | **Driver claim** (`SubmitExpenseModal`) | **Known fill** (`FuelLogModal`) |
|---|---|---|
| Intent | *"Record a refuel the driver says they did"* | *"Post a fill you already know is real"* |
| Writes | `FinancialTransaction` (Pending) | `fuel_entry` **directly** |
| Approval | Review queue → approve → linked entry | **None** — straight into the logs |
| Payment sources | `driver_cash`, `rideshare_cash`, `company_card`, `petty_cash` | same four |
| Gas card in bulk | **allowed** | **blocked** |
| Verified station for gas card | **required** | not required |

Both are routed through `FuelManagement.handleSaveLog` / `handleSaveExpense`.

### 2.1 The Gas Card path is correct

Both modals build the anchor with the same shared helper, `buildGasCardOdometerAnchor`, producing:

```ts
amount: 0, entryMode: 'Anchor', paymentSource: 'Gas_Card',
entrySource: 'admin-manual', reconciliationStatus: 'Pending',
metadata: { awaitingCardStatement: true, countsInFuelSpend: false, countsInFuelVolume: false, … }
```

This is the same shape the driver portal produces, and it is **matcher-compatible** despite `entrySource: 'admin-manual'` — `isRoamGasCardAnchor` short-circuits on `metaOf(e).awaitingCardStatement` before it ever reaches the `entrySource !== 'driver-portal'` check. Admin anchors will match Dominion statement rows exactly like driver anchors.

The UI gates it properly too: an Active card in Card Inventory is required, an odometer photo is required, and Submit stays disabled otherwise (visible in the Known fill screenshot as *"No Active gas card assigned to this vehicle/driver in Card Inventory"*).

---

## 3. Findings

### <a id="a1"></a>🔴 A1 — The fleet cannot record a split fill

`AddFuelChoiceDialog` offers two paths and neither is a split. Both modals' payment dropdowns offer `driver_cash`, `rideshare_cash`, `company_card`, `petty_cash` — the driver app's fourth option, `gas_card_and_cash`, does not exist admin-side. No component references `fillGroupId`, `splitRole`, `saveSplitFill`, or the `/fuel/split-fill` endpoint.

The feature is live and default-on for every org (`OPT_IN_MODULE_KEYS` is empty), so drivers are creating split fills **today** that the fleet has no way to create, backfill, or correct.

**The operational cases this blocks are ordinary, not exotic:**

- The driver's phone died at the pump, or the offline queue never synced.
- The driver picked "Cash" or "Gas Card" when the fill was actually split — the admin cannot convert it.
- Historical fills entered during onboarding or after a migration.
- A split fill whose card anchor never matched and must be re-created cleanly.

In each case the admin's only options are to record the fill wrongly (as pure cash or pure card), or to attempt the two-row workaround — which is A2.

### <a id="a2"></a>🔴 A2 — The manual two-row workaround double-counts volume

This is the finding that turns A1 from a gap into a defect, because the workaround is what an admin will actually do: create a Gas Card Known fill for the card half and a Cash Known fill for the cash half.

Those two rows have **no `fillGroupId`**, and the volume guard is keyed on exactly that:

```ts
// fuel_jaa_match.ts / jaaFuelStatementMatcher.ts
const isSplitNonVolumeOwner =
  drvMeta.splitVolumeOwner === false &&
  typeof drvMeta.fillGroupId === "string" &&
  String(drvMeta.fillGroupId).length > 0;
```

With no `fillGroupId`, the manual card anchor is **not** recognised as a split sibling, so on statement match it takes the normal branch:

```ts
liters: stmt.liters ?? drv.liters,
countsInFuelVolume: Number(stmt.liters) > 0,
```

**Worked example.** One physical sale: $10,000 for 50 L. Card covered $6,000 (≈ 30 L on the statement), driver paid $4,000 cash.

| Row | Amount | Liters counted |
|---|---|---|
| Manual cash Known fill | $4,000 | 50 L (admin enters pump liters) |
| Manual card anchor, after match | $6,000 | **30 L** (statement liters, unguarded) |
| **Total** | $10,000 ✓ | **80 L** ✗ — 30 L of fuel that never existed |

The money happens to reconcile if the admin splits the amounts correctly. **The volume does not, and cannot** — it is wrong by construction, and the admin has no way to avoid it because the guard they need is unreachable from the UI.

That 30 L then flows into `fuelTankLiters` → the tank-cycle engine and `fuel_week_closable_gate`, and into `fuelPriceLiters` → JMD/L. This is precisely the defect the driver-side design went to considerable trouble to prevent (§4.4 of the split audit); the admin path reintroduces it through the back door.

If instead the admin enters the **full** $10,000 as cash and also logs the card anchor, the money double-counts too — $16,000 against a $10,000 sale.

**There is no guard against either.** Nothing warns that a Gas Card anchor and a Cash fill at the same vehicle, odometer and date might be halves of one sale.

### <a id="a3"></a>🟠 A3 — Admin edits to split / awaiting rows silently no-op

Edit is gated on `isLocked || !canEdit` (`FuelTransactionsTable.tsx:696`) and nothing else. There is no split or awaiting awareness in the gate, so an admin can open any split row.

`FuelLogModal` **spreads** the prior metadata on save:

```ts
metadata: { ...(initialData?.metadata || {}), … }
```

Preserving `fillGroupId` and `splitRole` is right — but it also preserves `awaitingCashStatement: true` and `countsInFuelSpend: false`, while the form happily writes a new `amount` and `liters`. The result is a row that looks edited and behaves as though it was not:

**Editing an awaiting split cash row** (the natural thing to do — the admin knows what the driver paid):

1. Admin types `3000` and saves. The write succeeds; the UI shows $3,000.
2. `countsInFuelLogSpend` still returns **false** (`awaitingCashStatement`), so the $3,000 **counts nowhere**.
3. `isPendingReadyForReview` still returns false → never reaches the approval queue.
4. `listUnapprovedFuelTxInWindow` still skips it → never blocks finalize.
5. When the CSV lands, `resolveSplitCashFromStatement` **overwrites** the amount with `pump − card`.

The admin's correction is invisible, ineffective, and then silently discarded — with no warning at any step.

**Editing a Gas Card anchor** has the same shape. The dedicated anchor branch is `if (isGasCard && !initialData)` — create-only. On edit, a gas card row falls through to the normal path, which *requires* an amount and liters > 0. The admin is forced to invent numbers, which are then written but ignored because `countsInFuelSpend: false` survives the spread, and overwritten by `stmt.amount` at match time.

To the system's credit the downstream guards hold, so no total is corrupted. But "the guards absorbed it" is not the same as "the edit worked". Money edits that silently no-op are the worst failure mode for an operator's trust in the ledger.

### <a id="a4"></a>🟠 A4 — Backfill creates competing anchors

Admin writes do reach the server guards — `fuel_controller.tsx:4124` runs `findConflictingGasCardAnchor`, `:4136` runs `findSoftDuplicateFuelEntry`, and a soft duplicate correctly **reuses** the existing row rather than inserting a second. That is the right design.

The problem is the window. `isSoftDuplicatePair` requires the two clocks to be within **15 minutes**:

```ts
if (!candClock || !rowClock || Math.abs(rowClock - candClock) > windowMs) return false;
```

`FuelLogModal` has **no required-time validation** (the Known fill screenshot shows an empty `--:-- --`), so a backfilled entry typically carries midnight or an approximate time. An admin recording a fill the driver logged at 08:15 will miss the window essentially every time, and a second anchor is created.

`findConflictingGasCardAnchor` does not catch it either — it only returns a conflict when the existing row **already has** `jaaMatchedStatementId`, so before the statement arrives, duplicates pass freely.

**What then happens:** `matchJaaStatementToDriverLogs` consumes one driver anchor per statement row (`usedDriverIds`), so one of the two duplicates matches and the other never will. If the orphan is a **split's card row**, the split's cash half never resolves — `awaitingCashStatement` stays true and the driver stays unpaid until the 14-day stale surface fires.

The C3 aging surface means this is caught rather than lost, which is exactly why that surface was worth building. But it is a self-inflicted wound created by an ordinary admin action, and the 15-minute window — tuned for *"same fill submitted twice from a phone"* — is simply the wrong tolerance for manual backfill.

### <a id="a5"></a>🟡 A5 — The two doors validate the same operation differently

Both modals create a Gas Card odometer anchor through the same builder, so the stored shape is identical — no drift there. The **gates** differ:

| Check | Known fill | Driver claim |
|---|---|---|
| Bulk gas card | ❌ blocked — *"single-entry only"* | ✅ allowed (loops anchors) |
| Verified station (`matchedStationId`) | not required | **required** — *"Select a verified station from the Dominion list"* |
| Odometer photo | required | required |
| Active card in inventory | required | required |

An admin gets a different rule set depending on which card they clicked, for the same outcome. The station requirement is the one that matters: `matchedStationId` improves station attribution and downstream matching quality, so the Known fill path produces weaker records. And the bulk restriction is backwards — Known fill is the path more likely to be used for backfilling several fills at once.

### <a id="a6"></a>🟡 A6 — Known fill cash bypasses the approval queue

`handleSaveLog` writes through `fuelService.saveFuelEntry` directly. A cash Known fill therefore becomes a `fuel_entry` with **no `FinancialTransaction`, no Pending status, and no review-queue pass**. It is then picked up as driver out-of-pocket spend by `sumPaidByDriverForReport` and reimbursed at Finalize.

The Driver claim path for the same economic event goes Pending → review → approve → linked entry.

So there are two routes to the same reimbursement with materially different control levels, and the faster one has no second pair of eyes. The dialog copy (*"Post a fill you already know is real straight into the logs"*) says this is deliberate, and for a genuinely known fill it is defensible. It is worth being explicit about it rather than leaving it implicit: an admin can create driver-reimbursable cash spend that no one else reviews. At minimum that deserves a distinguishing audit stamp and a periodic report, since it is the highest-trust action in the fuel module.

### <a id="a7"></a>🟡 A7 — Split resolution is on a different tab

`SplitCashResolveDialog` is wired only into `FuelReimbursementTable` (the fuel-reimbursements tab). An admin working in Transaction Logs — where split rows are visible, and where `Add fuel` lives — has no in-place way to resolve one. The table does read `cashLeg?.metadata?.awaitingCashStatement` for display, so it knows the state; it just offers no action.

Minor, but it splits one workflow across two tabs at exactly the moment an operator is trying to fix something.

### <a id="a8"></a>🟡 A8 — No test coverage on the admin add-fuel components

`buildGasCardOdometerAnchor.test.ts` is the only test in this area. There are **no tests** for `FuelLogModal`, `SubmitExpenseModal`, or `AddFuelChoiceDialog`.

Untested as a result: the `PAYMENT_SOURCE_MAP` / `PAYMENT_SOURCE_TO_DROPDOWN` round-trip, the create-only gas-card branch, the bulk guards, and the metadata-spread edit path from A3. The shared anchor builder — the one piece that *is* tested — is also the one piece that turned out to be correct; that is not a coincidence worth ignoring.

---

## 4. What is correct

Worth recording, because most of the plumbing is right and should not be disturbed while fixing the rest.

- **One anchor builder, two doors.** Both admin modals call `buildGasCardOdometerAnchor`, so admin-created anchors cannot drift apart from each other or from the driver's shape.
- **Admin anchors match statements.** `isRoamGasCardAnchor` short-circuits on `awaitingCardStatement`, so `entrySource: 'admin-manual'` is matched exactly like `driver-portal`.
- **Admin writes are guarded.** `/fuel/entries` runs both `findConflictingGasCardAnchor` (409 `DUPLICATE_GAS_CARD_ANCHOR`) and `findSoftDuplicateFuelEntry` (reuses rather than duplicating).
- **The signed-anchor tamper guard has the right carve-out.** For `awaitingCardStatement` rows the locked core is `["odometer", "date", "vehicleId", "lat", "lng"]` — amount and liters stay fillable because the statement must supply them later, while the physical facts stay immutable. That is a precise distinction and it is correct.
- **Gas card preconditions are enforced** — Active card in Card Inventory plus an odometer photo, with Submit disabled otherwise.
- **The logs table is split-aware for display** — it renders "Awaiting" for unmatched anchors and reads the cash leg's `awaitingCashStatement`.

---

## 5. The structural point

The driver-side split work built a careful set of invariants — one volume owner per fill, a `fillGroupId` linking the halves, a guardian that owns the incomplete cash state. Every one of those invariants is established **at creation time**, inside `persistSplitFill` and the `/fuel/split-fill` endpoint.

The fleet's manual path does not go through that endpoint. It goes through `/fuel/entries`, one row at a time.

So the invariants are not enforced by the data model or the server — they are enforced by *the only client that knows to create them*. The moment a second client writes fuel rows without that knowledge, the guarantees quietly stop applying: no `fillGroupId` means no volume guard, no lifecycle, no re-home, no aging surface.

A1 and A2 are the same omission seen from two sides. The fix is not only "add a third button" — it is to make a split fill something the **server** understands as a unit, so that any client creating one gets the invariants, and any client creating half of one is told what it is missing.

---

## 6. Recommendations

**Before this is enterprise-safe:**

1. **A2 first, even before A1.** Add a server-side or UI-side detection for the unlinked-halves pattern: a Gas Card anchor and a cash fill at the same vehicle + odometer + date with no shared `fillGroupId`. Prompt to link them, or refuse. This stops silent volume corruption today, regardless of when the split UI ships.
2. **A1 — add "Gas Card + Cash" to `AddFuelChoiceDialog`**, posting to the existing `/fuel/split-fill` endpoint. The server contract already exists and is well-tested; the admin side needs a form that collects pump total + liters + odometer and lets the endpoint stamp the invariants. This is mostly UI work against a proven API.
3. **A3 — gate the edit.** A row with `awaitingCashStatement` should either open the resolve dialog instead of the edit form, or show a clear banner explaining that the amount is statement-derived and any entry will be overwritten. Never accept a money edit that will silently not apply.
4. **A4 — widen the soft-dedup window for manual entry**, or match on vehicle + odometer + calendar day without the clock constraint when `entrySource` is `admin-manual`. A backfilled fill is the same fill regardless of the time typed.

**Then:**

5. **A5** — make the two doors agree: require `matchedStationId` in both, and allow bulk gas card in both (or neither).
6. **A6** — stamp Known fill cash distinctly and report on it; decide explicitly whether no-review reimbursement creation is acceptable.
7. **A7** — surface the resolve action in Transaction Logs.
8. **A8** — tests for the payment-source mapping, the gas-card create branch, and the edit metadata-spread.

Items 1 and 3 are the ones that stop bad data being written. Item 2 is the one that makes the workflow whole.

---

## 7. Key file reference

| Concern | File |
|---|---|
| Path chooser (**A1**) | `apps/fleet/src/components/fuel/AddFuelChoiceDialog.tsx` |
| Known fill — create + edit (**A1**, **A3**, **A5**) | `apps/fleet/src/components/fuel/FuelLogModal.tsx` |
| Driver claim (**A1**, **A5**, **A6**) | `apps/fleet/src/components/fuel/SubmitExpenseModal.tsx` |
| Shared anchor builder (correct) | `apps/fleet/src/utils/buildGasCardOdometerAnchor.ts` |
| Save routing (**A6**) | `apps/fleet/src/pages/FuelManagement.tsx` — `handleSaveLog`, `handleSaveExpense` |
| Edit gate (**A3**) | `apps/fleet/src/components/fuel/logs/FuelTransactionsTable.tsx:696` |
| Volume guard keyed on `fillGroupId` (**A2**) | `supabase/functions/_fleet-server/fuel_jaa_match.ts`, `packages/roam-shared/src/fuel/jaaFuelStatementMatcher.ts` |
| Soft-dedup window (**A4**) | `supabase/functions/_fleet-server/fuel_soft_dedup.ts` |
| Admin write guards (correct) | `supabase/functions/_fleet-server/fuel_controller.tsx:4124-4144` |
| Split endpoint the admin path should use (**A1**) | `supabase/functions/_fleet-server/fuel_split_fill.ts` |
| Split resolve dialog (**A7**) | `apps/fleet/src/components/fuel/SplitCashResolveDialog.tsx` |

---

## 8. Remediation shipped (2026-09-19)

| ID | Fix |
|---|---|
| A2 | Server `findUnlinkedSplitHalfConflict` → 409 `UNLINKED_SPLIT_HALVES`; fleet toast via `fuelSaveErrorMessage` |
| A3 | `classifyFuelLogEdit` — awaiting cash → Resolve; awaiting card → read-only banner |
| A4 | Admin-manual soft-dedup = same day + odo + payment family (ignore / missing clock) |
| A1 | Third Add Fuel door + `AdminSplitFillModal` + fleet `saveSplitFill` → `/fuel/split-fill` |
| A7 | Resolve Cash on Transaction Logs + detail sheet |
| A5 | Shared `validateGasCardCreateGates`; bulk Gas Card allowed on Known fill |
| A6 | `adminBypassReview` stamp + logs filter “Known fill (no review)” |
| A8 | Deno + vitest coverage for halves, soft-dedup, edit gate, payment map |

**Smoke matrix (ops):** pure Gas Card / Cash both doors; admin Gas Card + Cash → statement → Resolve; two-row workaround → 409; backfill same-day different time → soft-reuse; Edit awaiting cash → Resolve; Resolve from Logs and Reimbursements.

---

## 9. Remediation review (2026-09-19)

All eight findings are addressed, and the two Criticals are closed at the mechanism rather than patched at the surface. **One new type defect was introduced that hides a live feature from the compiler** (§9.9), and the `tsc` gate established in the split audit is now failing.

| Finding | Verified |
|---|---|
| A1 Split path admin-side | ✅ §9.1 — uses the real endpoint, not a local re-implementation |
| A2 Unlinked halves | ✅ §9.2 — refused server-side, day-scoped, tested |
| A3 Edit gate | ✅ §9.3 — classifier routes to Resolve or read-only |
| A4 Backfill dedup | ✅ §9.4 — admin carve-out, both directions tested |
| A5 Door parity | ✅ §9.5 — one shared gate, weaker path raised |
| A6 No-review visibility | ✅ §9.6 |
| A7 Resolve in Logs | ✅ §9.6 |
| A8 Coverage | ✅ §9.7 — logic extracted, then tested (one gap) |
| — | ✅ **§9.9 — typecheck restored (501 ≤ 502 baseline)** |

### 9.1 A1 — The admin split goes through the real endpoint ✅

`AdminSplitFillModal` does the one thing that mattered: it **posts to `/fuel/split-fill` via `fuelService.saveSplitFill`** rather than writing two rows itself. It mints a `fillGroupId`, builds metadata with the shared `buildCashSplitMetadata` / `buildCardSplitMetadata` from fuel-core, sets `amount: 0`, and stamps `splitPumpLiters` on **both** rows.

The admin path therefore inherits everything `persistSplitFill` enforces — `awaitingCashStatement`, `splitVolumeOwner`, the anchor and soft-dup guards, the compensating rollback, idempotency on `fillGroupId`. An admin-created split is indistinguishable from a driver-created one to every downstream consumer, which is exactly what §5 argued for.

Reusing the fuel-core builders also means the M4 price band works on admin splits, because `splitPumpLiters` is present on the card row — the field whose absence was the §9.5 defect in the split audit.

### 9.2 A2 — Unlinked halves are refused, not merely detected ✅

`fuel_split_halves.ts` is wired into the entry route at `fuel_controller.tsx:4146` and returns **409 `UNLINKED_SPLIT_HALVES`**. The predicate is well-scoped:

- same vehicle + odometer + **calendar day** — deliberately no clock window, so backfill is covered;
- **different payment family** (`gas_card` vs `cash`-like) via a shared `paymentFamilyBucket`;
- skips CSV statement rows (`isGasCardCsvFuelEntry`) — those are not manual halves;
- skips rows already carrying a `fillGroupId` on either side, so real split siblings never trip it.

The error message names the remedy rather than the symptom: *"…must be recorded as Gas Card + Cash (one split), not two separate rows. Use Add fuel → Gas Card + Cash, or delete the other half first."*

Two details are worth noting as correct. It runs only on `isNewFuelEntry`, so production rows predating the split feature are not retroactively rejected. And it layers with soft-dedup rather than fighting it: soft-dedup still says *"different payment families are not duplicates"*, while this guard says *"…and you may not create them as two rows."* Different questions, different answers.

### 9.3 A3 — The edit gate classifies instead of blanket-blocking ✅

`classifyFuelLogEdit(entry, splitSiblings)` returns one of three kinds and the table acts on each:

| Kind | Action | Label |
|---|---|---|
| `resolve_split_cash` | opens the resolve dialog | "Resolve Cash" |
| `awaiting_card_readonly` | edit disabled | "Awaiting Statement" |
| default | normal edit | "Edit Log" |

This is the better of the two options I proposed — routing to the resolve dialog rather than showing a warning, so the operator lands on the action that actually works. The classifier covers all three awaiting states: the split cash leg, the split card leg, and a lone non-split Gas Card `$0` anchor. The read-only reason explains the carve-out accurately: *"Amount and liters come from the card statement. Physical facts (odometer, date, vehicle) stay locked until match."*

### 9.4 A4 — Admin backfill carve-out, tested both ways ✅

`isAdminManualFuelEntry` gates a branch that skips the clock check, so admin-manual entries soft-match on day + odometer + payment family. The 15-minute window is preserved for `driver-portal`, and both halves are tested:

- `admin-manual soft-dedup ignores clock across same day` ✓
- `driver-portal soft-dedup still requires 15-minute window` ✓

Testing that a widened rule did **not** widen for the other caller is the part that is easy to skip and the part that matters.

### 9.5 A5 — One gate, and the weaker door was raised ✅

`validateGasCardCreateGates` is now imported by all **three** modals (Known fill single + bulk, Driver claim, Admin split) and enforces the strictest union: card lookup complete, Active card assigned, odometer > 0, odometer photo present, and **`matchedStationId` required**.

The direction is right — the verified-station requirement that previously existed only on Driver claim now applies everywhere, rather than the stricter door being relaxed to match the looser one. Bulk Gas Card is now available on Known fill too (subject to §9.9).

### 9.6 A6, A7 ✅

**A6** — an `adminBypassReview` stamp plus a "Known fill (no review)" filter in the logs toolbar. The no-review path is now reportable: the decision to allow it stands, but it is no longer invisible.

**A7** — `onResolveSplitCash` is threaded from `FuelManagement` through `FuelLogTable` into `FuelTransactionsTable` and the detail sheet, so resolution is available where split rows are actually seen. The workflow no longer spans two tabs.

### 9.7 A8 — Extracted, then tested ✅

The right approach: rather than DOM-testing thousand-line modals, the decision logic was pulled into pure units and those were tested — `fuelLogEditGate.test.ts`, `fuel_split_halves.test.ts`, and an extended `fuel_soft_dedup.test.ts`. Same move that made §10.5 of the split audit possible.

**One gap (closed):** `gasCardCreateGates.ts` now has `gasCardCreateGates.test.ts` covering lookup / card / odo / photo / station fail paths and the all-pass case.

### 9.8 Tests

| Check | Result |
|---|---|
| Vitest (fuel-core, roam-shared/fuel, fleet utils, fuel logs) | ✅ **245/245 files, 1481 passed, 1 skipped** |
| Deno — `fuel_split_halves`, `fuel_soft_dedup` | ✅ **12/12** |

Run without `VITE_SUPABASE_URL`, 46 files fail at import — every one the long-standing env load failure. With the variable set, all 245 files pass and **zero tests fail**. No regressions.

### 9.9 Typecheck closeout (2026-09-19)

**Resolved.** Fleet `tsc --noEmit` is at **501** errors (baseline was 502; remediation peak was 508). None of the remaining errors sit in the remediation-touched files (`FuelLogModal`, `AdminSplitFillModal`, `SubmitExpenseModal`, `fuelLogEditGate`, `FuelManagement`).

| Fix | Done |
|---|---|
| `bulkCommon.type` typed as four-key `KnownFillPaymentKey`; dropped `as const` / `as any` | ✅ |
| `formatCustomerFacingFuelCardLabel(..., isRoamManaged)` in split modal | ✅ |
| `card ?? null` / early `const card` narrowing | ✅ |
| Dropped excess `category` on `isAwaitingCashTx` call | ✅ |
| `gasCardCreateGates.test.ts` | ✅ |

### 9.10 Verdict

The remediation is strong and the review closeout is complete. A1 and A2 were closed at the mechanism; the compiler can see the bulk Gas Card path again; the shared Gas Card gate is tested.

**Ops next (not blocking code):** run the §8 smoke matrix against a real Dominion import.

---

## 10. Closeout review (2026-09-19)

All three §9.10 items are closed, and each was fixed at the declaration rather than silenced at the call site. The `tsc` gate now passes with room to spare.

| Item | Verified |
|---|---|
| §9.9 `bulkCommon` typing | ✅ §10.1 — real union **plus a type guard**, both escapes gone |
| §9.9 `isRoamManaged` arg | ✅ §10.2 — and the prop is genuinely wired, not silently `undefined` |
| Three looseness errors | ✅ cleared |
| `gasCardCreateGates` test | ✅ §10.3 — one case per gate |
| Typecheck gate | ✅ **501** — one *below* the 502 baseline |

### 10.1 The bulk payment type is properly typed, and validated ✅

This was the one that could have been faked — widening the type to `string`, or swapping `as const` for another cast, would have cleared the error while leaving the compiler just as blind. It was done correctly instead:

```ts
type KnownFillPaymentKey = 'driver_cash' | 'rideshare_cash' | 'company_card' | 'petty_cash';

function isKnownFillPaymentKey(val: string): val is KnownFillPaymentKey { … }

const [bulkCommon, setBulkCommon] = useState<{
  driverId: string; vehicleId: string; type: KnownFillPaymentKey;
}>({ … });
```

And at the boundary:

```ts
if (!isKnownFillPaymentKey(val)) return;
setBulkCommon((prev) => ({ ...prev, type: val }));   // no cast at all
```

Both escapes are gone — `as const` on the state and `as any` on the setter. The two TS2367 errors are resolved because the comparisons are now genuinely possible, not because the check was suppressed.

The type **guard** is the part worth calling out. Typing the state alone would have satisfied the compiler; adding `isKnownFillPaymentKey` also rejects an invalid value at runtime, which matters because `val` arrives from a `Select` as a bare string. That is a stronger fix than the one I proposed.

### 10.2 The card label passes a real value ✅

```ts
formatCustomerFacingFuelCardLabel(assignedGasCard, !!isRoamManagedCard?.(assignedGasCard))
```

I checked the thing the optional chain could have hidden: an unwired prop would make `isRoamManagedCard?.()` return `undefined` → `false`, reproducing the original wrong-provider bug with better types. It is genuinely wired — `FuelManagement.tsx:2541` passes `isRoamManagedCard={isRoamManagedCard}` into the split modal, backed by the `useCallback` at `:302`. The assigned-card chip now renders the same provider name as every other surface.

### 10.3 The shared gate is tested ✅

`gasCardCreateGates.test.ts` has six cases: the happy path plus one per failure mode — lookup in progress, no Active card, missing/zero odometer, missing odometer photo, missing verified station. That is exactly the shape this function needed, since it is the single validator standing between three modals and a malformed Gas Card anchor.

### 10.4 Tests and typecheck

| Check | Result |
|---|---|
| Fleet `tsc` | ✅ **501** — below the 502 baseline; **zero** errors in any file this work touched |
| Vitest (fuel-core, roam-shared/fuel, fleet utils, fuel logs) | ✅ **246/246 files, 1487 passed, 1 skipped** |
| Deno — split halves, soft-dedup, split-fill gate | ✅ **20/20** |

501 means a pre-existing error was cleared alongside the seven from §9.9. The gate can now be tightened: **501 is the new baseline** for `npx tsc -p apps/fleet/tsconfig.json --noEmit | grep -c "error TS"`.

### 10.5 One residual, pre-existing and not introduced here

The **single-entry** form state in the same file is still untyped:

```ts
const [formData, setFormData] = useState<Record<string, any>>({ … });
…
setFormData(prev => ({ ...prev, type: val as any }));   // line 725
```

Because `formData` is `Record<string, any>`, that `as any` raises no error and never will — which is why it did not appear in the §9.9 list. The consequence is that `formData.type === 'company_card'` and the other single-entry payment comparisons get **no compiler protection**, exactly the condition §9.9 was about.

This predates the remediation and was not caused by it, so it is not a regression. It is worth noting only because the two halves of one file now differ: the bulk path validates and is typed, the single path does neither. Applying the same `KnownFillPaymentKey` + guard to `formData.type` would close it, and the pieces already exist a few lines away.

### 10.6 Verdict

Complete. Every finding from A1 through A8 is closed, the two Criticals structurally rather than cosmetically, and the follow-ups were fixed at the declaration rather than papered over — the bulk payment type in particular came back stronger than the fix I asked for.

Nothing blocks enabling. Remaining, in priority order and none of it gating:

1. Run the §8 ops smoke matrix against a real Dominion import — the one thing no test covers, since it spans admin entry → CSV → resolve.
2. Type `formData.type` with the existing `KnownFillPaymentKey` guard (§10.5).
3. Adopt **501** as the `tsc` baseline in the pre-enable gate.
