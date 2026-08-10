# Warehouse product — future depth

Locked roadmap after marketplace + dual ownership land (see `WAREHOUSE_COURIER_MODEL.md`).

## Multi-courier inbox maturity
- Bulk accept / reject of courier partnership invites
- Per-courier SLAs (max dwell hours, overtime rates)
- Courier-branded packing slip templates at the dock

## Storage & handling billing (live)
- Price cards: per receive, per storage day, per handoff
- Nightly job posts `storage_day` lines into `freight.warehouse_storage_ledger`
- Invoice export to couriers (PDF / email); payment wall TBD with platform monetization

## Bin / putaway
- CRUD for `freight.warehouse_bins` (facility + code + zone) — API scaffold exists
- Putaway guided scan: receive → suggest bin → confirm
- Cycle count / location audit for floor accuracy

## Warehouse handoff → driver app
- Outbound queue: boxes ready for courier pickup from the floor
- Scan-on-load events shared with the upcoming Roam driver app
- Proof of handoff (POD-style) back to warehouse + courier custody timelines

## Product packaging
- Open warehouse signup (today invitation-only via Dominion)
- Warehouse-only subscription SKU independent of Courier
