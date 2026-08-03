# Dash Launch — Staged Rollout → Full Launch (Phase 4)

## Staged cohort (few days–1 week)

1. Enable a small set of real merchants + couriers in one area.
2. Ship **full** Phases 0–3 feature set (no stubs, no manual bank workarounds).
3. Watch `/health/dash-golden-path` and payment/dispatch dashboards live.

## Go / no-go (all must pass)

- [ ] Customer browses real menu, pays WiPay/PayPal; totals match server; no fake address in prod
- [ ] Merchant receives order realtime; accept/prep/ready works; server rejects when closed/holiday/not accepting
- [ ] POS card-present works on real Terminal hardware for enabled merchants
- [ ] Dispatch is proximity-aware; redispatch cron running; no silent stranded ready orders at normal volume
- [ ] Courier native app tracks in background; active delivery shows real customer/items/tip; maps deep-links open
- [ ] Cancels clear courier busy state (merchant/admin/customer/courier-issue abort)
- [ ] Merchant + courier paid via Connect on schedule; close-period cannot double-create
- [ ] SMS and/or push notify correctly; VAPID missing fails loud (`REQUIRE_VAPID=1`)
- [ ] Golden-path e2e green; load test passed; monitoring live; support runbook exists
- [ ] Security + legal sign-offs written
- [ ] Staged cohort: zero unresolved P0/P1-class incidents

## Full launch

Remove cohort restriction only after go/no-go is fully checked.

Any P0/P1 incident during cohort → fix and reset that area’s clock (not necessarily the whole plan).
