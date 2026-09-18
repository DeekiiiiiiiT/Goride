# Fuel flag disposition — operator go-live brief (2026-09-18)

This path is **live**. There is no feature flag. Merging / deploying enables blocking behavior immediately.

## What changed for operators

1. **Critical integrity flags now hard-block week lock.**  
   Previously only fills with `signalTier === exception` blocked finalize. Now any open `integrity_critical` (and exception) flag must be dispositioned before the week can lock.

2. **Expect a one-time spike of blocked weeks** the first time you close periods after deploy. That is intended — flags are no longer “cleared” just because the week locked.

3. **Where to clear them**  
   **Fleet Operations → Fuel Integrity → Fill flags**  
   - Accept (with note) if the fill is OK  
   - Edit the fill if the numbers are wrong  
   - Escalate if it needs a dispute  
   Critical accepts require an 8+ character note and the `fuel.accept_unexplained` permission.

4. **Week reconciliation edge**  
   From the Integrity desk, use **Reconcile this week →** to jump into Business Finance → Week Reconciliation → Fuel for the same week.

## What did not change

- Fuel money math (category costs, residual, driver share, settlement) is untouched.
- Warnings still count and show on the desk; they do **not** block lock.
- Stop-to-stop still uses the existing bucket engine.

## Telematics

The Telematics tab is hidden until a GPS/telematics provider is connected. Do not expect a third Integrity subtab yet.

## Unverified vendor queue

After deploy, **auto-create volume for unverified vendors will drop.**

Previously the save path treated almost every transaction-linked fill without a verified station as “no GPS” (it read coordinates from the wrong field). It now creates an unverified vendor only when:

- GPS coordinates are genuinely missing on the fill, **and**
- there is no verified station match, **and**
- the fill has a vendor/station name and a linked transaction.

If you own the unverified-vendor review queue, expect fewer new items — same heads-up courtesy as the blocked-weeks spike above.

## Repo detail

Full architecture and verification: `docs/fuel-recon/fuel-flags-disposition-plan-2026-09-18.md` (Rev 12+).
