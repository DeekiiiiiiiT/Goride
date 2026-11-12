# Cursor prompt — Toll Phase 1, P1-R3: connect Roam rides to toll v2

Read `docs/toll-architecture.md` → Part F "Phase 1" (facts and decisions) first. **No migrations.** Do not commit, branch or push.

The database side is done (Claude, `supabase/migrations/20261112222929_toll_v2_roam_native.sql`). The rides service calls three **service-key-only** RPCs:
- `toll_sys_native_ride_charge(p_company uuid, p_ride jsonb)` at ride end;
- `toll_sys_native_cash_settled(p_company uuid, p_ride jsonb)` when a cash ride's cash is settled;
- `toll_sys_tolls_v2_on(p_company uuid) → boolean`.

The first two are already no-ops for companies not on v2, and repeat-safe per ride (a second call returns `replay: true`). **The database decides tag or cash** for each crossing from the vehicle's tag assignment, so **don't send `paid_by`**.

## 1. Build the payloads (pure, testable): `supabase/functions/rides/tolls/nativeTollPayload.ts`
- `buildNativeRideCharge(ride, crossings, vehicleId)` →
  ```
  { ride_id, payment_method: ride.payment_method, driver_id: ride.assigned_driver_user_id, vehicle_id: vehicleId ?? null,
    ended_at: ride.completed_at ?? ride.dropoff_arrived_at ?? ride.fare_locked_at ?? <now ISO>,
    estimated_tolls_minor: Number(ride.fare_breakdown?.estimated_tolls_minor ?? 0),
    crossings: crossings.map(c => ({ id: c.id, plaza_id: c.toll_plaza_id, amount_minor: c.toll_amount_minor, crossed_at: c.crossed_at })) }
  ```
- `buildNativeCashSettled(ride)` →
  ```
  { ride_id, outcome: ride.cash_settlement_outcome ?? 'exact', cash_received_minor: ride.cash_received_minor ?? ride.fare_final_minor ?? 0,
    estimated_tolls_minor: Number(ride.fare_breakdown?.estimated_tolls_minor ?? 0), driver_id: ride.assigned_driver_user_id,
    settled_at: ride.settled_at ?? ride.completed_at ?? <now ISO> }
  ```
  Map any outcome other than exact / overpay / underpay / unpaid (for example `split`) to `exact` **only if** `cash_received_minor >= fare_final_minor`, else `underpay`. Say in a comment why.
- `nativeTollCallsFor(ride, moment)` → which calls to make, in order:
  - `moment 'awaiting_cash'` (a cash ride enters `awaiting_cash_settlement`) → `['ride_charge']`;
  - `moment 'completed'` + card → `['ride_charge']`;
  - `moment 'completed'` + cash → `['ride_charge', 'cash_settled']` (the first replays if it already ran);
  - **nothing** when `ride.organization_id` is empty or `ride.attribution_mode !== 'fleet'`, or the payment method is missing.

## 2. Call them (never break a ride): `supabase/functions/rides/tolls/nativeTollSync.ts`
`syncNativeTolls(ride, moment)`:
1. Work out the calls with `nativeTollCallsFor`.
2. Load the ride's crossings from `rides.ride_toll_crossings` (by `ride_request_id`).
3. Resolve the vehicle the same way `_shared/rideToFleetTrip.ts` does (~lines 168–170).
4. Call the RPCs with the **service client** the rides function already uses.

**Wrap everything in try/catch.** Log `console.error('[toll-v2] native sync failed', { rideId, moment, code, message })` and return. **Never throw into the ride flow.** A missed call will be caught by the P1-R5 nightly gap check.

Hook it in two places (the facts in Part F name them):
- `applyRideTransition` (`supabase/functions/rides/rideLifecycle.ts:116`): after the compare-and-set update succeeds, when the new status is `awaiting_cash_settlement` → `syncNativeTolls(updatedRide, 'awaiting_cash')`. If `deps` is the right way to inject it (as `handleTerminalRideLedgerAndSync` is), do the same.
- `handleTerminalRideLedgerAndSync` (`supabase/functions/rides/index.ts:643`): when the ride's status is `completed` → `syncNativeTolls(ride, 'completed')`, after the existing steps. This one function already runs for every completion, card and cash, including after cash settlement.

Use the ride row as it is **after** the update, so the cash outcome and amounts are filled in. If the function only has the old row, re-read the ride.

## 3. Old paths must skip v2 companies (no double counting)
- **Toll Brain live record** (`supabase/functions/toll-brain/index.ts` ~lines 284–341): before the KV `toll_ledger:` materialize, the `toll_bridge:crossing:` marker and the unified-ledger dual write, call `toll_sys_tolls_v2_on(<ride's organization_id>)`. If true, **skip those writes**. The crossing row and `actual_tolls_minor` stay exactly as today.
- **`POST /bridge-rides`** (`supabase/functions/_fleet-server/toll_controller.tsx` ~9714 `bridgeRideTollCrossings`): skip crossings whose ride's `organization_id` is on v2. Look it up once per company per run, and count them in the response as `skippedV2`.

## 4. Tests (Deno) and CI
- `supabase/functions/rides/tolls/nativeTollPayload.test.ts`:
  - every branch of `nativeTollCallsFor`, including independent rides and a missing organization;
  - both payload builders: estimate from `fare_breakdown`, no `paid_by` in crossings, and the end-time and outcome fallbacks, including `split` with enough and with too little cash.
- `supabase/functions/rides/tolls/nativeTollSync.test.ts`: with fakes,
  - an RPC error is caught (no throw) and logged;
  - an independent ride makes no calls;
  - completed cash makes two calls in order.
- Find where the rides function's Deno tests run in `.github/workflows/ci.yml`, and add both files there. If there's no rides step, add them to the toll step.
- A small test for the Toll Brain skip and the bridge-rides skip if those files already have tests nearby. If they don't, say so; don't build a new framework.
- Rebuild any committed edge bundles that include the changed files (fleet-toll includes `toll_controller.tsx`) with `scripts/build-edge-bundle.mjs`, and run the edge route manifest and route-contract checks.

## Run (once)
The new Deno tests, `pnpm test:toll` (Docker Desktop open), the bundle and manifest checks. If something fails, report it and stop.

## Report
Give clickable links to the files you changed and the results of what you ran. Don't paste file contents — I'll read the files. Say exactly where each hook was added (file:line). Before you finish, stop any app, dev server or test server you started (ports 3000, 3001, 4173, 5173, 5180–5183); you may leave the Supabase Docker database running.
