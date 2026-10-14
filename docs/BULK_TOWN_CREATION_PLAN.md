# Bulk Town Creation — Closed

**Closed:** 2026-10-14 · verified independently against GoRide (`csfllzzastacofsvcdsc`)
**Related:** `DELIVERY_MARKETS_GEOSPATIAL_AUDIT.md` · `NON_DELIVERY_ZONES_AUDIT.md`

**Nothing left to implement.** All 131 towns exist, all three follow-ups are closed and verified.
What remains below is the standing activation checklist and the guards to re-run.

---

## Verified state

| Check | Result |
|---|---|
| Markets | **131 / 131** admin2 · 0 without a border · 0 wrong parish · 0 admin2 unmatched |
| Slugs | **0 duplicates** — parish-qualified (`may-pen-clarendon`, …). 29 names repeat; slugs disambiguate |
| Live | **2 active** (Spanish Town, Old Harbour) · 129 inactive · **0 inactive-but-published** |
| Legacy jsonb inventory | **8 rows = 8 actual** · `legacy_jsonb_zone_drift()` → **0** |
| Launch gate | all 8 return `split_border_ok: true` — *"Customers use the full border"* |
| Waitlist routing | `loadActiveMarkets` filters `is_active` → inactive towns resolve uncovered → `OutOfDeliveryPage` waitlist ✅ |
| Overview map | zoom listener + simplified display rings; towns culled below zoom 10 ✅ |
| Regressions | exclusion ties **0** · parish multipart **0** · catalog **921** · parishes **14** |

The 8 multi-part towns (Greater Montego Bay, Portmore, Hopewell, Grange Hill, Highgate, Junction,
Port Antonio Urban Centre, Downtown) are pinned in `delivery.legacy_jsonb_zone_inventory` with a
drift function that flags both a *new* truncation (`unexpected`) and one that *stops* being truncated
(`missing`). Coverage reads `geom`, so they are safe to launch.

---

## Standing: activation checklist (per town)

1. Merchants signed and live in that town
2. Couriers available
3. Run the launch gate — expect `split_border_ok: true`
   ```sql
   select name, delivery.market_launch_facts(id) from delivery.service_markets where slug = '<slug>';
   ```
4. Review the official border; narrow to a service area if it is too wide
   — Spanish Town is the pattern: **12 km² served** inside a **345 km² official district**
5. Publish coverage → then flip active

---

## Guards — re-run after any bulk change

```sql
select 'drift' k, count(*)::text v from delivery.legacy_jsonb_zone_drift()
union all select 'markets_without_border', count(*)::text from delivery.service_markets m
  where not exists (select 1 from delivery.service_zone_polygons z
                    where z.market_id=m.id and z.kind='include')
union all select 'inactive_but_published', count(*)::text from delivery.service_markets
  where not is_active and published_version_id is not null
union all select 'duplicate_slugs', count(*)::text
  from (select slug from delivery.service_markets group by slug having count(*)>1) s
union all select 'wrong_parish', count(*)::text from delivery.service_markets m
  join delivery.service_parishes p on p.id=m.parish_id
  join delivery.admin_boundaries b on b.admin_level=2 and b.pcode=m.pcode
  where b.parent_pcode <> p.pcode
union all select 'exclusions_tying_or_losing', count(*)::text
  from delivery.service_zone_polygons e
  join delivery.service_zone_polygons i on i.market_id=e.market_id and i.kind='include'
  where e.kind='exclude' and e.is_active and i.is_active
    and i.priority >= e.priority and st_intersects(e.geom, i.geom);
-- all must be 0
```

---

## Rollback (unused towns only)

```sql
-- preview first
select count(*) from delivery.service_markets
where pcode is not null and not is_active and published_version_id is null
  and pcode not in ('JM0807','JM0804');

delete from delivery.service_markets
where pcode is not null and not is_active and published_version_id is null
  and pcode not in ('JM0807','JM0804');
-- zones cascade; the pcode guard protects Spanish Town + Old Harbour
```
