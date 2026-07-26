# Money Ledger Rules — Roam Platform, Fleet Ops, and Revenue

**Status:** Canonical product + engineering source of truth  
**Date:** 2026-07-26  
**Supersedes conflicting wallet guidance in:** [`FLEET_DRIVER_WALLET_AUDIT.md`](FLEET_DRIVER_WALLET_AUDIT.md) (audit retained as history)

This document locks who owes whom. Do not merge Layer A and Layer B into one wallet UI or one balance.

---

## 1. Three layers

| Layer | Name | Who ↔ Who | Tracks |
|-------|------|-----------|--------|
| **A** | Roam Platform Trip Ledger | Rider / driver / (later) fleet org ↔ Roam | Passenger-app trips: Cash / Digital / Debt (and org accounts when fleet org payout is on) |
| **B** | Fleet Operating Ledger | Driver ↔ Fleet owner | Cash still with driver, Log Cash, weekly settlement, fuel/tolls, Start Trip / Manual Entry |
| **C** | Roam Revenue | Fleet or independent ↔ Roam | `platform_fee_minor` (default **0%** until product sets a rate) |

```
Passenger app booking ──► Layer A (rides schema + journals)
                              │
                              └── syncRideToFleetKv ──► Layer B (fleet books)

Start Trip / Log Manual Trip ──► Layer B only (never Layer A)
```

---

## 2. Layer A — Roam platform wallets

**Independent driver**

- Cash trip → cash settlement → driver Cash / Digital / Debt as today.
- Card trip → driver Digital.
- Driver receives fare (minus Roam fee when fee > 0). Tips stay with driver.

**Fleet driver (matched Roam trips)**

- Until `fleet_org_payout_enabled` is on: same personal wallets as independent (legacy behavior).
- When flag is on: **fare** (minus Roam fee) credits **fleet org** accounts; **tips** credit **driver** Digital.
- Cash settlement overlay still collects physical cash from the rider (ops UX). Physical handover of that cash to the company is **Layer B only** (Log Cash / weekly settlement).
- Driver personal Cash-in-Hand for fleet + org-payout mode must not imply a second “pay Roam this fare cash” debt.

**What Layer A never includes**

- Start Trip / Log Manual Trip / Uber / InDrive imports (those are Layer B).

---

## 3. Layer B — Fleet Cash Wallet / Settlement / Fuel

**Meaning:** “The driver is holding company cash. How much should we collect?”

After weekly math (passenger cash, Log Cash, fuel credits, tolls, driver share):

- Driver owes fleet, or fleet owes driver, or cash still with driver (week not finalized).

**Inputs**

- Cash trips in fleet KV (manual, Start Trip, synced Roam cash trips, Uber cash, etc.).
- Log Cash (Cash Returned).
- Fuel finalize / toll decisions.

**Drivers must see** Weekly Settlement + Fuel Wallet in the driver app under **Fleet Settlement** (separate from Roam Earnings). Admins see the same desk on roamfleet.co.

---

## 4. Layer C — Roam take-rate

- Column / ledger line: `platform_fee_minor`.
- Fee base: trip fare only — **tips excluded**.
- Default rate: **0** (`roam_platform_fee_bps = 0`) so production balances stay unchanged until product sets a rate.
- When fee > 0 and fleet org payout is on: Roam’s cut is a **fleet ↔ Roam** obligation (card netting / invoice), not a second driver cash desk.

---

## 5. Start Trip (temporary)

- Exists only because the passenger app is not yet widely available (e.g. App Store).
- Writes **only** to fleet KV via `saveTrips` / tripFactory — **never** `rides.ride_requests`.
- Counted in Fleet Settlement / Trip Analytics only.
- Controlled by `manual_start_trip_enabled` (default on for fleet). Flip off after passenger booking is live; do not delete historical fleet trips.

---

## 6. Kenny case (explicit)

Kenny completes four **Manual Entry / Start Trip** trips in a week → Fleet Ops shows ~$6,500 cash/earnings in Layer B.

Driver Roam Earnings shows **$0** Cash-in-Hand / Total — **correct**. Those trips never entered Layer A.

Do **not** backfill manual trips into the Roam rides ledger to “fix” the $0. Backfill/rebuild Layer B periods only if Fleet Cash Wallet and Trip Analytics disagree.

---

## 7. Hard rules for implementers

1. Never merge Fleet Cash Wallet numbers into Roam Cash / Digital / Debt chips.
2. Never write Start Trip into `rides.ride_requests`.
3. Never backfill Start Trip / Manual Entry into Roam Cash-in-Hand.
4. Physical cash handover for fleet drivers is Log Cash / weekly settlement only.
5. `fleet_org_payout_enabled` defaults **off**; pilot one org before global on.
6. Independents must see zero behavioral change from fleet-only phases.

---

## 8. Feature flags

| Flag | Default | Purpose |
|------|---------|---------|
| `manual_start_trip_enabled` | on (fleet) | Show Start Trip; retire after App Store |
| `fleet_org_payout_enabled` | off | Credit org accounts for fleet Roam fares |
| `roam_platform_fee_bps` | 0 | Layer C rate in basis points |

---

## Related docs

- Audit (history): [`FLEET_DRIVER_WALLET_AUDIT.md`](FLEET_DRIVER_WALLET_AUDIT.md)
- Migration audit: [`FLEET_DRIVER_MIGRATION_AUDIT.md`](FLEET_DRIVER_MIGRATION_AUDIT.md)
