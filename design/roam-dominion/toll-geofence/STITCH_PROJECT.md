# Toll Geofence UI — Stitch Project

**Project:** ROAM DOMINION  
**Stitch project ID:** `2140064615552965419`  
**Resource name:** `projects/2140064615552965419`

## Screens (A–H)

| ID | Screen | Device | Stitch label |
|----|--------|--------|--------------|
| A | Rider Booking Fare Breakdown Sheet | MOBILE | `toll-rider-fare-breakdown` |
| B | Rider Live Trip Toll Banner | MOBILE | `toll-rider-live-banner` |
| C | Rider Trip Receipt Toll Section | MOBILE | `toll-rider-receipt` |
| D | Driver Toll Detected Toast | MOBILE | `toll-driver-toast` |
| E | Driver Cash Collection with Tolls | MOBILE | `toll-driver-cash` |
| F | Admin Live Toll Monitor | DESKTOP | `toll-admin-live-monitor` |
| G | Admin Trip Toll Detail Drawer | DESKTOP | `toll-admin-trip-drawer` |
| H | Fleet Geofence Match Badge | DESKTOP | `toll-fleet-geofence-badge` |

## Design tokens

- **Rider/Driver:** Roam Rides passenger theme (primary green, rounded-2xl cards)
- **Admin/Fleet:** Slate/emerald admin (matches roamdominion AdminLayout)

## React implementation

Implemented in `packages/toll-ui/` — see `COMPONENT_INVENTORY.md`.
