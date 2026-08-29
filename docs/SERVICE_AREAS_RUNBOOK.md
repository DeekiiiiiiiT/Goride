# Service Areas — Ops Runbook

**Related:** [ADR 0018](./adr/0018-service-areas-live-coverage.md) · [Non-delivery zones runbook](./NON_DELIVERY_ZONES_RUNBOOK.md)  
**Last updated:** 2026-08-28

---

## Mental model

| Map color | Meaning |
|-----------|---------|
| Magenta / fuchsia | **Service area** — live delivery |
| Bright green | **Official town border** — context only once any service area exists |
| Red | Temporary **no-delivery** cutout inside a service area |

Until you add a service area, the full official border is live (backward compatible).

---

## Spanish Town pilot — E2E checklist

1. Open **Dash Admin → Markets → Spanish Town** → **Open map**.
2. Confirm the official green COD-AB border is visible.
3. **Edit zones → Add service area** (or town card **Add service area**).
4. Click corners to outline 1–3 neighborhoods (Pan / Space to move the map). Finish → **Save service area** (magenta on the map).
5. Repeat for additional pockets if needed. Status should read **Delivering via N service area(s)**. Official border becomes muted context.
6. Optional: **Draw non-delivery zone** inside a pocket for a temporary hazard → set Details → category.
7. Fix any conflict banners (cutouts must intersect a live service area).
8. **Publish coverage**.
9. **Test pin** inside a pocket → deliver; outside pocket but still inside old green border → blocked.
10. Customer app: same pins → same results after zones cache refresh (~1 min or hard reload).
11. Optional restore prior version if rolling back the pilot.

---

## Import GeoJSON safely

- With **no** service areas yet: import replaces / sets the official foundation (`source=import`).
- With service areas already present: you will be asked  
  - **Add as service area** (keeps official border), or  
  - **Replace official border only** (service areas stay).

Do not use legacy multi-part GeoJSON on this path — use **Import Boundaries** for official COD-AB multipart.

---

## Cutouts vs footprint

- Use **service areas** to define where you *do* deliver.
- Use **red cutouts** only for temporary blocks inside those areas (flood, protest, road closed).
- Do not try to “paint the whole town red” to leave a green island — add the island as a service area instead.
