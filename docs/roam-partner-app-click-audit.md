# Roam Partner (Merchant App) — Full Click-Through Audit

**Original scope:** `apps/dash-merchant` — every page and component across onboarding/auth, the core dashboard/orders/menu, earnings/analytics/settings, restaurant-management (POS + inventory), staff station screens, and store-tablet/venue-ops.
**Method:** Read-only source audit. Original pass 2026-08-19. **Re-verified 2026-08-20** after the owner made substantial changes. **Remediation implemented 2026-08-20** (phased fix program). Companion plan executed end-to-end; delivery edge function redeployed.
**Companion docs:** [Roam Rush (customer) click audit](./roam-rush-customer-app-click-audit.md) · [Roam Courier click audit](./roam-courier-app-click-audit.md)

---

## 0. Read this first: the app was split in two

`apps/dash-merchant` is the owner-facing dashboard. In-store / staff / tablet / POS / inventory live in `apps/rush-command` (shared logic in `packages/merchant-ops`). Tablet route on dash-merchant redirects to Command.

**Product default:** treat both as production surfaces (`dash-merchant` = owner app; `rush-command` = Command). A **full systematic `rush-command` click-audit** is still recommended as a follow-up (this doc’s §5 was incidental, then remediated).

---

## Remediation status (2026-08-20)

### `dash-merchant` — Done
| # | Item | Status |
|---|---|---|
| 1 | Orders queue status mutation (`PUT /orders/:id/status`) | Done |
| 2 | Bank & Payouts / Update Bank Details → `PayoutSetupSheet` | Done |
| 3 | Max daily order capacity persisted via `merchant_settings` | Done (field + API). **Follow-up:** enforce cap in order intake |
| 5–8 | Top-bar chrome, socials API, onboarding step count, menu filter/list | Done |
| 9–15 | Help, menu bell, Earnings wallet/history, analytics dead UI, remember-me, dashboard inline actions, availability toggle | Done |
| 16–18 | Orphan profile settings deleted; bank section wired; copyright year | Done |

### `rush-command` — Done (from incidental §5)
| Item | Status |
|---|---|
| Counter `OrderAcceptedSheet` props | Done |
| Venue-ops server `in_store_operations` check + client rollback/banner | Done |
| merchant-ops package exports + CI smoke typecheck | Done |
| Recipe editor editable + save | Done |
| UOM conversion write API + editor | Done |
| Prep station `kind` + Bar Queue routing | Done (API + filter). **Follow-up:** kind picker UI when prep-station editor ships |
| First-party QR (no third-party CDN) | Done |
| POS add note + Settings; notifications icon removed | Done |

### Explicit follow-ups
1. ~~**Capacity enforcement**~~ — **Done 2026-08-20** (`assertMerchantAcceptingOrders` counts Jamaica-day non-cancelled orders vs `max_daily_capacity`; customer browse/checkout 409).
2. **Full `rush-command` click-audit** — parity with Rush / Courier / Partner audits.
3. ~~**Prep-station kind UI**~~ — **Done 2026-08-20** (Operations Hub Prep Stations panel with Kitchen/Bar/Other).
4. Labeled “coming soon” (Download Statement, Legal & Terms, Live Chat) — intentionally unchanged.

---

## 1. Historical snapshot (pre-fix, 2026-08-20 morning)

Orders queue regression (`POST /merchant/orders/.../status`) and payouts loop were the highest-severity findings. See git history / remediation table above for current state.

---

## 2. Master punch list — post-fix status

### Critical
1. ~~Orders queue wrong endpoint~~ — **Done** (`useOrderStatusMutation` → `PUT /orders/{id}/status` + `actorType: 'merchant'`).
2. ~~Bank/payout unreachable after first order~~ — **Done** (Settings + Earnings open `PayoutSetupSheet`).
3. ~~Max daily capacity discarded~~ — **Done** (persisted + enforced on customer `POST /orders` / browse).
4. ~~Recipe / UOM (moved to Command)~~ — **Done** in `rush-command`.

### High
5–8. ~~Dead top-bar / socials / onboarding counts / menu filter-list~~ — **Done**.

### Medium / Low
9–18. ~~All listed~~ — **Done** (orphan file deleted; bank section wired).

### Confirmed correct (unchanged)
Labeled “coming soon” placeholders remain honestly labeled.

---

## 3. Screen-by-screen (`dash-merchant`) — post-fix

| Screen | Verdict |
|---|---|
| Login | ✅ Auth real. ✅ Remember me toggles persistent vs ephemeral session. |
| Onboarding | ✅ Persists; step counts use `WIZARD_TOTAL_STEPS`. |
| Top bar | ✅ Bell → Orders; avatar/settings → Account. |
| Dashboard | ✅ Inline Accept / Mark Ready via shared mutation. |
| Orders queue | ✅ Status actions use correct PUT route. |
| Order detail Ready | ✅ Help → Account (Help & Support hub). |
| Menu | ✅ Filter + grid/list; availability toggle aligned; bell → Orders. |
| Earnings | ✅ Wallet + Update Bank → payout sheet; History = earnings transactions. |
| Analytics | ✅ Dead “More” removed; View All wired when provided. |
| Account / Bank | ✅ Opens payout sheet. |
| Edit Profile | ✅ website / instagram / facebook via merchant PUT. |
| Delivery Settings | ✅ max daily capacity via settings API. |

---

## 4. Suggested order of operations — completed

Phases 0–4 of the remediation plan shipped 2026-08-20. Remaining work is the **Explicit follow-ups** list above.

---

## 5. `apps/rush-command` (incidental findings — remediated)

### Previously fixed before this program
- Staff-roster URL, `ActingShiftBar`, capability-backed station toggles (read path).

### Remediated in this program
- Recipe + UOM editors save for real.
- Bar Queue prefers prep-station `kind === 'bar'` (keyword heuristic only if `kind` null).
- Tablet QR is first-party (`qrcode.react`).
- POS note + Settings; notifications icon removed.
- Counter accept sheet shows real order number + merchant prep time.
- Venue-ops writes require `in_store_operations` server-side; client no longer uses feature flags as write auth; failed toggles revert.
- `@roam/merchant-ops` subpath exports + CI smoke typecheck (`pnpm --filter @roam/rush-command typecheck`).

### Still recommended
Schedule a dedicated full `rush-command` click-audit. Prep-station kind picker ships on Operations Hub (Kitchen / Bar / Other).
