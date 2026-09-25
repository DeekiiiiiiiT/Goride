# Dashboard "Log cash" quick action — implementation plan

**Status:** design / not built
**Date:** 2026-09-25
**Scope:** `apps/fleet` Dashboard (desktop + mobile), rideshare service line only

---

## 1. The short answer

Add a **Log cash** quick action to the Dashboard header that opens a *driver picker* →
reuses the existing `LogCashPaymentModal` → writes through the existing
`POST /settlements/collect` command. No new money path, no new modal, no new server route.

Three rules decide the whole design:

1. **It is rideshare-only.** Delivery/courier COD is owed to *Roam*, not to the fleet, and
   a CI guard exists specifically to stop a Log Cash control appearing on that surface.
2. **It reuses the collect command, not `saveTransaction`.** The cash write path is
   already idempotent, version-checked and gated; a second one would be an eighth money engine.
3. **All the desk's refusals must come with it.** Week ended, period frozen, money locked,
   seal broken, over-collect reason, `expectedOutstanding` drift. A quick action that
   skips a gate is worse than no quick action.

---

## 2. Hard constraints — read before writing code

### 2.1 Do **not** offer this on the Delivery tab

`apps/fleet/src/components/couriers/CourierSettlementsPage.tsx:70-73` renders, verbatim:

> Owed to Roam — you cannot collect this in Fleet. No Log Cash / Collect / Settlement Week
> controls on delivery COD.

Delivery COD lives in the Layer A′ remittance ledger (`delivery.courier_remittance_*`),
which is a **courier ↔ Roam** running balance. Fleet Layer B driver settlements are a
**driver ↔ fleet** weekly period. Letting a fleet owner "log cash" against a courier's COD
would book Roam's receivable as fleet-held cash — that exact double-count is the bug the
rebuild removed.

This is enforced in CI, not by convention:

- `scripts/check-remittance-separation.mjs` (run in `.github/workflows/ci.yml:50-53` with
  `REMITTANCE_S6_DIFF=1`).
- **S-6(a)** hard-fails if `apps/fleet/src/components/fleet-financials/settlements/LogCashWizard.tsx`
  exists — that file name is banned because a service-picker Log Cash wizard was added to
  the live desk once before and breached the separation.

**Therefore:**

- Render the button only when `activeLine === 'rideshare' && rideshareVisible`.
- Put the new component under `apps/fleet/src/components/dashboard/`, **not** under
  `components/fleet-financials/settlements/`. Never name a file `LogCashWizard.tsx`.
- Do not add a "which service line?" step to the picker. There is only one line for cash.

If a fleet owner asks why Delivery has no Log cash: couriers remit to Roam through the
Remittance Desk; the fleet never holds that cash.

### 2.2 One write path only

The only legal write is:

```ts
settlementCommandsApi.collect({
  driverId, weekAnchor, amount, method, reference, note,
  idempotencyKey: newIdempotencyKey(),
  expectedOutstanding,           // server 409s if the desk drifted
  ...(overCollect ? { allowOverCollect: true, reason } : {}),
})
```

Server: `supabase/functions/_fleet-server/settlement_commands_controller.tsx:459`
(`requireSettlementPerm("settlements.collect")`, frozen-period assert, seal-hash verify,
`assertExpectedOutstanding`, `enforceCollectCap`, row-version optimistic lock, idempotency
replay).

**Never** fall back to `api.saveTransaction()` for a cash *payment*. In the desk that branch
(`DriverSettlementsPage.tsx:1261`) is reachable only for `float` / `adjustment`, and when the
command endpoint is genuinely missing the desk fails closed via `failIfCommandsUnavailable`
(`DriverSettlementsPage.tsx:244`). Mirror that: on `isSettlementCommandUnavailable(err)`,
toast "Settlement commands unavailable — redeploy fleet-server" and rethrow.

### 2.3 Permissions

- Client gate: `usePermissions().can('settlements.collect')`.
- `fleet_owner` / `fleet_manager` have it; **`fleet_accountant` and `fleet_viewer` do not**
  (`packages/auth-client/src/permissions.ts:378`, `:398`, `:424`) — and both of those roles
  *can* see the Dashboard (`nav.dashboard`). So the button must be hidden for them, or a
  viewer gets a button that 403s.
- Server enforces it regardless; the client check is UX only.

---

## 3. Where the button goes

### 3.1 Desktop

Current header (`Dashboard.tsx:698-703`): title left, `Add driver` + `Add vehicle` right,
both solid slate-900.

```
Dashboard                        [ 💵 Log cash ]  [+ Add driver]  [🚗 Add vehicle]
```

Put **Log cash first** in the group, styled as an *outline* button with an emerald accent —
not a third dark button. Rationale: the two dark buttons are a matched "add something"
pair; cash is a different kind of verb and a visual peer of neither. Outline also keeps the
header from reading as three competing primaries.

```tsx
<Button
  type="button"
  variant="outline"
  className="h-10 rounded-lg border-emerald-200 bg-white px-4 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:border-emerald-900/50 dark:bg-transparent dark:text-emerald-400 dark:hover:bg-emerald-950/40"
  onClick={() => setLogCashOpen(true)}
>
  <Banknote className="mr-2 h-4 w-4" />
  Log cash
</Button>
```

*Optional:* a count badge (`drivers with cash outstanding`) turns the button into a nudge.
It costs you the eager query — see §6.2. Ship without it first.

### 3.2 Mobile

Current row (`Dashboard.tsx:706-729`): search pill (flex-1) + the `+` dropdown.

```
[ 🔍 Search vehicles        ⚙ ]  [ 💵 ]  [ + ]
```

Add a dedicated 40×40 icon button between search and `+`:

```tsx
<Button
  type="button"
  size="icon"
  aria-label="Log cash from a driver"
  className="h-10 w-10 shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 md:hidden dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
  onClick={() => setLogCashOpen(true)}
>
  <Banknote className="h-5 w-5" />
</Button>
```

**Why not fold it into the existing `+` menu?** That menu is literally titled
*"What do you want to add?"* (`Dashboard.tsx:586`) and holds Driver / Vehicle. Logging cash
is not an add, and burying it costs a second tap on the exact flow the feature exists to
speed up. Two 40px buttons still leave ~240px of search field at 393px width.

**Alternative if the row feels crowded:** relabel the `+` menu to "Quick actions", add
*Log cash* as the first item with a separator above Driver/Vehicle, and drop the dedicated
button. Cheaper, one tap slower. Your call — the picker and hook below are identical either way.

### 3.3 Per-row entry (phase 2, optional)

`DashboardDriverTable` already has a row overflow menu (`:208-224` desktop, `:408-424`
mobile card). Adding a **Log cash** item there, prefilled for that driver, skips the picker
entirely — this is the real "on the go" path once owners know who paid them. Gate each row item
on that driver actually having a collectable week; otherwise disable it with the reason as a
tooltip.

---

## 4. Architecture

### 4.1 New files

| File | Purpose |
|---|---|
| `apps/fleet/src/hooks/useCashCollection.ts` | Shared read + gate + write logic. **The only place the rules live.** |
| `apps/fleet/src/components/dashboard/LogCashQuickAction.tsx` | Button + driver picker + `LogCashPaymentModal` host. Self-contained. |
| `apps/fleet/src/hooks/__tests__/useCashCollection.test.ts` | Candidate-filter unit tests. |
| `apps/fleet/src/components/dashboard/__tests__/logCashDeliveryHidden.test.tsx` | Regression: no Log cash control on Delivery. |

### 4.2 Changed files

| File | Change |
|---|---|
| `apps/fleet/src/components/dashboard/Dashboard.tsx` | Render `<LogCashQuickAction />` inside `headerActions` (rideshare branch only) + mobile row. Accept a new `onNavigate` prop. |
| `apps/fleet/src/App.tsx:677` | Pass `onNavigate={handleNavigate}` to `<Dashboard />` so the modal can deep-link to Close Week. |
| `apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx` | *(recommended, same PR)* refactor `openLogCashForDriver` / `collectPeriodForModal` / `saveCollectPayment` onto the shared hook so the two surfaces cannot drift. |

> If you want the smallest possible blast radius, ship the Dashboard consuming the hook and
> leave the desk alone — but then write the hook by **lifting** the desk's logic verbatim, and
> open a follow-up to collapse the duplicate. Two copies of a collect rule is exactly how the
> finance surfaces drifted before.

### 4.3 The trap in `queueToPeriodRow`

`DriverSettlementsPage.tsx:254` maps `SettlementQueueRow → PeriodRow` and **drops
`moneyUnlocked` and `sealBroken`**. The desk gets away with it because its table gates off the
raw queue rows (`SettlementQueueTable.tsx:42-63`). Your hook must keep the **raw
`SettlementQueueRow`** so those two flags survive — otherwise the quick action silently
permits collections the desk blocks.

---

## 5. The code

### 5.1 `useCashCollection.ts`

```ts
/**
 * Shared Collect-cash logic for the Settlements desk and the Dashboard quick action.
 * Rideshare Layer B only — delivery COD is Roam's receivable (see Layer A′ remittance).
 */
import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, parseISO } from 'date-fns';
import { useSettlementQueue, type SettlementQueueRow } from './useSettlementQueue';
import { newIdempotencyKey, invalidateSettlementQueries } from './useSettlementCommands';
import {
  settlementCommandsApi,
  isPeriodFrozenError,
  isMoneyLockedError,
  isSettlementCommandUnavailable,
} from '../services/settlementCommandsApi';
import { isSettlementPeriodEnded } from '../utils/settlementPeriodGate';

const MONEY_EPS = 0.005;

export type CashWeek = SettlementQueueRow & { owedMajor: number };
export type CashDriver = {
  driverId: string;
  driverName: string;
  totalOwed: number;       // collectable weeks only
  weeks: CashWeek[];       // collectable, newest first
  blockedCount: number;    // weeks excluded by a gate (for the "why not?" line)
};

function owedMajor(r: SettlementQueueRow): number {
  return r.amountOwed != null && Number.isFinite(r.amountOwed)
    ? Math.max(0, Number(r.amountOwed))
    : Math.max(0, (Number(r.amountOwedMinor) || 0) / 100);
}

/** Every refusal the desk applies, in one place. Returns null when collectable. */
export function collectBlockReason(r: SettlementQueueRow): string | null {
  if (!isSettlementPeriodEnded({ periodAnchor: r.periodAnchor, periodEnd: r.periodEnd })) {
    return 'Week still open — settle after it ends';
  }
  if (r.sealBroken === true) return 'Close seal broken — resolve in Close Week';
  if (r.periodFrozen === true) return 'Week closed — reopen it in Close Week';
  if (r.moneyUnlocked !== true) return 'Fuel/toll not cleared for this week';
  return null;
}

export function useCashCollection(opts: { enabled?: boolean } = {}) {
  const qc = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  // Lazy: nothing is fetched until the operator opens the picker.
  const queue = useSettlementQueue(
    { view: 'collect', minAmount: 0, pageSize: 200, groupBy: 'week', scope: 'rideshare' },
    { enabled: (opts.enabled ?? true) && pickerOpen },
  );

  const drivers: CashDriver[] = useMemo(() => {
    const byDriver = new Map<string, CashDriver>();
    for (const row of queue.data?.rows ?? []) {
      const amount = owedMajor(row);
      if (amount <= MONEY_EPS) continue;
      const key = row.driverId;
      const entry =
        byDriver.get(key) ??
        { driverId: key, driverName: row.driverName || key, totalOwed: 0, weeks: [], blockedCount: 0 };
      if (collectBlockReason(row)) entry.blockedCount += 1;
      else {
        entry.weeks.push({ ...row, owedMajor: amount });
        entry.totalOwed += amount;
      }
      byDriver.set(key, entry);
    }
    return [...byDriver.values()]
      .filter((d) => d.weeks.length > 0)
      .map((d) => ({
        ...d,
        weeks: d.weeks.sort((a, b) => b.periodAnchor.localeCompare(a.periodAnchor)),
      }))
      .sort((a, b) => b.totalOwed - a.totalOwed);
  }, [queue.data?.rows]);

  /** Shape the weeks for LogCashPaymentModal's `periods` prop. */
  const periodsFor = (d: CashDriver) =>
    d.weeks.map((w) => ({
      start: parseISO(`${w.periodAnchor}T12:00:00`),
      end: parseISO(`${w.periodEnd}T12:00:00`),
      amountOwed: w.owedMajor,
      amountPaid: 0,
      balance: w.owedMajor,
      status: 'Unpaid',
    }));

  /** Single write path. Throws so the modal keeps its own error toast + open state. */
  const collect = async (input: {
    driverId: string;
    driverName: string;
    weekAnchor: string;
    amount: number;
    expectedOutstanding: number;
    method?: string;
    reference?: string;
    note?: string;
  }) => {
    const overCollect = input.amount > input.expectedOutstanding + MONEY_EPS;
    const reason = input.note?.match(/\[Over-collection\]\s*(.+)/i)?.[1]?.trim();
    try {
      await settlementCommandsApi.collect({
        driverId: input.driverId,
        weekAnchor: input.weekAnchor,
        amount: Math.abs(Number(input.amount) || 0),
        method: input.method || 'Cash',
        reference: input.reference,
        note: input.note,
        idempotencyKey: newIdempotencyKey(),
        expectedOutstanding: input.expectedOutstanding,
        ...(overCollect ? { allowOverCollect: true, reason: reason || 'Over-collection' } : {}),
      });
    } catch (err) {
      if (isPeriodFrozenError(err)) throw new CashGateError('PERIOD_FROZEN', input.weekAnchor);
      if (isMoneyLockedError(err)) throw new CashGateError('MONEY_LOCKED', input.weekAnchor);
      if (isSettlementCommandUnavailable(err)) {
        toast.error('Settlement commands unavailable — redeploy fleet-server');
      }
      throw err;
    }
    invalidateSettlementQueries(qc);
    await qc.refetchQueries({ queryKey: ['settlements', 'queue'] });
  };

  return { pickerOpen, setPickerOpen, drivers, periodsFor, collect, isLoading: queue.isLoading };
}

export class CashGateError extends Error {
  constructor(readonly code: 'PERIOD_FROZEN' | 'MONEY_LOCKED', readonly weekAnchor: string) {
    super(code);
  }
}
```

### 5.2 `LogCashQuickAction.tsx` (shape)

```tsx
type Props = {
  /** 'desktop' renders the labelled button, 'mobile' the 40×40 icon. */
  variant: 'desktop' | 'mobile';
  onNavigate?: (page: string, opts?: { weekKey: string }) => void;
};
```

Internals:

1. `const { can } = usePermissions();` → `if (!can('settlements.collect')) return null;`
2. Trigger button (§3.1 / §3.2) sets `pickerOpen`.
3. **Driver picker** — `ResponsiveDialog` (already a drawer on mobile, dialog on desktop:
   `components/ui/responsive-dialog.tsx`). Body: a search `Input` + a scrollable list of
   `drivers`, each row = avatar/initials, name, `formatJMD(totalOwed)` on the right, and a
   sub-line `3 weeks · oldest Sep 8`. Tap a row → close picker, open the modal.
   - Empty state: *"No driver has cash outstanding right now."*
   - If everyone is blocked (`drivers` empty but rows existed): *"Cash is outstanding but no
     week is collectable yet"* + an **Open Settlements** button via `onNavigate`.
   - This is deliberately **better than the desk's picker**, which lists every driver from
     `api.getDrivers()` (`DriverSettlementsPage.tsx:696-711`) and then shows *"No settlement
     weeks available yet"* inside the modal. On the Dashboard, only show people who can pay.
4. **`<LogCashPaymentModal>`** with `driverName`, `cashOwed = selected.totalOwed`,
   `periods = periodsFor(selected)`, `initialWorkPeriodStart/End` = newest collectable week,
   `initialAmount` = that week's balance, `onSave` → `collect(...)`.
   The modal already owns: amount/date/method/reference/notes, the Settlement Week selector,
   the over-collection reason box, and the "week still open" refusal.
5. **`catch (CashGateError)`** → close the modal and show the matching dialog. Simplest
   version: `toast.error(msg, { action: { label: 'Open Close Week', onClick: () => onNavigate?.('close-week', { weekKey }) } })`.
   Richer version: import `PeriodFrozenDialog` / `MoneyLockedDialog` from
   `components/fleet-financials/settlements/` — allowed (the S-6 ban is on *remittance* code
   importing fleet-financials), but it pulls desk chrome onto the landing page. Start with toasts.
6. Success toast: `Collected $X — Kenny now owes $Y` (compute from the command response's
   `period`, same as `DriverSettlementsPage.tsx:1322-1335`).

### 5.3 Dashboard wiring

```tsx
// Dashboard.tsx — inside headerActions, rideshare branch only
const headerActions = showDelivery ? (
  <WorkforceInvitePanel … />        // unchanged — no cash control on Delivery
) : (
  <>
    <div className="hidden flex-wrap items-center gap-2 md:flex">
      <LogCashQuickAction variant="desktop" onNavigate={onNavigate} />
      <Button …>Add driver</Button>
      <Button …>Add vehicle</Button>
    </div>
    <LogCashQuickAction variant="mobile" onNavigate={onNavigate} />
    <DropdownMenu>…{/* + */}</DropdownMenu>
  </>
);
```

The `showDelivery ? … : …` split already in place at `Dashboard.tsx:542` does the service-line
exclusion for free — keep the quick action strictly inside the `else` branch. Do **not** hoist
it above the ternary.

---

## 6. Behaviour matrix

### 6.1 Gates

| Condition | Where checked | What the operator sees |
|---|---|---|
| Role lacks `settlements.collect` | client + server | Button not rendered |
| `activeLine === 'delivery'` | `Dashboard.tsx` ternary | Button not rendered |
| Week not ended | `isSettlementPeriodEnded` | Driver hidden from picker / "Week still open — settle after it ends" |
| `periodFrozen` | queue row + server `assertPeriodNotFrozen` | "Week closed — reopen in Close Week" + deep link |
| `moneyUnlocked !== true` | queue row + server | "Fuel/toll not cleared for this week" |
| `sealBroken` | queue row + server hash verify | Blocked, send to Close Week |
| `amount > owed` | modal + server `enforceCollectCap` | Reason textarea appears, required |
| Owed changed since load | server `assertExpectedOutstanding` → 409 | "Amount changed — refresh" (refetch the queue and reopen) |
| Duplicate submit | `idempotencyKey` replay | Returns the original movement, no double-count |
| Endpoint missing | `isSettlementCommandUnavailable` | "Settlement commands unavailable — redeploy fleet-server". **Never writes a transaction instead.** |

### 6.2 Data & performance

The Dashboard is the landing page. Do **not** add an eager settlements query for every user.

- **Recommended:** `enabled: pickerOpen` (as written above). First paint is unchanged; the
  queue loads while the picker's skeleton is on screen (~1 request, `pageSize: 200`).
- Optional nicety: prefetch on `onMouseEnter` / `onTouchStart` of the button.
- If you later want the count badge, flip to `enabled: can('settlements.collect') && rideshareVisible`
  and accept one extra request per dashboard load.

After a successful collect, `invalidateSettlementQueries(qc)` invalidates
`settlementKeys.all`, `DRIVER_FINANCIAL_PERIODS_KEY` and the legacy queue keys, so the
Settlements desk is already correct when the owner navigates there.

### 6.3 Offline / flaky network

Cash is often logged at the roadside. `settlementCommandsApi` uses `fetchWithRetry`, and the
idempotency key makes a retry safe. Do **not** add optimistic UI or an offline queue for this
action — a cash collection that "looks logged" but never posted is worse than a visible
failure. Keep the modal open on error (`LogCashPaymentModal` already does this: it only calls
`onClose()` after `onSave` resolves).

---

## 7. Tests

| Test | Asserts |
|---|---|
| `useCashCollection.test.ts` | `collectBlockReason` returns non-null for: open week, `periodFrozen`, `moneyUnlocked !== true`, `sealBroken`; null for a clean ended week |
| `useCashCollection.test.ts` | driver grouping sums only collectable weeks; a driver whose every week is blocked is excluded from `drivers` but counted in `blockedCount` |
| `logCashDeliveryHidden.test.tsx` | Dashboard with `activeLine='delivery'` renders no element matching `/log cash/i` — **this is the S-6 regression guard, do not skip it** |
| `logCashPermission.test.tsx` | `fleet_viewer` / `fleet_accountant` see no button |
| Existing | `node scripts/check-remittance-separation.mjs` still passes (CI already runs it with `REMITTANCE_S6_DIFF=1`) |

Typecheck: this repo has a **known non-zero `tsc` baseline** for `apps/fleet` (~500 errors).
Record the count before your change and compare after — the target is "no growth", not zero.
Vitest strips types, so a green test run does not mean the types are clean; gate on `tsc`.

---

## 8. Build order

1. **PR 1 — hook.** `useCashCollection.ts` + unit tests. No UI. Lift the rules from
   `DriverSettlementsPage.tsx:934` (`openLogCashForDriver`), `:1238` (`saveCollectPayment`),
   `:1544` (`collectPeriodForModal`).
2. **PR 2 — quick action.** `LogCashQuickAction.tsx`, Dashboard wiring, `onNavigate` prop
   through `App.tsx:677`, delivery-hidden + permission tests.
3. **PR 3 — desk refactor.** Point `DriverSettlementsPage` at the hook, delete the duplicate
   logic. Keeps the two surfaces from drifting.
4. **PR 4 (optional) — row-level Log cash** in `DashboardDriverTable`'s overflow menus.

Keep remittance/delivery files out of every one of these PRs — the S-6 diff gate fails any
changeset that touches both remittance paths and `fleet-financials/**`.

---

## 9. Decisions still yours

1. **Mobile layout:** dedicated third button (recommended) vs. folding into a relabelled
   "Quick actions" `+` menu.
2. **Count badge** on the desktop button — costs the eager query (§6.2).
3. **Gate dialogs vs. toasts** for frozen/locked weeks on the Dashboard (§5.2 step 5).
4. **Row-level action** in phase 2, or picker-only forever.

---

## 10. References

- Dashboard: `apps/fleet/src/components/dashboard/Dashboard.tsx` (header `:542-617`, mobile row `:706-729`, service-line tabs `:762-793`)
- Modal (reused as-is): `apps/fleet/src/components/drivers/LogCashPaymentModal.tsx`
- Desk logic to lift: `apps/fleet/src/components/fleet-financials/DriverSettlementsPage.tsx:934`, `:1238`, `:1544`
- Queue read model: `apps/fleet/src/hooks/useSettlementQueue.ts`
- Command client: `apps/fleet/src/services/settlementCommandsApi.ts`
- Server route: `supabase/functions/_fleet-server/settlement_commands_controller.tsx:459`
- Separation guard: `scripts/check-remittance-separation.mjs`, `.github/workflows/ci.yml:50-53`
- Delivery COD stance: `apps/fleet/src/components/couriers/CourierSettlementsPage.tsx:70-73`,
  `docs/CASH_ARCHITECTURE_ONBOARDING.md` Parts 11–24
- Permissions: `packages/auth-client/src/permissions.ts:304-308`, `:378`, `:398`, `:424`
