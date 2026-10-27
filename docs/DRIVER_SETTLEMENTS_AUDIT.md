# Driver Settlements + Fleet Policy Configuration — Audit

**Rev 28 · 2026-10-27 · no open code findings · Sep 14 Fuel locked, at Trips & earnings**

Rev 1–27 are in git history. This revision lists open items only.

**Verified (prod, 16:58 UTC):**
- **The prepare-snapshot fix works.** Sep 14 got `fuel_week_snapshot` v1 at 15:52, the period **locked** at 16:05, and the finalize job **succeeded** with no seal error.
- **Sep 14 statements are all closed.**

  | Statement | Version | Amounts |
  |---|---|---|
  | Earnings | v39 | driver share 27,660.32 |
  | Fuel | v2 | spend 30,343.70 · driver 2,666.78 · company 27,676.92 |
  | Toll | v2 | net 0 |

- **One blocker left:** `SETTLEMENT_FLEET_OWES` 10,230.99.
- **The netting retry fix is in** (`2c7868ed`): a retry writes whichever half is missing.
- Oct 19 = **+37,397.13**.

## 1. Sep 14 now: the fleet owes Kenny 10,230.99
- **Fuel Finalize added his cash fuel.** It credited the 21,000 he paid at the pump (6 cash fills), which flipped the week from −8,102.23 to **+10,230.99**. The arithmetic ties:
  - Payout: 27,660.32 − 2,666.78 = 24,993.54.
  - Cash held: 51,462.55 − 15,700.00 returned − 21,000.00 fuel = 14,762.55.
  - 24,993.54 − 14,762.55 = **10,230.99**.
- **Done 17:07 UTC:** Pay 10,230.99 posted. Sep 14 = 0, no blockers. Trips & earnings is complete, and earnings v39 was sealed at 16:08 (the "compute limit" note is resolved).
- **Do:** reload the page. Settlement preview → **Continue** → Close.
  - The button was missing only because the run was loaded before the 17:08 blocker refresh. The server recomputes the step on each open (`recon_routes.ts` L1434–1440).
- Settle from balance doesn't apply here: it only clears weeks where the driver owes.

## 2. Sep 21 → Sep 28 → Oct 5: use each week's own numbers after Fuel Finalize
- Fuel Finalize changes the balance, as it did on Sep 14, so the pre-Finalize figures (Sep 21 −9,480.81, Sep 28 −8,690.23, Oct 5 −39.41) and Rev 26's "Oct 19 ends at 11,084.45" are **no longer reliable**.
- **For each week, after Fuel Finalize:**
  - **Driver owes:** Collect any cash he actually handed over → **Settle from balance** against Oct 19 for the rest.
  - **Fleet owes:** **Pay** it when paid.
- Sep 21 will ask you to **Accept unusual fills** for the Sep 26 $4,000 Super Lube odometer repeat. Give a real reason.

## 3. Housekeeping
- **Untracked:** `scripts/watch-kenny-oct19.ps1` and `.sql`. Commit them or delete them.
- **Tonight's nightly (~01:12 UTC):** Oct 19 must not change.
