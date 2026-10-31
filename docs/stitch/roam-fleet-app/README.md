# Stitch project: Roam Fleet APP

- **Project id:** `3587123323600813385`
- **Design system:** Precision Operations (`assets/d393c21ec4be4c768bf9a2e8060fd674`)

## Trip Analytics screens

HTML only, under `docs/stitch/roam-fleet-app/html/`. These are layout references. The live page is Trip Analytics in the fleet app, and its numbers come from the trips API.

| # | Screen | File | Stitch screen id |
|---|---|---|---|
| 1 | Desktop | `trip-analytics-desktop.html` | `94a3b2d593284f3b9383a59b734b2980` |
| 2 | Phone | `trip-analytics-phone.html` | `7cc5c8c9e12a4a5dba772c0808e2fee2` |
| 3 | Roam rider-app funnel | `roam-funnel.html` | `0eebda198ec54dd0874d51c19dc95b5b` |
| 4 | Error, empty, and missing-metric states | `trip-analytics-states.html` | `b7f77d907a604ca5955d13a7a5625dbf` |
| 5 | Anomaly review drawer | `trip-analytics-anomaly-drawer.html` | `20650c0b41d54341abbae0b31147a6bf` |

Open a file from disk. Do not copy these files into an app public folder.

## Find parts screens

HTML only, under `docs/stitch/roam-fleet-app/html/`. These are layout references for Fleet maintenance → Find parts. Live numbers come from the parts routes. Reference pictures are `screenshots/FP*-stitch.png`.

| # | Screen | Stitch screen id | File | Route | Ported to | Status |
|---|---|---|---|---|---|---|
| FP1 | Pick the car | `find_parts_pick_the_car` | `html/find-parts-car.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/CarStep.tsx + apps/fleet/src/components/vehicles/find-parts/PartsActivityPanel.tsx + apps/fleet/src/components/vehicles/find-parts/FindPartsTab.tsx` | Not started |
| FP2 | Which one is yours? | `find_parts_which_one_is_yours` | `html/find-parts-variant.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/VariantStep.tsx` | Not started |
| FP3 | What part? | `find_parts_what_part_guided_browser` | `html/find-parts-browse.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/PartStep.tsx` | Not started |
| FP4 | Front or back? | `find_parts_front_or_back` | `html/find-parts-position.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/PositionStep.tsx` | Not started |
| FP5 | Results | `find_parts_results_in_five_match_types` | `html/find-parts-results.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/ResultsView.tsx` | Not started |
| FP6 | Part detail drawer | `find_parts_part_detail_drawer` | `html/find-parts-detail.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/PartDetailDrawer.tsx` | Not started |
| FP7 | Request a quote | `find_parts_request_a_quote` | `html/find-parts-quote.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/QuoteDialog.tsx` | Not started |
| FP8 | Ask Roam to find it | `find_parts_ask_roam_to_find_it` | `html/find-parts-request.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/RequestPartPanel.tsx` | Not started |
| FP9 | Car not linked yet | `find_parts_car_not_linked_yet` | `html/find-parts-link-car.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/LinkCarPanel.tsx` | Not started |
| FP10 | Your parts activity | `find_parts_your_parts_activity` | `html/find-parts-activity.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/PartsActivityPanel.tsx` | Not started |
| FP11 | Loading, error, no permission | `find_parts_loading_error_no_permission` | `html/find-parts-states.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/FindPartsTab.tsx` | Not started |
| FP12 | Phone (390 px) | `find_parts_phone_390px` | `html/find-parts-phone.html` | `find-parts` | `apps/fleet/src/components/vehicles/find-parts/ResultsView.tsx + apps/fleet/src/components/vehicles/find-parts/QuoteDialog.tsx` | Not started |
