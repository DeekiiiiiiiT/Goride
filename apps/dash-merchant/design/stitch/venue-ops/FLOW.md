# Venue Operations — Flow Map

How owner setup, back-office admin, and tablet stations connect in the Roam Dash Partner app.

## Owner setup swimlane

```
Account
  └─ Operations Hub
       ├─ Business type summary (stations preset from sign-up)
       ├─ Station toggles (POS, Kitchen, Dispatch, Bar, Expo, Drive-thru, Manager)
       ├─ Admin modules → Restaurant Management
       │    ├─ Inventory (ingredients, recipes)
       │    ├─ Reports (in-store sales)
       │    └─ Settings (printer, receipts)
       ├─ Pair a new tablet (QR + pairing code)
       └─ Team roster shortcut → Team Members

Account
  └─ Team Members
       ├─ Devices (pairing code, station QR links, staff/PIN toggles)
       ├─ Add team member / Add floor staff (name, display title, role, default station)
       └─ Current team (edit role vs station, reset PIN)
```

When **venue operations** is on, POS is removed from Restaurant Management — checkout runs on **POS tablets** instead.

## Tablet kiosk swimlane

```
partner.roamdash.co/tablet  (or station deep link with ?code=&station=)
  └─ Enter pairing code (if needed)
  └─ Pick station (disabled stations greyed out)
  └─ Pairing success
  └─ Staff picker (name + display title on roster)
  └─ Enter / create PIN
  └─ Station view:
       ├─ POS Register
       ├─ Kitchen KDS
       ├─ Dispatch (counter handoff)
       ├─ Bar queue (drink items)
       ├─ Expo pass (ready orders → hand off)
       ├─ Drive-thru lane (paid → preparing → complete)
       └─ Manager dashboard
```

## Stitch screen index

See [README.md](./README.md) for Stitch screen IDs. React implementation:

| Area | Path |
|------|------|
| Operations Hub | `src/components/venue-ops/` |
| Restaurant Management | `src/pages/restaurant-mgmt/` |
| Team / roster | `src/components/account/TeamMembersView.tsx` |
| Store tablet pairing | `src/components/store-tablet/` |
| Station views | `src/pages/staff-ops/` |

## Station label contract

DB value `counter` displays as **Dispatch** in all UI.

## Feature flags (dev)

Stored in `localStorage` as `roam_partner_flags_{merchantId}`:

- `venueOpsV2` — Operations Hub, admin module links, extended stations
- `staffOperationsV1` / `staffStationPinV1` — floor staff + tablet PIN
- `restaurantMgmtPreviewV1` — Restaurant Management preview without live capability
