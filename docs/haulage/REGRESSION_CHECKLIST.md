# Haulage regression checklist

Run after every haulage phase deploy. **Existing rides flows must pass unchanged.**

## Rideshare (unchanged)

- [ ] Home: quote UberX / Comfort / UberXL
- [ ] Book immediate ride; driver receives offer
- [ ] Driver accept → en route → arrived → on trip → complete
- [ ] Cash / digital payment paths unchanged

## Courier (unchanged)

- [ ] Courier service appears in vehicle picker
- [ ] Quote and book courier job

## Scheduled rides (unchanged)

- [ ] Schedule ride 30+ min ahead
- [ ] Appears in activity upcoming
- [ ] Cron dispatches near pickup window

## Haulage (new)

- [ ] `GET /v1/haulage/catalog` returns seeded categories/items
- [ ] Admin: edit variant weight; rider catalog reflects change
- [ ] Quote with 2+ items returns manifest + tier
- [ ] Book immediate haulage; driver offer shows manifest
- [ ] Book scheduled haulage; status `scheduled` until dispatch
- [ ] Stairs / prep affect quote total
- [ ] Activity shows haulage booking

## Automated

```bash
cd apps/rides-passenger && npm test
cd apps/driver && npm test
```
