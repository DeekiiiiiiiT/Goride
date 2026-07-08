# QA: Ride Lifecycle Automation (Web v1)

Manual test script for enterprise ride automation on **Roam Driver (web)** and **Roam Rides (passenger web)**.

## Prerequisites

- Migrations applied (`20260530120000_ride_live_tracking.sql`, `20260531120000_app_permission_policy.sql`)
- Rides Edge function deployed with location + geofence endpoints
- Dispatch settings: enable flags in **Admin → Control Panel → In-trip automation** (staging: all on; production: gradual rollout)
- Permission policy: **Admin → App Permissions** (rider + driver portals) — see `APP_PERMISSIONS.md`
- Two test accounts: rider + independent driver
- Real Android Chrome or iOS Safari devices with location enabled

## 1. Book ride (passenger)

1. Sign in to Roam Rides, set pickup and drop-off, wait for fare quote.
2. Confirm route polyline appears on home map.
3. Tap **Book** — navigate to live ride page.
4. **Expect:** Status `Finding a nearby driver…`, no driver pin yet.

## 2. Accept (driver)

1. Driver goes **Online** on roamdriver.co dispatch tab.
2. Accept incoming offer.
3. **Expect:**
   - Status auto-advances to **En route** (if `auto_en_route_on_accept` on)
   - Google Maps opens to pickup
   - No “Start navigation” button required
   - Live GPS banner on active ride panel

## 3. Trip GPS stream

1. Keep driver app in foreground; drive or simulate movement toward pickup.
2. **Expect:** `ride_location_updates` rows in DB (or ops panel shows “Last GPS” updating).
3. Background tab briefly, return — **Expect:** immediate location burst on visibility.

## 4. Auto arrive at pickup

1. Enter pickup geofence at low speed; wait for dwell seconds (default 15s).
2. **Expect:** Status → **Arrived at pickup** without tapping “I've arrived”.
3. **Fallback:** Tap **Manual: I've arrived** if GPS drift blocks auto-arrive.

## 5. Start trip

1. **Swipe to start trip** on driver panel.
2. **Expect:** Maps opens to drop-off; rider status → **On trip**; live map shows driver pin.

## 6. Complete at drop-off

1. Enter drop-off geofence; wait for dwell.
2. **Expect:** Driver sees “Complete suggested”; rider map still updates.
3. Tap **Complete trip**.
4. **Expect:** Cash receipt on rider app; ledger lines unchanged from pre-automation baseline.

## 7. Rider live experience

During steps 2–6 on rider app:

- Live map visible from driver assigned through on trip
- Driver pin moves without manual refresh (realtime + 30s fallback poll)
- Cancel allowed through **driver en route** with warning copy
- Cancel blocked on **on trip** (support message only)

## 8. Driver cancel

1. Start a new test ride; at pickup use **Cancel ride** with reason.
2. **Expect:** Ride cancelled; driver returns to offer queue.

## 9. Ops panel

1. Admin → **Ride Operations**
2. **Expect:** Active rides list with status, last GPS age, complete-suggested flag.

## 10. Rollback test

1. Turn off `auto_arrive_enabled` in dispatch settings.
2. Repeat pickup approach — **Expect:** No auto-arrive; manual button works.

## 11. App permission policy

1. **Rides Admin → App Permissions:** toggle rider location **Block** on → rider cannot book until browser allows location.
2. Toggle **Block** off → book works with manual addresses if location denied.
3. **Driver Admin → App Permissions:** disable notifications **Prompt** → driver onboarding sheet skips notifications nag.
4. Driver location **Block** on → **Go online** disabled until location granted.
5. Native-only rows save without errors; web shows checklist only.

## 12. Toll geofence (flags ON in staging)

Prerequisites: plazas verified in Toll Database; `route_toll_estimation_enabled` and `toll_detection_enabled` on; `toll_detect_enroute` **off**.

1. **Quote:** Book a route that crosses a known plaza — **Expect:** “View fare breakdown” shows estimated toll line(s).
2. **Live trip:** Driver passes plaza geofence — **Expect:** Rider on-trip banner updates; driver toll toast; `actual_tolls_minor` on ride.
3. **Avoid toll:** Driver takes toll-free route — **Expect:** No live toll charge (estimate may differ; credit at settlement if estimate was higher).
4. **Cooldown:** Double-cross same plaza within 5 minutes — **Expect:** Single charge only.
5. **Round trip:** Return through same plaza after cooldown — **Expect:** Second charge recorded.
6. **Cash settlement:** Complete cash trip with tolls — **Expect:** Receipt shows base + tolls ± adjustment.
7. **Ops:** Live Toll Monitor and Ride Operations **Tolls** drawer show crossings.

## Future (not in web v1 scope)

- **Phase 6 — Capacitor native:** background GPS when phone locked or in full-screen Maps. Deferred until web v1 is stable in production.

## Sign-off checklist

- [ ] Auto en route on accept
- [ ] Auto arrive ≥90% of test drives (manual fallback verified)
- [ ] Swipe start trip
- [ ] Complete with geofence suggestion
- [ ] Rider live map + realtime status
- [ ] Ops active rides panel
- [ ] No ledger regression on completed/cancelled trips
- [ ] Permission policy admin + client gates (rider book, driver go online)
- [ ] Toll quote breakdown (route estimation flag)
- [ ] Live toll detection + settlement (detection flag)
