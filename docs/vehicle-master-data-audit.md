# Maintenance Master Data (Dominion → RoamFleet): Audit

**Rev 23 · 2026-11-05** · CLOSED — live and verified. Full design: Rev 5 in git `de63e32e`; earlier revs in git history.

**Goal:** every RoamFleet car gets a service schedule from a named, evidenced rule in Dominion for that exact car, platform or engine, and when Dominion corrects a rule every affected car's due dates and alerts follow.

## Where we are

| Step | Status |
|---|---|
| Build + tests | ✅ Done |
| Live | ✅ Live and verified (5 Nov): apps on `e204225b`, L-01 fix `1f7615c3` |

**What I checked live myself (5 Nov):**
- the switch `maintenance_master_governance` is on, and `inv_road_clearance_gate` is still off;
- 5179KZ: all 25 schedule rows have dues (after L-01);
- 1505LM correctly waits for its first odometer reading (25 rows `odometer_needed`, no reading on file).

**Cursor's live checks:**
- **passed:** checks 1–10 = 0, 16 rules, alerts ≤ 1 per part, `severe_duty` readable, purge route 404;
- **server versions:** fleet-core v241, fleet-ops v341.

## Closed in this round

**L-01 (fixed and verified live):**
- migration `20261112153100` is applied;
- 5179KZ has 25 of 25 parts with dues: brake fluid at 161,952 km or 30 Oct 2027, coolant flush at 221,952 km or 30 Oct 2030;
- 1505LM still correctly waits for its first odometer reading;
- new check 11 = 0.

**Only thing left for you to look at:** open Dominion → Vehicles. "Maintenance templates" should be there, and RoamFleet should show the new due-items drawer.

**Later phases:**
- **2:** source chips everywhere (M-05), conflict Pick A / Pick B (M-12), car status (V-08).
- **3:** "not on this car" (M-07), severe duty default (M-08), merge cars (V-07), market (V-09), badge twins (V-10), aliases (V-12).
- **4:** spec values with source (V-13).

**Owner data:** maker-sourced rules for Roomy M900A/M910A and Fit GP5; replace or confirm the 16 `Roam policy` rules.

## Rules for later work

- **Screens:**
  - add to existing pages;
  - no Stitch-invented chrome;
  - no sample content or test-only switches.
- **Tests:**
  - real local stack; only sign-in may be stubbed;
  - fix the app or the seed, never widen access;
  - fixtures must include old live-style rows, not only fresh ones.
- **Which rule wins:** car → platform → platform family → engine → global; `needs_checking` only when no active rule matches.
- **Interval used:** custom (≤ Roam's), then severe, then normal. Due = last done (else starting odometer) + interval, whichever comes first.
