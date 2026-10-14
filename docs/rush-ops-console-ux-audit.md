# Rush Ops Console (`/admin`): what's left

**Rev 6 · 2026-10-13** · Clicked through on the live site. One buyer landing bug was fixed locally and still needs a Rush customer deploy.

**Rev 5 note, still true:** Every finding from Rev 1–4 is fixed, committed (`ad234278`, `61717c78`) and live on the API.

**Checks run:**
- Production database: all 3 console SQL functions exist.
- `delivery` v854: the deployed `consoleAccess.ts`, `consoleRoutes.ts` and `identityRoutes.ts` match the repo byte for byte.
- `tsc` through `apps/dash-customer`: 293 errors, the same as before this work. No new errors.
- `consoleAccess.test.ts` is in CI.
- Live Rush site `roamrush.app` is production deployment `61717c78` (`roam-rush-customer`). That commit already contains `ad234278`. No frontend deploy was required for the Rev 1–4 work.

## Browser pass

There was no standing login for ops, courier-only, In-House buyer, support, or analyst. The personal owner account was not used. Short-lived logins, one role each, were signed in (including the authenticator step for owner and support) and then removed.

Each allowed hub was opened at desktop width and at 375px wide. Blocked hubs, opened by typing the address, showed "You don't have access." Nothing scrolled sideways, and the phone menu opened.

| Role | Menu | Search for "Rush Test" | Home sales | Audit log | Badges |
| --- | --- | --- | --- | --- | --- |
| Owner (`dash_admin`) | Every hub | Customer link included | Orders today 0 and Sales today J$0.00, both "same as last week", plus the today-vs-last-week hour chart | Staff, Pricing, and Merchant | Home and Support both showed 3, matching 3 open support cases |
| Ops | Home through Markets only | Customer link included | Hidden. Server said sales are hidden | Blocked | Same 3, matching the Support list |
| Courier only | No customers, merchants, finance, pricing, or settings | Courier only. No customer | Hidden | Staff history only. Pricing and Merchant stay hidden even if the address asks for them | Support badge 3 once the feed loaded |
| In-House buyer | In-House desk only | No customer results. Server refuses the search | Hidden | Blocked | None. The desk opened |
| Support | No finance, audit, markets, or In-House | Customer link included | Hidden | Blocked | Home and Support both 3, and the Home row said 3 open cases past the limit |
| Analyst | Finance, pricing, promotions, and audit. No support or team | Customer link included | Same 0 vs last week as the owner, and the hour chart. Server sales were visible | Staff, Pricing, and Merchant | "All clear." Support cases are hidden from this role, so the 3 does not appear |

Finance for the owner showed 0 people to review and 0 chargebacks, which matches sales of J$0.00 and no finance badge. Queues at zero do not show a badge.

## Fixed

An In-House buyer who opened Home was told they don't have access, instead of being sent to the In-House desk. The desk itself was fine. Home now sends a buyer-only login straight to the desk, including if they open Home again. Checked on the local Rush app at desktop and 375px. An ops login still lands on Home.

This landing fix is in the working tree. It is not on `roamrush.app` until the Rush customer app is deployed.

## Left to do

Deploy the Rush customer app so the buyer landing fix is on `roamrush.app`.
